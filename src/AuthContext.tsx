import React, { createContext, useContext, useState, useEffect } from 'react';
import { User } from './types';
import { db, handleFirestoreError, OperationType } from './firebase';
import { collection, onSnapshot, setDoc, doc, updateDoc } from 'firebase/firestore';
import { v4 as uuidv4 } from 'uuid';

interface AuthContextType {
  currentUser: User | null;
  users: User[];
  login: (userId: string, pin: string) => boolean;
  logout: () => void;
  isLoading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Global memory for device id during a session
let sessionDeviceId = uuidv4();

const getDeviceId = () => {
  return sessionDeviceId;
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Track users
  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'users'), (snapshot) => {
      const dbUsers: User[] = [];
      snapshot.forEach(doc => {
        dbUsers.push(doc.data() as User);
      });
      
      // Auto create admin if none exists
      if (dbUsers.length === 0) {
        const initialAdmin: User = {
          id: 'admin-1',
          name: 'Admin',
          pin: '1234',
          deviceId: '',
          lastActivity: Date.now(),
          isAdmin: true
        };
        setDoc(doc(db, 'users', 'admin-1'), initialAdmin)
          .catch(e => handleFirestoreError(e, OperationType.CREATE, 'users/admin-1'));
        dbUsers.push(initialAdmin);
      }
      
      setUsers(dbUsers);

      // We no longer rely on localStorage. If currentUser is set in memory, verify it still exists
      if (currentUser) {
        const user = dbUsers.find(u => u.id === currentUser.id);
        if (user) {
          if (user.deviceId !== getDeviceId()) {
            setCurrentUser(null);
          } else {
            setCurrentUser(user);
          }
        } else {
          setCurrentUser(null);
        }
      }
      setIsLoading(false);

    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'users');
      setIsLoading(false);
    });
    
    return () => unsub();
  }, [currentUser]);

  const login = (userId: string, pin: string) => {
    const user = users.find(u => u.id === userId && u.pin === pin);
    if (user) {
      const deviceId = getDeviceId();
      setCurrentUser(user);
      updateDoc(doc(db, 'users', userId), {
        lastActivity: Date.now(),
        deviceId: deviceId
      }).catch(e => handleFirestoreError(e, OperationType.UPDATE, `users/${userId}`));
      return true;
    }
    return false;
  };

  const logout = () => {
    if (currentUser) {
      updateDoc(doc(db, 'users', currentUser.id), {
        deviceId: ''
      }).catch(console.error);
    }
    setCurrentUser(null);
  };

  return (
    <AuthContext.Provider value={{ currentUser, users, login, logout, isLoading }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

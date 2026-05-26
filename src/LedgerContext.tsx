import React, { createContext, useContext, useState, useEffect } from 'react';
import { Ledger } from './types';
import { db, handleFirestoreError, OperationType } from './firebase';
import { collection, onSnapshot, setDoc, doc } from 'firebase/firestore';
import { v4 as uuidv4 } from 'uuid';

interface LedgerContextType {
  ledgers: Ledger[];
  activeLedger: Ledger | null;
  setActiveLedgerId: (id: string) => void;
  createLedger: (name: string, type: 'SALE' | 'PURCHASE') => Promise<void>;
  isLoading: boolean;
}

const LedgerContext = createContext<LedgerContextType | undefined>(undefined);

export const LedgerProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [ledgers, setLedgers] = useState<Ledger[]>([]);
  const [activeLedgerId, setActiveLedgerId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'ledgers'), (snapshot) => {
      const dbLedgers: Ledger[] = [];
      snapshot.forEach(d => {
        dbLedgers.push(d.data() as Ledger);
      });
      
      // Auto create a Main Ledger if none exists
      if (dbLedgers.length === 0) {
        const initialLedger: Ledger = {
          id: uuidv4(),
          name: 'Main Sales Ledger',
          type: 'SALE',
          createdAt: Date.now()
        };
        setDoc(doc(db, 'ledgers', initialLedger.id), initialLedger)
          .catch(e => handleFirestoreError(e, OperationType.CREATE, `ledgers/${initialLedger.id}`));
        dbLedgers.push(initialLedger);
      }
      
      setLedgers(dbLedgers);

      // Set active ledger safely
      if (!activeLedgerId && dbLedgers.length > 0) {
        setActiveLedgerId(dbLedgers[0].id);
      } else if (activeLedgerId && !dbLedgers.find(l => l.id === activeLedgerId) && dbLedgers.length > 0) {
        setActiveLedgerId(dbLedgers[0].id);
      }
      setIsLoading(false);
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, 'ledgers');
      setIsLoading(false);
    });
    
    return () => unsub();
  }, [activeLedgerId]);

  const createLedger = async (name: string, type: 'SALE' | 'PURCHASE') => {
    const newLedger: Ledger = {
      id: uuidv4(),
      name,
      type,
      createdAt: Date.now()
    };
    try {
      await setDoc(doc(db, 'ledgers', newLedger.id), newLedger);
      setActiveLedgerId(newLedger.id);
    } catch (e) {
      handleFirestoreError(e, OperationType.CREATE, `ledgers/${newLedger.id}`);
    }
  };

  const activeLedger = ledgers.find(l => l.id === activeLedgerId) || null;

  return (
    <LedgerContext.Provider value={{ ledgers, activeLedger, setActiveLedgerId, createLedger, isLoading }}>
      {children}
    </LedgerContext.Provider>
  );
};

export const useLedger = () => {
  const context = useContext(LedgerContext);
  if (context === undefined) {
    throw new Error('useLedger must be used within a LedgerProvider');
  }
  return context;
};

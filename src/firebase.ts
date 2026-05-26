import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "AIzaSyBkHNsqGBEfWQvVWtbHBaNM1EHGIcfwTWM",
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "lzr-greenzar.firebaseapp.com",
  databaseURL: import.meta.env.VITE_FIREBASE_DATABASE_URL || "https://lzr-greenzar-default-rtdb.firebaseio.com",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "lzr-greenzar",
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || "lzr-greenzar.firebasestorage.app",
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "192925560001",
  appId: import.meta.env.VITE_FIREBASE_APP_ID || "1:192925560001:web:367d9a225d27813bf2b840",
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID || "G-6D6D3GD437"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    operationType,
    path
  }
  console.error('Firestore Error: ', errInfo);
}

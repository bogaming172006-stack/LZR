export interface User {
  id: string;
  name: string;
  pin: string;
  deviceId: string;
  lastActivity: number;
  isAdmin: boolean;
}

export interface Ledger {
  id: string;
  name: string;
  type: 'SALE' | 'PURCHASE';
  createdAt?: number;
}

export interface Party {
  id: string;
  ledgerId: string;
  name: string;
  phone: string;
  address: string;
  openingBalance: number;
  currentDue: number;
  lastTransaction: number;
  status: 'Active' | 'Inactive';
}

export interface Transaction {
  id: string;
  ledgerId: string;
  partyId: string;
  invoiceNo: string;
  type: 'DEBIT' | 'CREDIT';
  amount: number;
  notes: string;
  timestamp: number;
}

export interface TrackedInvoice {
  id: string;
  ledgerId: string;
  invoiceNo: string;
  type: 'DEBIT' | 'CREDIT';
  timestamp: number;
}

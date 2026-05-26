import React, { useState, useEffect } from 'react';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { Transaction, Party } from '../types';
import { useLedger } from '../LedgerContext';
import { format } from 'date-fns';
import { Search, Filter } from 'lucide-react';

export default function Log() {
  const { activeLedger } = useLedger();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [parties, setParties] = useState<Record<string, Party>>({});
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'ALL' | 'DEBIT' | 'CREDIT'>('ALL');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  useEffect(() => {
    if (!activeLedger?.id) {
      setTransactions([]);
      setParties({});
      return;
    }

    const qTx = query(collection(db, 'transactions'), where('ledgerId', '==', activeLedger.id));
    const unsubTx = onSnapshot(qTx, (snapshot) => {
      setTransactions(snapshot.docs.map(d => d.data() as Transaction));
    }, e => handleFirestoreError(e, OperationType.GET, 'transactions'));

    const qParties = query(collection(db, 'parties'), where('ledgerId', '==', activeLedger.id));
    const unsubParties = onSnapshot(qParties, (snapshot) => {
      const pDict: Record<string, Party> = {};
      snapshot.forEach(d => { pDict[d.id] = d.data() as Party; });
      setParties(pDict);
    }, e => handleFirestoreError(e, OperationType.GET, 'parties'));

    return () => { unsubTx(); unsubParties(); };
  }, [activeLedger?.id]);

  if (!activeLedger) return <div className="p-8 text-center text-gray-500">Please select a ledger.</div>;

  const filtered = transactions
    .filter(tx => filter === 'ALL' || tx.type === filter)
    .filter(tx => {
      if (startDate && new Date(startDate).getTime() > tx.timestamp) return false;
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        if (end.getTime() < tx.timestamp) return false;
      }
      return true;
    })
    .filter(tx => {
      if (!search) return true;
      const lowerSearch = search.toLowerCase();
      const party = parties[tx.partyId];
      return tx.invoiceNo?.toLowerCase().includes(lowerSearch) || 
             tx.notes?.toLowerCase().includes(lowerSearch) || 
             party?.name.toLowerCase().includes(lowerSearch);
    })
    .sort((a,b) => b.timestamp - a.timestamp);

  return (
    <div className="p-4 sm:p-8 max-w-7xl mx-auto w-full pb-24 sm:pb-8">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-gray-900 tracking-tight">Day Log</h1>
        <p className="text-sm text-gray-500 mt-1">Review all global transactions for {activeLedger.name}</p>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="p-4 border-b border-gray-100 bg-gray-50/50 flex flex-col gap-4">
          <div className="flex flex-col md:flex-row gap-4 items-center justify-between w-full">
            <div className="flex bg-gray-100 p-1 rounded-md w-full md:w-auto">
              {(['ALL', 'DEBIT', 'CREDIT'] as const).map(tab => (
                <button
                  key={tab}
                  onClick={() => setFilter(tab)}
                  className={`flex-1 md:flex-none px-4 py-1.5 text-xs font-medium rounded capitalize transition-colors ${
                    filter === tab ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
                  }`}
                >
                  {tab.toLowerCase()}
                </button>
              ))}
            </div>

            <div className="relative w-full md:w-72 border bg-white rounded-md flex items-center px-3">
              <Search size={16} className="text-gray-400 min-w-4" />
              <input 
                type="text" 
                placeholder="Search invoice, notes, party..." 
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="w-full py-1.5 ml-2 bg-transparent focus:outline-none text-sm"
              />
            </div>
          </div>
          
          <div className="flex items-center gap-3">
            <div className="flex items-center">
              <label className="text-xs text-gray-500 font-medium mr-2">From</label>
              <input 
                type="date" 
                className="border border-gray-200 rounded-md px-2 py-1 text-sm bg-white text-gray-700 focus:outline-none focus:ring-1 focus:ring-sky-500"
                value={startDate}
                onChange={e => setStartDate(e.target.value)}
              />
            </div>
            <div className="flex items-center">
              <label className="text-xs text-gray-500 font-medium mr-2">To</label>
              <input 
                type="date" 
                className="border border-gray-200 rounded-md px-2 py-1 text-sm bg-white text-gray-700 focus:outline-none focus:ring-1 focus:ring-sky-500"
                value={endDate}
                onChange={e => setEndDate(e.target.value)}
              />
            </div>
            {(startDate || endDate) && (
              <button 
                onClick={() => { setStartDate(''); setEndDate(''); }}
                className="text-xs text-sky-600 hover:text-sky-800 font-medium ml-2"
              >
                Clear Dates
              </button>
            )}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-white border-b text-xs uppercase tracking-wider text-gray-500">
                <th className="p-4 font-medium">Date</th>
                <th className="p-4 font-medium">Party</th>
                <th className="p-4 font-medium">Details</th>
                <th className="p-4 font-medium text-right">Amount</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(tx => {
                const party = parties[tx.partyId];
                return (
                  <tr key={tx.id} className="border-b border-gray-50 hover:bg-gray-50 transition-colors text-sm">
                    <td className="p-4 text-gray-500 whitespace-nowrap">
                      {format(new Date(tx.timestamp), 'dd MMM yyyy')}
                      <div className="text-xs text-gray-400 mt-0.5">{format(new Date(tx.timestamp), 'HH:mm')}</div>
                    </td>
                    <td className="p-4">
                      <div className="font-medium text-gray-900">{party?.name || 'Unknown'}</div>
                    </td>
                    <td className="p-4 text-gray-600">
                      <div>{tx.notes || '-'}</div>
                      {tx.invoiceNo && <div className="text-xs font-mono text-gray-400 mt-0.5">Ref: {tx.invoiceNo}</div>}
                    </td>
                    <td className="p-4 text-right">
                      <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${tx.type === 'DEBIT' ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-700'}`}>
                        {tx.type === 'DEBIT' ? 'Dr ' : 'Cr '}
                        ₹{tx.amount.toLocaleString(undefined, {minimumFractionDigits:2})}
                      </span>
                    </td>
                  </tr>
                )
              })}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={4} className="p-8 text-center text-sm text-gray-500">
                    No transactions found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

import React, { useEffect, useState, useMemo } from 'react';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { Party, Transaction } from '../types';
import { FileUp, TrendingUp, TrendingDown, Clock } from 'lucide-react';
import { useLedger } from '../LedgerContext';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { format, subDays, startOfDay, endOfDay, parseISO } from 'date-fns';

export default function Dashboard() {
  const { activeLedger } = useLedger();
  const [parties, setParties] = useState<Party[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [filterStartDate, setFilterStartDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [filterEndDate, setFilterEndDate] = useState(format(new Date(), 'yyyy-MM-dd'));

  useEffect(() => {
    if (!activeLedger?.id) {
      setParties([]);
      setTransactions([]);
      return;
    }

    const qParties = query(collection(db, 'parties'), where('ledgerId', '==', activeLedger.id));
    const unsubParties = onSnapshot(qParties, (snapshot) => {
      setParties(snapshot.docs.map(d => d.data() as Party));
    }, e => handleFirestoreError(e, OperationType.GET, 'parties'));

    const qTx = query(collection(db, 'transactions'), where('ledgerId', '==', activeLedger.id));
    const unsubTx = onSnapshot(qTx, (snapshot) => {
      setTransactions(snapshot.docs.map(d => d.data() as Transaction));
    }, e => handleFirestoreError(e, OperationType.GET, 'transactions'));

    return () => { unsubParties(); unsubTx(); };
  }, [activeLedger?.id]);

  const chartData = useMemo(() => {
    const data = [];
    for (let i = 6; i >= 0; i--) {
      const date = subDays(new Date(), i);
      const start = startOfDay(date).getTime();
      const end = endOfDay(date).getTime();
      
      const dayTxs = transactions.filter(t => t.timestamp >= start && t.timestamp <= end);
      const debit = dayTxs.filter(t => t.type === 'DEBIT').reduce((acc, t) => acc + t.amount, 0);
      const credit = dayTxs.filter(t => t.type === 'CREDIT').reduce((acc, t) => acc + t.amount, 0);
      
      data.push({
        name: format(date, 'MMM dd'),
        debit,
        credit
      });
    }
    return data;
  }, [transactions]);

  if (!activeLedger) {
    return <div className="p-8 text-center text-gray-500">Please create or select a ledger.</div>;
  }

  const totalOutstanding = parties.filter(p => p.currentDue > 0).reduce((acc, p) => acc + p.currentDue, 0);
  
  // Filter transactions by selected date range
  const startTs = startOfDay(parseISO(filterStartDate)).getTime();
  const endTs = endOfDay(parseISO(filterEndDate || filterStartDate)).getTime();
  
  const filteredTransactions = transactions.filter(t => t.timestamp >= startTs && t.timestamp <= endTs);
  const periodDebit = filteredTransactions.filter(t => t.type === 'DEBIT').reduce((acc, t) => acc + t.amount, 0);
  const periodCredit = filteredTransactions.filter(t => t.type === 'CREDIT').reduce((acc, t) => acc + t.amount, 0);

  const isToday = filterStartDate === format(new Date(), 'yyyy-MM-dd') && filterEndDate === format(new Date(), 'yyyy-MM-dd');
  
  const debitColor = activeLedger?.type === 'PURCHASE' ? '#9333ea' : '#ef4444'; // Purple for Purchase, Red for Sales
  const creditColor = activeLedger?.type === 'PURCHASE' ? '#f59e0b' : '#10b981'; // Amber for Purchase, Green for Sales

  return (
    <div className="p-4 sm:p-8 max-w-7xl mx-auto w-full pb-24 sm:pb-8">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-8 gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900 tracking-tight">Dashboard</h1>
          <p className="text-sm text-gray-500 mt-1">Overview of {activeLedger.name}</p>
        </div>
        
        <div className="flex items-center gap-2 bg-white p-2 rounded-lg border border-gray-200 shadow-sm">
          <Clock size={16} className="text-gray-400 ml-2" />
          <input 
            type="date" 
            value={filterStartDate}
            onChange={(e) => setFilterStartDate(e.target.value)}
            className="text-sm border-none bg-transparent outline-none cursor-pointer focus:ring-0 text-gray-700"
          />
          <span className="text-gray-300">-</span>
          <input 
            type="date" 
            value={filterEndDate}
            onChange={(e) => setFilterEndDate(e.target.value)}
            min={filterStartDate}
            className="text-sm border-none bg-transparent outline-none cursor-pointer focus:ring-0 text-gray-700"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-6 mb-8">
        <div className="bg-white p-6 rounded-xl border border-gray-100 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-medium text-gray-500">Total Outstanding</h3>
            <div className="w-8 h-8 rounded-full bg-red-50 flex items-center justify-center">
              <TrendingDown className="text-red-600" size={16} />
            </div>
          </div>
          <div className="text-2xl font-bold text-gray-900">
            -₹{totalOutstanding.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
        </div>

        <div className="bg-white p-6 rounded-xl border border-gray-100 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-medium text-gray-500">{isToday ? "Today's" : "Period"} Dr ({activeLedger?.type === 'PURCHASE' ? "Payments" : "Sales"})</h3>
            <div className="w-8 h-8 rounded-full bg-blue-50 flex items-center justify-center">
              <TrendingUp className="text-blue-600" size={16} />
            </div>
          </div>
          <div className="text-2xl font-bold text-gray-900">
            ₹{periodDebit.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
        </div>

        <div className="bg-white p-6 rounded-xl border border-gray-100 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-medium text-gray-500">{isToday ? "Today's" : "Period"} Cr ({activeLedger?.type === 'PURCHASE' ? "Purchases" : "Receipts"})</h3>
            <div className="w-8 h-8 rounded-full bg-emerald-50 flex items-center justify-center">
              <TrendingUp className="text-emerald-600" size={16} />
            </div>
          </div>
          <div className="text-2xl font-bold text-gray-900">
            ₹{periodCredit.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
        <div className="lg:col-span-2 bg-white border border-gray-100 rounded-xl overflow-hidden shadow-sm p-6">
          <h2 className="text-lg font-medium text-gray-900 mb-6">7-Day Trend (Dr vs Cr)</h2>
          <div className="h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorDebit" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={debitColor} stopOpacity={0.8}/>
                    <stop offset="95%" stopColor={debitColor} stopOpacity={0}/>
                  </linearGradient>
                  <linearGradient id="colorCredit" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={creditColor} stopOpacity={0.8}/>
                    <stop offset="95%" stopColor={creditColor} stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748b' }} dy={10} />
                <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748b' }} tickFormatter={(value) => `₹${value}`} />
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                <Tooltip 
                  formatter={(value: number) => [`₹${value.toFixed(2)}`]}
                  contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)' }}
                />
                <Area type="monotone" dataKey="debit" name={activeLedger?.type === 'PURCHASE' ? "Debit (Payments)" : "Debit (Sales)"} stroke={debitColor} strokeWidth={2} fillOpacity={1} fill="url(#colorDebit)" />
                <Area type="monotone" dataKey="credit" name={activeLedger?.type === 'PURCHASE' ? "Credit (Purchases)" : "Credit (Receipts)"} stroke={creditColor} strokeWidth={2} fillOpacity={1} fill="url(#colorCredit)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-white border border-gray-100 rounded-xl overflow-hidden shadow-sm">
          <div className="p-6 border-b border-gray-100">
            <h2 className="text-lg font-medium text-gray-900">{isToday ? "Today's" : "Period"} Activity</h2>
          </div>
          <div className="p-6 h-[300px] overflow-y-auto">
            {filteredTransactions.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center text-gray-500 text-sm">
                <FileUp className="mx-auto mb-3 text-gray-300" size={32} />
                No activity recorded
              </div>
            ) : (
              <div className="space-y-4">
                {filteredTransactions.sort((a,b) => b.timestamp - a.timestamp).map(tx => {
                  const party = parties.find(p => p.id === tx.partyId);
                  return (
                    <div key={tx.id} className="flex justify-between items-center py-3 border-b border-gray-50 last:border-0 last:pb-0">
                      <div className="flex items-center">
                        <div className={`w-2 h-2 rounded-full mr-3 ${tx.type === 'DEBIT' ? 'bg-red-500' : 'bg-green-500'}`}></div>
                        <div>
                          <p className="text-sm font-medium text-gray-900">{party?.name || 'Unknown Party'}</p>
                          <p className="text-xs text-gray-500 truncate max-w-[150px]">{tx.notes || tx.invoiceNo || 'No details'}</p>
                        </div>
                      </div>
                      <div className={`text-sm font-semibold ${tx.type === 'DEBIT' ? 'text-red-600' : 'text-green-600'}`}>
                        {tx.type === 'DEBIT' ? '+' : '-'}₹{tx.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        <div className="bg-white border border-gray-100 rounded-xl overflow-hidden shadow-sm">
          <div className="p-6 border-b border-gray-100">
            <h2 className="text-lg font-medium text-gray-900">Top Outstanding (Due)</h2>
          </div>
          <div className="p-6 h-[250px] overflow-y-auto">
            {parties.filter(p => p.currentDue > 0).length === 0 ? (
              <div className="h-full flex items-center justify-center text-gray-500 text-sm">No outstanding dues</div>
            ) : (
              <div className="space-y-3">
                {parties.filter(p => p.currentDue > 0).sort((a,b) => b.currentDue - a.currentDue).slice(0, 5).map(p => (
                  <div key={p.id} className="flex justify-between items-center py-2 border-b border-gray-50 last:border-0">
                    <div>
                      <p className="text-sm font-medium text-gray-900">{p.name}</p>
                      <p className="text-xs text-gray-500">{p.phone}</p>
                    </div>
                    <div className="text-sm font-semibold text-red-600">
                      -₹{p.currentDue.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="bg-white border border-gray-100 rounded-xl overflow-hidden shadow-sm">
          <div className="p-6 border-b border-gray-100">
            <h2 className="text-lg font-medium text-gray-900">Top Advances (Credits)</h2>
          </div>
          <div className="p-6 h-[250px] overflow-y-auto">
            {parties.filter(p => p.currentDue < 0).length === 0 ? (
              <div className="h-full flex items-center justify-center text-gray-500 text-sm">No advances recorded</div>
            ) : (
              <div className="space-y-3">
                {parties.filter(p => p.currentDue < 0).sort((a,b) => a.currentDue - b.currentDue).slice(0, 5).map(p => (
                  <div key={p.id} className="flex justify-between items-center py-2 border-b border-gray-50 last:border-0">
                    <div>
                      <p className="text-sm font-medium text-gray-900">{p.name}</p>
                      <p className="text-xs text-gray-500">{p.phone}</p>
                    </div>
                    <div className="text-sm font-semibold text-green-600">
                      ₹{Math.abs(p.currentDue).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

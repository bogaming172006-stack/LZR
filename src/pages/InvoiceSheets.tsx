import React, { useState, useEffect, useRef, useMemo } from 'react';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { collection, onSnapshot, doc, setDoc, query, where, deleteDoc } from 'firebase/firestore';
import { useLedger } from '../LedgerContext';
import { TrackedInvoice, Transaction, Party } from '../types';
import { v4 as uuidv4 } from 'uuid';
import { Trash2, CheckCircle2, FileText, User, Calendar, DollarSign } from 'lucide-react';
import { Virtuoso, VirtuosoHandle } from 'react-virtuoso';

const START_INVOICE = 6000;
const END_INVOICE = 100000;
const TOTAL_INVOICES = END_INVOICE - START_INVOICE + 1;

export default function InvoiceSheets() {
  const { activeLedger } = useLedger();
  const [invoices, setInvoices] = useState<TrackedInvoice[]>([]);
  const [actualTransactions, setActualTransactions] = useState<Transaction[]>([]);
  const [parties, setParties] = useState<Record<string, Party>>({});
  const [debitInput, setDebitInput] = useState('');
  const [creditInput, setCreditInput] = useState('');
  const [alertInfo, setAlertInfo] = useState<{message: string; isError: boolean} | null>(null);

  const debitListRef = useRef<VirtuosoHandle>(null);
  const creditListRef = useRef<VirtuosoHandle>(null);

  const isSyncingRef = useRef<'DEBIT' | 'CREDIT' | null>(null);

  useEffect(() => {
    if (!activeLedger?.id) return;
    const q1 = query(collection(db, 'tracked_invoices'), where('ledgerId', '==', activeLedger.id));
    const unsub1 = onSnapshot(q1, (snapshot) => {
      setInvoices(snapshot.docs.map(d => d.data() as TrackedInvoice));
    });
    
    const q2 = query(collection(db, 'transactions'), where('ledgerId', '==', activeLedger.id));
    const unsub2 = onSnapshot(q2, (snapshot) => {
      setActualTransactions(snapshot.docs.map(d => d.data() as Transaction));
    });

    const q3 = query(collection(db, 'parties'), where('ledgerId', '==', activeLedger.id));
    const unsub3 = onSnapshot(q3, (snapshot) => {
      const partyMap: Record<string, Party> = {};
      snapshot.docs.forEach(doc => {
        partyMap[doc.id] = doc.data() as Party;
      });
      setParties(partyMap);
    });

    return () => { unsub1(); unsub2(); unsub3(); };
  }, [activeLedger?.id]);

  const handleSearch = (e: React.FormEvent, type: 'DEBIT' | 'CREDIT') => {
    e.preventDefault();
    const inputVal = type === 'DEBIT' ? debitInput : creditInput;
    const trimmed = inputVal.trim();
    const numVal = parseInt(trimmed, 10);
    
    if (!isNaN(numVal) && numVal >= START_INVOICE && numVal <= END_INVOICE) {
      if (type === 'DEBIT') {
        debitListRef.current?.scrollToIndex({ index: numVal - START_INVOICE, align: 'center', behavior: 'smooth' });
      } else {
        creditListRef.current?.scrollToIndex({ index: numVal - START_INVOICE, align: 'center', behavior: 'smooth' });
      }
    }
  };

  const handleMark = async (invoiceNo: string, type: 'DEBIT' | 'CREDIT') => {
    if (!activeLedger?.id) return;
    
    const existsSameTypeTracked = invoices.find(i => i.type === type && i.invoiceNo === invoiceNo);
    const existsSameTypeTx = actualTransactions.find(t => t.type === type && (t.invoiceNo === invoiceNo || t.invoiceNo?.endsWith(invoiceNo)));

    if (existsSameTypeTracked || existsSameTypeTx) {
      setAlertInfo({ 
        message: `Invoice ${invoiceNo} is already entered in the ${type === 'DEBIT' ? 'Debit' : 'Credit'} sheet${existsSameTypeTx ? ' via Master Entry' : ''}!`, 
        isError: true 
      });
      return;
    }

    const oppositeType = type === 'DEBIT' ? 'CREDIT' : 'DEBIT';
    const existsOppositeTypeTracked = invoices.find(i => i.type === oppositeType && i.invoiceNo === invoiceNo);
    const existsOppositeTypeTx = actualTransactions.find(t => t.type === oppositeType && (t.invoiceNo === invoiceNo || t.invoiceNo?.endsWith(invoiceNo)));
    
    const isMatch = existsOppositeTypeTracked || existsOppositeTypeTx;

    const newInvoice: TrackedInvoice = {
      id: `${activeLedger.id}_${type}_${invoiceNo}`,
      ledgerId: activeLedger.id,
      invoiceNo: invoiceNo,
      type,
      timestamp: Date.now()
    };

    try {
      await setDoc(doc(db, 'tracked_invoices', newInvoice.id), newInvoice);
      
      if (isMatch) {
         setAlertInfo({ 
           message: `Match! Invoice ${invoiceNo} is now entered in BOTH Debit and Credit sheets.`, 
           isError: false 
         });
      }
    } catch (e) {
      handleFirestoreError(e, OperationType.CREATE, 'tracked_invoices');
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'tracked_invoices', id));
    } catch (e) {
      handleFirestoreError(e, OperationType.DELETE, `tracked_invoices/${id}`);
    }
  };

  if (!activeLedger) return <div className="p-8 text-center text-gray-500">Please select a ledger.</div>;

  type CombinedEntry = { id: string, source: 'tracked' | 'tx', invoiceNo: string, transaction?: Transaction };

  const { debitMap, creditMap, visibleInvoices, debitCount, creditCount } = useMemo(() => {
    const debitTracked = invoices.filter(i => i.type === 'DEBIT');
    const creditTracked = invoices.filter(i => i.type === 'CREDIT');
    const debitTx = actualTransactions.filter(t => t.type === 'DEBIT' && t.invoiceNo);
    const creditTx = actualTransactions.filter(t => t.type === 'CREDIT' && t.invoiceNo);

    const dMap = new Map<string, CombinedEntry>();
    const cMap = new Map<string, CombinedEntry>();

    const pop = (map: Map<string, CombinedEntry>, tracked: TrackedInvoice[], txs: Transaction[]) => {
      tracked.forEach(i => map.set(i.invoiceNo, { id: i.id, source: 'tracked', invoiceNo: i.invoiceNo }));
      txs.forEach(t => {
        if (t.invoiceNo) {
          map.set(t.invoiceNo, { id: t.id, source: 'tx', invoiceNo: t.invoiceNo, transaction: t });
          const match = t.invoiceNo.match(/\d+$/);
          if (match) {
            map.set(match[0], { id: t.id, source: 'tx', invoiceNo: t.invoiceNo, transaction: t });
          }
        }
      });
    };

    pop(dMap, debitTracked, debitTx);
    pop(cMap, creditTracked, creditTx);

    const list: string[] = [];
    for (let i = START_INVOICE; i <= END_INVOICE; i++) {
      const invStr = i.toString();
      list.push(invStr);
    }
    return { debitMap: dMap, creditMap: cMap, visibleInvoices: list, debitCount: dMap.size, creditCount: cMap.size };
  }, [invoices, actualTransactions]);

  const renderRow = (index: number, invoiceNum: string, map: Map<string, CombinedEntry>, type: 'DEBIT' | 'CREDIT') => {
    const entry = map.get(invoiceNum);
    const isTracked = !!entry;
    const isTx = entry?.source === 'tx';
    const tx = entry?.transaction;
    const party = tx ? parties[tx.partyId] : null;

    return (
      <div className={`flex items-center justify-between p-3 border-b border-gray-100 ${isTracked ? (type === 'DEBIT' ? 'bg-red-50' : 'bg-emerald-50') : 'bg-white'} hover:bg-gray-50 transition-colors`}>
        <div className="flex items-center space-x-4 flex-1">
          <span className={`font-mono font-medium ${isTracked ? 'text-gray-900' : 'text-gray-400'}`}>
            {invoiceNum}
          </span>
          {isTracked && (
            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full flex items-center gap-1 ${type === 'DEBIT' ? (isTx ? 'bg-red-600 text-white' : 'bg-red-100 text-red-700') : (isTx ? 'bg-emerald-600 text-white' : 'bg-emerald-100 text-emerald-700')}`}>
               {isTx && <FileText size={12} />}
               {isTx ? 'In Master' : 'Entered'}
            </span>
          )}
          {isTx && tx && party && (
             <div className="hidden sm:flex ml-4 items-center gap-4 text-xs font-medium text-gray-600">
               <span className="flex items-center gap-1 text-gray-800"><User size={14} className="text-gray-500"/> <span className="truncate max-w-[120px]">{party.name}</span></span>
               <span className="flex items-center gap-1"><Calendar size={14} className="text-gray-500"/> {new Date(tx.timestamp).toLocaleDateString()}</span>
               <span className="flex items-center gap-1 text-gray-900"><DollarSign size={14} className="text-gray-500"/> {tx.amount.toFixed(2)}</span>
             </div>
          )}
        </div>
        {isTracked ? (
          <button disabled={isTx} onClick={() => !isTx && handleDelete(entry.id)} className={`p-1 transition-colors flex-shrink-0 ${isTx ? 'text-gray-300 cursor-not-allowed' : 'text-gray-400 hover:text-red-600'}`} aria-label={isTx ? 'Cannot delete master entry here' : 'Delete invoice'}>
            <Trash2 size={16} />
          </button>
        ) : (
          <button onClick={() => handleMark(invoiceNum, type)} className={`p-1 transition-colors flex-shrink-0 text-gray-300 hover:${type === 'DEBIT' ? 'text-red-600' : 'text-emerald-600'}`} aria-label="Mark entered">
            <CheckCircle2 size={16} />
          </button>
        )}
      </div>
    );
  };

  return (
    <div className="p-4 sm:p-8 max-w-7xl mx-auto w-full pb-24 sm:pb-8">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-gray-900 tracking-tight">Invoice Sheets</h1>
        <p className="text-sm text-gray-500 mt-1">Rapid entry and tracking for Invoice Numbers ({START_INVOICE} to {END_INVOICE})</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Debit Sheet */}
        <div className="bg-white rounded-xl shadow-sm border border-red-100 overflow-hidden flex flex-col h-[70vh]">
          <div className="p-4 border-b border-red-100 bg-red-50/50">
            <h2 className="font-semibold text-red-700 flex items-center justify-between">
              <span>Debit Sheet (Sales)</span>
              <span className="text-xs bg-red-100 px-2 py-1 rounded-full">{debitCount} entered</span>
            </h2>
          </div>
          <div className="p-4 border-b border-gray-100">
            <form onSubmit={e => handleSearch(e, 'DEBIT')} className="flex space-x-2">
              <input 
                type="number" 
                value={debitInput} 
                onChange={e => setDebitInput(e.target.value)} 
                placeholder={`Search invoice no (e.g. ${START_INVOICE})...`} 
                className="flex-1 px-3 py-2 border rounded-md focus:outline-none focus:ring-1 focus:ring-red-500 text-sm"
              />
              <button type="submit" className="px-4 py-2 bg-gray-100 text-gray-700 text-sm font-medium rounded-md hover:bg-gray-200 transition-colors">
                Find / Scroll
              </button>
            </form>
          </div>
          <div className="flex-1 bg-gray-50/30 min-h-0 relative">
            <div className="absolute inset-0">
              <Virtuoso
                ref={debitListRef}
                data={visibleInvoices}
                itemContent={(index, invoiceNum) => renderRow(index, invoiceNum, debitMap, 'DEBIT')}
                style={{ height: '100%', width: '100%' }}
                className="custom-scrollbar"
                onScroll={(e) => {
                  if (isSyncingRef.current === 'CREDIT') return;
                  isSyncingRef.current = 'DEBIT';
                  const target = e.target as HTMLElement;
                  creditListRef.current?.scrollTo({ top: target.scrollTop });
                  
                  // Reset sync lock after a short delay
                  setTimeout(() => { if (isSyncingRef.current === 'DEBIT') isSyncingRef.current = null; }, 50);
                }}
              />
            </div>
          </div>
        </div>

        {/* Credit Sheet */}
        <div className="bg-white rounded-xl shadow-sm border border-emerald-100 overflow-hidden flex flex-col h-[70vh]">
          <div className="p-4 border-b border-emerald-100 bg-emerald-50/50">
            <h2 className="font-semibold text-emerald-700 flex items-center justify-between">
              <span>Credit Sheet (Receipts)</span>
              <span className="text-xs bg-emerald-100 px-2 py-1 rounded-full">{creditCount} entered</span>
            </h2>
          </div>
          <div className="p-4 border-b border-gray-100">
            <form onSubmit={e => handleSearch(e, 'CREDIT')} className="flex space-x-2">
              <input 
                type="number" 
                value={creditInput} 
                onChange={e => setCreditInput(e.target.value)} 
                placeholder={`Search invoice no (e.g. ${START_INVOICE})...`} 
                className="flex-1 px-3 py-2 border rounded-md focus:outline-none focus:ring-1 focus:ring-emerald-500 text-sm"
              />
              <button type="submit" className="px-4 py-2 bg-gray-100 text-gray-700 text-sm font-medium rounded-md hover:bg-gray-200 transition-colors">
                Find / Scroll
              </button>
            </form>
          </div>
          <div className="flex-1 bg-gray-50/30 min-h-0 relative">
            <div className="absolute inset-0">
              <Virtuoso
                ref={creditListRef}
                data={visibleInvoices}
                itemContent={(index, invoiceNum) => renderRow(index, invoiceNum, creditMap, 'CREDIT')}
                style={{ height: '100%', width: '100%' }}
                className="custom-scrollbar"
                onScroll={(e) => {
                  if (isSyncingRef.current === 'DEBIT') return;
                  isSyncingRef.current = 'CREDIT';
                  const target = e.target as HTMLElement;
                  debitListRef.current?.scrollTo({ top: target.scrollTop });

                  setTimeout(() => { if (isSyncingRef.current === 'CREDIT') isSyncingRef.current = null; }, 50);
                }}
              />
            </div>
          </div>
        </div>
      </div>

      {alertInfo && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm overflow-hidden transform transition-all">
            <div className={`p-4 border-b ${alertInfo.isError ? 'border-red-100 bg-red-50' : 'border-sky-100 bg-sky-50'}`}>
              <h3 className={`font-semibold text-lg flex items-center ${alertInfo.isError ? 'text-red-700' : 'text-sky-700'}`}>
                {alertInfo.isError ? 'Duplicate Entry' : 'Invoice Matched'}
              </h3>
            </div>
            <div className="p-6">
              <p className="text-gray-700 text-sm font-medium">{alertInfo.message}</p>
            </div>
            <div className="p-4 border-t bg-gray-50 flex justify-end">
              <button 
                onClick={() => setAlertInfo(null)}
                className={`px-6 py-2 text-white rounded-md font-medium transition-colors ${alertInfo.isError ? 'bg-red-600 hover:bg-red-700' : 'bg-sky-600 hover:bg-sky-700'}`}
              >
                Okay
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

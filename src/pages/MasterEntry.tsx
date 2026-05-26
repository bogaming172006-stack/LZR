import React, { useState, useEffect, useRef } from 'react';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { collection, onSnapshot, doc, setDoc, updateDoc, getDocs, query, orderBy, limit, where } from 'firebase/firestore';
import { Party, Transaction } from '../types';
import { useLedger } from '../LedgerContext';
import { v4 as uuidv4 } from 'uuid';
import { Search } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export default function MasterEntry() {
  const { activeLedger } = useLedger();
  const navigate = useNavigate();
  const [parties, setParties] = useState<Party[]>([]);
  const [partySearch, setPartySearch] = useState('');
  const [selectedParty, setSelectedParty] = useState<Party | null>(null);
  
  const [type, setType] = useState<'DEBIT' | 'CREDIT'>('DEBIT');
  const [amount, setAmount] = useState('');
  const [invoiceNo, setInvoiceNo] = useState('');
  const [notes, setNotes] = useState('');
  
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const isSaleLedger = activeLedger?.type === 'SALE';

  useEffect(() => {
    if (!activeLedger?.id) return;
    const qParties = query(collection(db, 'parties'), where('ledgerId', '==', activeLedger.id));
    const unsub = onSnapshot(qParties, (snapshot) => {
      setParties(snapshot.docs.map(d => d.data() as Party));
    });
    
    setInvoiceNo('');
    
    return () => unsub();
  }, [activeLedger?.id, isSaleLedger]);

  const filteredParties = parties.filter(p => p.name.toLowerCase().includes(partySearch.toLowerCase()) || p.phone.includes(partySearch));

  const [alertInfo, setAlertInfo] = useState<{message: string; isError: boolean} | null>(null);

  const invoiceRef = useRef<HTMLInputElement>(null);
  const partySearchRef = useRef<HTMLInputElement>(null);
  const amountRef = useRef<HTMLInputElement>(null);
  const notesRef = useRef<HTMLTextAreaElement>(null);
  const confirmBtnRef = useRef<HTMLButtonElement>(null);

  const [searchSelectedIndex, setSearchSelectedIndex] = useState(0);

  useEffect(() => {
    if (activeLedger && invoiceRef.current) {
      setTimeout(() => invoiceRef.current?.focus(), 100);
    }
  }, [activeLedger?.id]);

  useEffect(() => {
    if (showConfirmModal && confirmBtnRef.current) {
      setTimeout(() => confirmBtnRef.current?.focus(), 100);
    }
  }, [showConfirmModal]);

  useEffect(() => {
    setSearchSelectedIndex(0);
  }, [partySearch]);

  const handleInvoiceKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (!selectedParty) {
        partySearchRef.current?.focus();
      } else {
        amountRef.current?.focus();
      }
    }
  };

  const handlePartySearchKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSearchSelectedIndex(prev => Math.min(prev + 1, filteredParties.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSearchSelectedIndex(prev => Math.max(prev - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (filteredParties.length > 0 && searchSelectedIndex >= 0) {
        setSelectedParty(filteredParties[searchSelectedIndex]);
        setPartySearch('');
        setSearchSelectedIndex(0);
        setTimeout(() => amountRef.current?.focus(), 10);
      }
    }
  };

  const handleAmountKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      notesRef.current?.focus();
    }
  };

  const handleNotesKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      // Only submit if amount and party are selected
      if (selectedParty && amount && !isNaN(Number(amount)) && Number(amount) > 0) {
        handlePreSubmit(e as any);
      }
    }
  };

  const handleInvoiceCheck = async (isPreSubmit: boolean): Promise<boolean> => {
    if (!invoiceNo || !activeLedger) return true;
    try {
      const qTracked = query(collection(db, 'tracked_invoices'), where('ledgerId', '==', activeLedger.id), where('invoiceNo', '==', invoiceNo));
      const trackedSnap = await getDocs(qTracked);
      const trackedDocs = trackedSnap.docs.map(d => d.data());
      
      const qTx = query(collection(db, 'transactions'), where('ledgerId', '==', activeLedger.id));
      const txSnap = await getDocs(qTx);
      const matchedTxs = txSnap.docs
        .map(d => d.data() as Transaction)
        .filter(t => t.invoiceNo === invoiceNo || t.invoiceNo?.endsWith(invoiceNo));

      const debitTx = matchedTxs.find(t => t.type === 'DEBIT');
      const creditTx = matchedTxs.find(t => t.type === 'CREDIT');
      
      const debitTracked = trackedDocs.find(t => t.type === 'DEBIT');
      const creditTracked = trackedDocs.find(t => t.type === 'CREDIT');

      const hasDebit = !!(debitTx || debitTracked);
      const hasCredit = !!(creditTx || creditTracked);

      if (!hasDebit && !hasCredit) return true; // Not listed yet, all good

      const formatTxDetails = (tx: Transaction | undefined, tTracked: any | undefined): string => {
        if (tx) {
           const pt = parties.find(p => p.id === tx.partyId);
           const pName = pt ? pt.name : 'Unknown Party';
           const dateStr = new Date(tx.timestamp).toLocaleDateString();
           return `Party: ${pName}\nAmount: ₹${tx.amount.toFixed(2)}\nDate: ${dateStr}`;
        }
        if (tTracked) {
           const dateStr = new Date(tTracked.timestamp).toLocaleDateString();
           return `Marked directly in Invoice Sheet\nDate: ${dateStr}`;
        }
        return 'Not entered';
      };

      if (hasDebit && hasCredit) {
         setAlertInfo({ 
           message: `This invoice ID is already in both sheets.\nBoth are listed. You cannot use this invoice number again.\n\n-- DEBIT ENTRY --\n${formatTxDetails(debitTx, debitTracked)}\n\n-- CREDIT ENTRY --\n${formatTxDetails(creditTx, creditTracked)}`, 
           isError: true 
         });
         return false;
      }

      const currentHasMatch = type === 'DEBIT' ? hasDebit : hasCredit;

      if (currentHasMatch) {
         if (type === 'DEBIT' && !hasCredit) {
             setType('CREDIT');
             setAlertInfo({ 
               message: `This invoice ID is already listed in the DEBIT sheet.\nAvailable to CREDIT.\nAutomatically switched to CREDIT.\n\n-- DEBIT ENTRY --\n${formatTxDetails(debitTx, debitTracked)}`, 
               isError: false 
             });
         } else if (type === 'CREDIT' && !hasDebit) {
             setType('DEBIT');
             setAlertInfo({ 
               message: `This invoice ID is already listed in the CREDIT sheet.\nAvailable to DEBIT.\nAutomatically switched to DEBIT.\n\n-- CREDIT ENTRY --\n${formatTxDetails(creditTx, creditTracked)}`, 
               isError: false 
             });
         }
         return false; // Requires review since type was switched automatically
      }
      return true;
    } catch (err) {
      console.error("Error validating invoice", err);
      return true;
    }
  };

  const handleInvoiceBlur = async () => {
    await handleInvoiceCheck(false);
  };

  const checkInvoice = async () => {
    return await handleInvoiceCheck(true);
  };

  const handlePreSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (invoiceNo && activeLedger) {
      const isOk = await checkInvoice();
      if (!isOk) return;
    }

    if (!selectedParty) {
      setAlertInfo({ message: "Please select a party first.", isError: true });
      return;
    }
    if (!amount || isNaN(Number(amount)) || Number(amount) <= 0) {
      setAlertInfo({ message: "Please enter a valid amount.", isError: true });
      return;
    }

    setShowConfirmModal(true);
  };

  const handleConfirmSubmit = async () => {
    if (!selectedParty || !amount || !activeLedger) return;
    setIsSubmitting(true);
    
    try {
      const numAmount = parseFloat(amount);
      const txId = uuidv4();
      const newTx: Transaction = {
        id: txId,
        partyId: selectedParty.id,
        ledgerId: activeLedger.id,
        invoiceNo,
        type,
        amount: numAmount,
        timestamp: Date.now(),
        notes
      };

      await setDoc(doc(db, 'transactions', txId), newTx);
      
      const balanceChange = type === 'DEBIT' ? numAmount : -numAmount;
      const newBalance = selectedParty.currentDue + balanceChange;
      
      await updateDoc(doc(db, 'parties', selectedParty.id), {
        currentDue: newBalance,
        lastTransaction: Date.now()
      });

      // Reset form
      setAmount('');
      setNotes('');
      setSelectedParty(null);
      setPartySearch('');
      setShowConfirmModal(false);
      setInvoiceNo('');

      setTimeout(() => {
        if (invoiceRef.current) {
          invoiceRef.current.focus();
        }
      }, 100);
      
    } catch (e) {
      handleFirestoreError(e, OperationType.CREATE, 'transactions');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!activeLedger) return <div className="p-8 text-center text-gray-500">Please select a ledger.</div>;

  return (
    <div className="p-4 sm:p-8 max-w-3xl mx-auto w-full pb-24 sm:pb-8">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-gray-900 tracking-tight">Master Entry</h1>
        <p className="text-sm text-gray-500 mt-1">Log a transaction to {activeLedger.name}</p>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden p-6 text-sm">
        <form onSubmit={handlePreSubmit} className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Transaction Type</label>
              <div className="flex bg-gray-100 p-1 rounded-md">
                <button
                  type="button"
                  onClick={() => setType('DEBIT')}
                  className={`flex-1 py-2 text-sm font-medium rounded-md transition-colors ${type === 'DEBIT' ? 'bg-white text-red-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                >
                  DEBIT
                </button>
                <button
                  type="button"
                  onClick={() => setType('CREDIT')}
                  className={`flex-1 py-2 text-sm font-medium rounded-md transition-colors ${type === 'CREDIT' ? 'bg-white text-emerald-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                >
                  CREDIT
                </button>
              </div>
            </div>

              {isSaleLedger ? (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Invoice No</label>
                  <input ref={invoiceRef} type="text" value={invoiceNo} onKeyDown={handleInvoiceKeyDown} onBlur={handleInvoiceBlur} onChange={e => setInvoiceNo(e.target.value)} className="w-full px-3 py-2 border rounded-md focus:border-sky-500 focus:ring-1 focus:ring-sky-500" />
                </div>
              ) : (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Reference (Optional)</label>
                  <input ref={invoiceRef} type="text" value={invoiceNo} onKeyDown={handleInvoiceKeyDown} onBlur={handleInvoiceBlur} onChange={e => setInvoiceNo(e.target.value)} className="w-full px-3 py-2 border rounded-md focus:border-sky-500 focus:ring-1 focus:ring-sky-500" placeholder="e.g. REF-123" />
                </div>
              )}
          </div>

          <div className="relative">
            <label className="block text-sm font-medium text-gray-700 mb-1">Select Party</label>
            {!selectedParty ? (
              <div className="relative">
                <Search className="absolute left-3 top-2.5 text-gray-400" size={16} />
                <input
                  type="text"
                  ref={partySearchRef}
                  placeholder="Search party by name or phone..."
                  value={partySearch}
                  onChange={e => setPartySearch(e.target.value)}
                  onKeyDown={handlePartySearchKeyDown}
                  className="w-full pl-9 pr-3 py-2 border rounded-md focus:border-sky-500 focus:ring-1 focus:ring-sky-500"
                />
                
                {partySearch && (
                  <div className="absolute z-10 w-full mt-1 bg-white border border-gray-200 rounded-md shadow-lg max-h-48 overflow-y-auto">
                    {filteredParties.length > 0 ? (
                      filteredParties.map((p, idx) => (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => { 
                            setSelectedParty(p); 
                            setPartySearch(''); 
                            setTimeout(() => amountRef.current?.focus(), 10);
                          }}
                          className={`w-full text-left px-4 py-2 flex justify-between items-center ${idx === searchSelectedIndex ? 'bg-sky-50 border-l-4 border-sky-500' : 'hover:bg-gray-50'}`}
                        >
                          <span className="font-medium text-gray-900">{p.name}</span>
                          <span className="text-gray-500 text-xs">{p.phone}</span>
                        </button>
                      ))
                    ) : (
                      <div className="px-4 py-2 text-gray-500 text-sm">No parties found.</div>
                    )}
                  </div>
                )}
              </div>
            ) : (
              <div className="flex items-center justify-between p-3 border rounded-md bg-sky-50/50">
                <div>
                  <div className="font-medium text-sky-900">{selectedParty.name}</div>
                  <div className="text-xs text-sky-700 mt-0.5">Balance: <span className="font-semibold">{selectedParty.currentDue > 0 ? `-₹${selectedParty.currentDue.toFixed(2)}` : `₹${Math.abs(selectedParty.currentDue).toFixed(2)}`}</span></div>
                </div>
                <button type="button" onClick={() => { setSelectedParty(null); setTimeout(() => partySearchRef.current?.focus(), 10); }} className="text-sky-600 text-sm hover:text-sky-800 font-medium">Change</button>
              </div>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Amount</label>
            <div className="relative">
              <span className="absolute left-3 top-2 text-gray-500 font-medium">₹</span>
              <input ref={amountRef} onKeyDown={handleAmountKeyDown} type="number" step="0.01" min="0.01" value={amount} onChange={e => setAmount(e.target.value)} className="w-full pl-8 pr-3 py-2 border rounded-md focus:border-sky-500 focus:ring-1 focus:ring-sky-500 font-medium" placeholder="0.00" />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Notes (Optional)</label>
            <textarea ref={notesRef} onKeyDown={handleNotesKeyDown} value={notes} onChange={e => setNotes(e.target.value)} className="w-full px-3 py-2 border rounded-md focus:border-sky-500 focus:ring-1 focus:ring-sky-500" rows={2}></textarea>
          </div>

          <div className="pt-4 border-t border-gray-100 flex justify-end">
            <button
              type="submit"
              className="px-6 py-2.5 bg-sky-600 text-white rounded-md font-medium hover:bg-sky-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Review Transaction
            </button>
          </div>
        </form>
      </div>

      {showConfirmModal && selectedParty && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm overflow-hidden text-sm">
            <div className="p-4 border-b">
              <h3 className="font-semibold text-lg text-gray-900">Confirm Entry</h3>
            </div>
            <div className="p-6 space-y-4">
              <div className="flex justify-between">
                <span className="text-gray-500">Party</span>
                <span className="font-semibold text-gray-900">{selectedParty.name}</span>
              </div>
              {(isSaleLedger || invoiceNo) && (
                <div className="flex justify-between">
                  <span className="text-gray-500">{isSaleLedger ? 'Invoice No' : 'Reference'}</span>
                  <span className="font-medium text-gray-900">{invoiceNo || '-'}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-gray-500">Type</span>
                <span className={`font-bold ${type === 'DEBIT' ? 'text-red-600' : 'text-emerald-600'}`}>{type}</span>
              </div>
              <div className="flex justify-between pt-2 border-t">
                <span className="text-gray-500 font-medium">Amount</span>
                <span className="font-bold text-lg text-gray-900">₹{parseFloat(amount).toFixed(2)}</span>
              </div>
            </div>
            <div className="p-4 border-t bg-gray-50 flex justify-end space-x-2">
              <button 
                onClick={() => setShowConfirmModal(false)}
                disabled={isSubmitting}
                className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-md font-medium"
              >
                Cancel
              </button>
              <button 
                ref={confirmBtnRef}
                onClick={handleConfirmSubmit}
                disabled={isSubmitting}
                className={`px-4 py-2 text-white rounded-md font-medium ${type === 'DEBIT' ? 'bg-red-600 hover:bg-red-700' : 'bg-emerald-600 hover:bg-emerald-700'} ${isSubmitting ? 'opacity-50' : ''}`}
              >
                {isSubmitting ? 'Saving...' : 'Confirm & Save'}
              </button>
            </div>
          </div>
        </div>
      )}

      {alertInfo && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm overflow-hidden transform transition-all">
            <div className={`p-4 border-b ${alertInfo.isError ? 'border-red-100 bg-red-50' : 'border-sky-100 bg-sky-50'}`}>
              <h3 className={`font-semibold text-lg flex items-center ${alertInfo.isError ? 'text-red-700' : 'text-sky-700'}`}>
                {alertInfo.isError ? 'Duplicate Entry' : 'Notice'}
              </h3>
            </div>
            <div className="p-6">
              <p className="text-gray-700 text-sm font-medium whitespace-pre-wrap">{alertInfo.message}</p>
            </div>
            <div className="p-4 border-t bg-gray-50 flex justify-end">
              <button 
                autoFocus
                onClick={() => {
                  setAlertInfo(null);
                  setTimeout(() => {
                    if (document.activeElement === document.body || !document.activeElement) {
                       if (alertInfo.isError) {
                         invoiceRef.current?.focus();
                       } else {
                         partySearchRef.current?.focus();
                       }
                    }
                  }, 50);
                }}
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

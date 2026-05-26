import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { doc, getDoc, collection, query, where, onSnapshot, setDoc, updateDoc } from 'firebase/firestore';
import { Party, Transaction } from '../types';
import { ArrowLeft, Download, Plus, Minus, FileText, Edit2 } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { format } from 'date-fns';
import { useLedger } from '../LedgerContext';
import { useAuth } from '../AuthContext';

export default function PartyDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { activeLedger } = useLedger();
  const { currentUser } = useAuth();
  const [party, setParty] = useState<Party | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [showTxModal, setShowTxModal] = useState<'DEBIT' | 'CREDIT' | null>(null);
  const [editingTx, setEditingTx] = useState<Transaction | null>(null);
  const [showDownloadModal, setShowDownloadModal] = useState(false);
  const [downloadStartDate, setDownloadStartDate] = useState(format(new Date(), 'yyyy-MM-01'));
  const [downloadEndDate, setDownloadEndDate] = useState(format(new Date(), 'yyyy-MM-dd'));

  useEffect(() => {
    if (!id) return;
    const unsubParty = onSnapshot(doc(db, 'parties', id), (docSnapshot) => {
      if (docSnapshot.exists()) {
        setParty(docSnapshot.data() as Party);
      }
    }, (error) => handleFirestoreError(error, OperationType.GET, `parties/${id}`));

    const q = query(collection(db, 'transactions'), where('partyId', '==', id));
    const unsubTx = onSnapshot(q, (querySnapshot) => {
      setTransactions(querySnapshot.docs.map(d => d.data() as Transaction));
    }, (error) => handleFirestoreError(error, OperationType.LIST, 'transactions'));

    return () => { unsubParty(); unsubTx(); };
  }, [id]);

  const sortedTx = [...transactions].sort((a, b) => a.timestamp - b.timestamp);

  const calculateRunningBalance = () => {
    if (!party) return [];
    let currentBalance = party.openingBalance;
    return sortedTx.map(tx => {
      if (tx.type === 'DEBIT') { // Add to due
        currentBalance += tx.amount;
      } else { // Subtract from due
        currentBalance -= tx.amount;
      }
      return { ...tx, runningBalance: currentBalance };
    });
  };

  const txWithBalance = calculateRunningBalance();

  const generatePdf = (e: React.FormEvent) => {
    e.preventDefault();
    if (!party) return;
    const doc = new jsPDF();

    const startTs = new Date(downloadStartDate).setHours(0, 0, 0, 0);
    const endTs = new Date(downloadEndDate).setHours(23, 59, 59, 999);
    
    const filteredTx = txWithBalance.filter(tx => tx.timestamp >= startTs && tx.timestamp <= endTs);
    
    // Find the running balance before the start date
    let periodOpeningBalance = party.openingBalance;
    const priorTx = txWithBalance.filter(tx => tx.timestamp < startTs);
    if (priorTx.length > 0) {
      periodOpeningBalance = priorTx[priorTx.length - 1].runningBalance;
    }
    
    // Header (Centered)
    doc.setTextColor(15, 23, 42); // slate 900
    doc.setFontSize(26);
    doc.setFont('helvetica', 'bold');
    doc.text('GREENZAR', 105, 20, { align: 'center' });
    
    doc.setTextColor(2, 132, 199); // sky 600
    doc.setFontSize(10);
    doc.text('FOOD & BEVERAGE', 105, 26, { align: 'center' });
    
    doc.setTextColor(100, 116, 139); // slate 500
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.text('Jhampa, Deganga, North 24 PGS | West Bengal, PIN.-743423 | Ph: 9476156298', 105, 32, { align: 'center' });
    
    // Sub Header
    doc.setTextColor(15, 23, 42);
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text('ACCOUNT STATEMENT', 105, 46, { align: 'center' });
    
    const startDateStr = format(new Date(downloadStartDate), 'yyyy-MM-dd');
    const endDateStr = format(new Date(downloadEndDate), 'yyyy-MM-dd');
    doc.setTextColor(100, 116, 139);
    doc.setFontSize(10);
    doc.text(`PERIOD: ${startDateStr} to ${endDateStr}`, 105, 54, { align: 'center' });
    
    doc.setTextColor(2, 132, 199);
    doc.text(`PARTY: ${party.name.toUpperCase()}`, 105, 60, { align: 'center' });
    
    doc.setTextColor(100, 116, 139);
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(8);
    doc.text('This statement Syestem Generated', 105, 66, { align: 'center' });
    
    // Party Details
    doc.setTextColor(15, 23, 42);
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.text('Bill To:', 14, 80);
    doc.setFontSize(14);
    doc.text(party.name, 14, 86);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text(`Phone: ${party.phone}`, 14, 92);
    if (party.address) {
      doc.text(`Address: ${party.address}`, 14, 98);
    }
    
    const startY = party.address ? 104 : 98;

    const body = filteredTx.map(tx => [
      format(new Date(tx.timestamp), 'dd MMM yyyy'),
      tx.invoiceNo || tx.notes || '-',
      tx.type,
      tx.amount.toFixed(2),
      (tx.runningBalance > 0 ? `-${tx.runningBalance.toFixed(2)}` : Math.abs(tx.runningBalance).toFixed(2))
    ]);

    // Insert Opening Balance row at the top
    body.unshift([
      '-',
      'Opening Balance',
      periodOpeningBalance > 0 ? 'DEBIT' : periodOpeningBalance < 0 ? 'CREDIT' : '-',
      Math.abs(periodOpeningBalance).toFixed(2),
      (periodOpeningBalance > 0 ? `-${periodOpeningBalance.toFixed(2)}` : Math.abs(periodOpeningBalance).toFixed(2))
    ]);

    autoTable(doc, {
      startY: startY,
      head: [['Date', 'Invoice', 'Type', 'Amount', 'Balance']],
      body: body,
      theme: 'plain',
      styles: {
        fontSize: 10,
        cellPadding: 4,
      },
      headStyles: { 
        fillColor: [247, 247, 247],
        textColor: [0, 0, 0],
        fontStyle: 'bold'
      },
      didParseCell: function(data) {
        if (data.section === 'body') {
          // Color 'Type' and 'Amount' columns based on Type
          if (data.column.index === 2 || data.column.index === 3) {
            const type = data.row.raw[2];
            if (type === 'CREDIT') {
              data.cell.styles.textColor = [34, 197, 94]; // Green 500
            } else if (type === 'DEBIT') {
              data.cell.styles.textColor = [239, 68, 68]; // Red 500
            }
          }
        }
      }
    });

    const finalY = (doc as any).lastAutoTable.finalY || startY;
    
    // Find final balance for this period
    let periodFinalBalance = periodOpeningBalance;
    if (filteredTx.length > 0) {
      periodFinalBalance = filteredTx[filteredTx.length - 1].runningBalance;
    }

    // Bottom summary card
    doc.setFillColor(248, 250, 252); // Slate 50
    doc.rect(14, finalY + 10, 182, 20, 'F');
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(0, 0, 0);
    doc.text('Period Total:', 20, finalY + 23);
    doc.text(`₹ ${periodFinalBalance > 0 ? '-' : ''}${Math.abs(periodFinalBalance).toFixed(2)}`, 190, finalY + 23, { align: 'right' });
    
    if (periodFinalBalance === 0) {
      doc.setFontSize(11);
      doc.text('Balance Cleared for Period', 14, finalY + 40);
    }
    
    doc.save(`ledger_${party.name.replace(/\s+/g, '_')}_${format(new Date(), 'yyyyMMdd')}.pdf`);
    setShowDownloadModal(false);
  };

  const TransactionModal = () => {
    const [amount, setAmount] = useState('');
    const [invoiceNo, setInvoiceNo] = useState('');
    const [notes, setNotes] = useState('');

    const handleSubmit = async (e: React.FormEvent) => {
      e.preventDefault();
      if (!party || !showTxModal) return;
      
      const txId = uuidv4();
      const numAmount = parseFloat(amount);
      if (isNaN(numAmount) || numAmount <= 0) return;

      const newTx: Transaction = {
        id: txId,
        partyId: party.id,
        ledgerId: party.ledgerId,
        invoiceNo,
        type: showTxModal,
        amount: numAmount,
        notes,
        timestamp: Date.now()
      };

      const newDue = party.currentDue + (showTxModal === 'DEBIT' ? numAmount : -numAmount);

      try {
        await setDoc(doc(db, 'transactions', txId), newTx);
        await updateDoc(doc(db, 'parties', party.id), {
          currentDue: newDue,
          lastTransaction: Date.now()
        });
        setShowTxModal(null);
      } catch (err) {
        handleFirestoreError(err, OperationType.CREATE, `transactions/${txId}`);
      }
    };

    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
        <div className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden">
          <div className="flex justify-between items-center p-4 border-b">
            <h3 className="font-semibold text-lg text-gray-900">
              {showTxModal === 'DEBIT' 
                ? (activeLedger?.type === 'PURCHASE' ? 'Make Payment (Debit)' : 'Add Sale / Charge (Debit)') 
                : (activeLedger?.type === 'PURCHASE' ? 'Add Purchase (Credit)' : 'Receive Payment (Credit)')}
            </h3>
            <button onClick={() => setShowTxModal(null)} className="text-gray-400 hover:text-gray-600">×</button>
          </div>
          <form onSubmit={handleSubmit} className="p-6 space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Amount</label>
              <input required type="number" step="0.01" min="0.01" value={amount} onChange={e => setAmount(e.target.value)} className="w-full px-3 py-2 border rounded-md focus:border-sky-500 focus:ring-1 focus:ring-sky-500" autoFocus />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{activeLedger?.type === 'PURCHASE' && showTxModal === 'CREDIT' ? 'Bill No.' : 'Receipt / Invoice No.'}</label>
              <input type="text" value={invoiceNo} onChange={e => setInvoiceNo(e.target.value)} className="w-full px-3 py-2 border rounded-md focus:border-sky-500 focus:ring-1 focus:ring-sky-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
              <textarea value={notes} onChange={e => setNotes(e.target.value)} className="w-full px-3 py-2 border rounded-md focus:border-sky-500 focus:ring-1 focus:ring-sky-500"></textarea>
            </div>
            <div className="pt-4 flex justify-end">
              <button type="button" onClick={() => setShowTxModal(null)} className="px-4 py-2 text-gray-600 mr-2 hover:bg-gray-50 rounded-md">Cancel</button>
              <button type="submit" className={`px-4 py-2 text-white rounded-md ${showTxModal === 'DEBIT' ? 'bg-red-600 hover:bg-red-700' : 'bg-green-600 hover:bg-green-700'}`}>
                {showTxModal === 'DEBIT' 
                  ? (activeLedger?.type === 'PURCHASE' ? 'Make Payment' : 'Add Debit') 
                  : (activeLedger?.type === 'PURCHASE' ? 'Add Purchase' : 'Add Credit')}
              </button>
            </div>
          </form>
        </div>
      </div>
    );
  };

  const EditTransactionModal = () => {
    const [amount, setAmount] = useState(editingTx ? editingTx.amount.toString() : '');
    const [invoiceNo, setInvoiceNo] = useState(editingTx ? editingTx.invoiceNo || '' : '');
    const [notes, setNotes] = useState(editingTx ? editingTx.notes || '' : '');

    if (!editingTx) return null;

    const handleSubmit = async (e: React.FormEvent) => {
      e.preventDefault();
      if (!party) return;
      
      const numAmount = parseFloat(amount);
      if (isNaN(numAmount) || numAmount <= 0) return;

      // Calculate the difference to update party balance
      const amountDiff = numAmount - editingTx.amount;
      
      // If DEBIT: new = 150, old = 100 -> diff = +50 -> currentDue + 50
      // If CREDIT: new = 150, old = 100 -> diff = +50 -> currentDue - 50
      const newDue = party.currentDue + (editingTx.type === 'DEBIT' ? amountDiff : -amountDiff);

      try {
        await updateDoc(doc(db, 'transactions', editingTx.id), {
          amount: numAmount,
          invoiceNo,
          notes
        });
        await updateDoc(doc(db, 'parties', party.id), {
          currentDue: newDue,
          lastTransaction: Date.now()
        });
        setEditingTx(null);
      } catch (err) {
        handleFirestoreError(err, OperationType.UPDATE, `transactions/${editingTx.id}`);
      }
    };

    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
        <div className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden">
          <div className="flex justify-between items-center p-4 border-b">
            <h3 className="font-semibold text-lg text-gray-900">
              Edit Transaction
            </h3>
            <button onClick={() => setEditingTx(null)} className="text-gray-400 hover:text-gray-600">×</button>
          </div>
          <form onSubmit={handleSubmit} className="p-6 space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Amount</label>
              <input required type="number" step="0.01" min="0.01" value={amount} onChange={e => setAmount(e.target.value)} className="w-full px-3 py-2 border rounded-md focus:border-sky-500 focus:ring-1 focus:ring-sky-500" autoFocus />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Receipt / Invoice No.</label>
              <input type="text" value={invoiceNo} onChange={e => setInvoiceNo(e.target.value)} className="w-full px-3 py-2 border rounded-md focus:border-sky-500 focus:ring-1 focus:ring-sky-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
              <textarea value={notes} onChange={e => setNotes(e.target.value)} className="w-full px-3 py-2 border rounded-md focus:border-sky-500 focus:ring-1 focus:ring-sky-500"></textarea>
            </div>
            <div className="pt-4 flex justify-end">
              <button type="button" onClick={() => setEditingTx(null)} className="px-4 py-2 text-gray-600 mr-2 hover:bg-gray-50 rounded-md">Cancel</button>
              <button type="submit" className="px-4 py-2 text-white rounded-md bg-sky-600 hover:bg-sky-700">
                Save Changes
              </button>
            </div>
          </form>
        </div>
      </div>
    );
  };

  const DownloadModal = () => (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-sm overflow-hidden">
        <div className="flex justify-between items-center p-4 border-b">
          <h3 className="font-semibold text-lg text-gray-900">Download Statement</h3>
          <button onClick={() => setShowDownloadModal(false)} className="text-gray-400 hover:text-gray-600">×</button>
        </div>
        <form onSubmit={generatePdf} className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Start Date</label>
            <input required type="date" value={downloadStartDate} onChange={e => setDownloadStartDate(e.target.value)} className="w-full px-3 py-2 border rounded-md focus:border-sky-500 focus:ring-1 focus:ring-sky-500" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">End Date</label>
            <input required type="date" value={downloadEndDate} onChange={e => setDownloadEndDate(e.target.value)} min={downloadStartDate} className="w-full px-3 py-2 border rounded-md focus:border-sky-500 focus:ring-1 focus:ring-sky-500" />
          </div>
          <div className="pt-4 flex justify-end">
            <button type="button" onClick={() => setShowDownloadModal(false)} className="px-4 py-2 text-gray-600 mr-2 hover:bg-gray-50 rounded-md">Cancel</button>
            <button type="submit" className="px-4 py-2 text-white bg-sky-600 hover:bg-sky-700 rounded-md">
              Download
            </button>
          </div>
        </form>
      </div>
    </div>
  );

  if (!party) return <div className="p-8 text-center text-gray-500">Loading party...</div>;

  return (
    <div className="p-4 sm:p-8 max-w-5xl mx-auto w-full pb-24 sm:pb-8">
      {showTxModal && <TransactionModal />}
      {editingTx && <EditTransactionModal />}
      {showDownloadModal && <DownloadModal />}
      
      <div className="mb-6">
        <button onClick={() => navigate('/parties')} className="flex items-center text-sm font-medium text-gray-500 hover:text-gray-900 transition-colors">
          <ArrowLeft size={16} className="mr-1" /> Back to Parties
        </button>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 mb-8 flex flex-col md:flex-row justify-between items-start md:items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{party.name}</h1>
          <p className="text-gray-500 mt-1">{party.phone} • {party.address}</p>
        </div>
        <div className="mt-4 md:mt-0 text-left md:text-right">
          <p className="text-sm text-gray-500 uppercase tracking-widest font-semibold mb-1">Net Balance</p>
          <div className={`text-3xl font-bold ${party.currentDue > 0 ? 'text-red-600' : party.currentDue < 0 ? 'text-green-600' : 'text-gray-900'}`}>
            {party.currentDue > 0 ? '-₹' : '₹ '}
            {Math.abs(party.currentDue).toLocaleString(undefined, { minimumFractionDigits: 2 })}
          </div>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-3 mb-8">
        <button onClick={() => setShowTxModal('DEBIT')} className="cursor-pointer flex-1 flex flex-col items-center justify-center py-4 bg-red-50 hover:bg-red-100 text-red-700 rounded-xl transition-colors border border-red-100">
          <Minus size={24} className="mb-2" />
          <span className="font-semibold text-sm">{activeLedger?.type === 'PURCHASE' ? "Make Payment (Dr)" : "Add Sale (Give Credit/Dr)"}</span>
        </button>
        <button onClick={() => setShowTxModal('CREDIT')} className="cursor-pointer flex-1 flex flex-col items-center justify-center py-4 bg-green-50 hover:bg-green-100 text-green-700 rounded-xl transition-colors border border-green-100">
          <Plus size={24} className="mb-2" />
          <span className="font-semibold text-sm">{activeLedger?.type === 'PURCHASE' ? "Add Purchase (Cr)" : "Receive Payment (Cr)"}</span>
        </button>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="p-4 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
          <h2 className="font-semibold text-gray-900">Ledger Statement</h2>
          <button onClick={() => setShowDownloadModal(true)} className="flex items-center text-sm font-medium text-sky-600 hover:text-sky-800 bg-sky-50 px-3 py-1.5 rounded-md transition-colors">
            <Download size={16} className="mr-1.5" /> Download PDF
          </button>
        </div>
        
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[600px]">
            <thead>
              <tr className="bg-white border-b text-xs uppercase tracking-wider text-gray-500">
                <th className="p-4 font-medium w-48">Date</th>
                <th className="p-4 font-medium">Particulars</th>
                <th className="p-4 font-medium text-right w-32">Debit (Dr)</th>
                <th className="p-4 font-medium text-right w-32">Credit (Cr)</th>
                <th className="p-4 font-medium text-right w-32 bg-gray-50">Balance</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-gray-50 bg-gray-50/30 text-sm">
                <td className="p-4 text-gray-500">-</td>
                <td className="p-4 font-medium text-gray-700">Opening Balance</td>
                <td className="p-4 text-right text-gray-500">{party.openingBalance > 0 ? party.openingBalance.toFixed(2) : '-'}</td>
                <td className="p-4 text-right text-gray-500">{party.openingBalance < 0 ? Math.abs(party.openingBalance).toFixed(2) : '-'}</td>
                <td className="p-4 text-right font-medium bg-gray-50">{party.openingBalance.toFixed(2)}</td>
              </tr>
              {txWithBalance.length === 0 ? (
                <tr>
                  <td colSpan={5} className="p-12 text-center text-gray-500">
                    <FileText size={32} className="mx-auto mb-3 text-gray-300" />
                    <p className="text-sm">No transactions recorded yet.</p>
                  </td>
                </tr>
              ) : (
                txWithBalance.map((tx) => (
                  <tr key={tx.id} className="border-b border-gray-50 last:border-0 hover:bg-gray-50/50 text-sm transition-colors">
                    <td className="p-4 whitespace-nowrap text-gray-500">
                      {format(new Date(tx.timestamp), 'dd MMM yyyy, HH:mm')}
                    </td>
                    <td className="p-4">
                      <div className="flex items-start justify-between">
                        <div>
                          <div className="font-medium text-gray-900">{tx.notes || '-'}</div>
                          {tx.invoiceNo && <div className="text-xs text-gray-500 font-mono mt-0.5">Ref: {tx.invoiceNo}</div>}
                        </div>
                        {currentUser?.isAdmin && (
                          <button onClick={() => setEditingTx(tx)} className="text-gray-400 hover:text-sky-600 transition-colors ml-2" title="Edit Transaction">
                            <Edit2 size={14} />
                          </button>
                        )}
                      </div>
                    </td>
                    <td className="p-4 text-right text-red-600 font-medium">
                      {tx.type === 'DEBIT' ? tx.amount.toLocaleString(undefined, {minimumFractionDigits: 2}) : '-'}
                    </td>
                    <td className="p-4 text-right text-green-600 font-medium">
                      {tx.type === 'CREDIT' ? tx.amount.toLocaleString(undefined, {minimumFractionDigits: 2}) : '-'}
                    </td>
                    <td className={`p-4 text-right font-semibold bg-gray-50 ${tx.runningBalance > 0 ? 'text-red-700' : tx.runningBalance < 0 ? 'text-green-700' : 'text-gray-700'}`}>
                      {tx.runningBalance > 0 ? '-₹' : '₹ '}{Math.abs(tx.runningBalance).toLocaleString(undefined, {minimumFractionDigits: 2})}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

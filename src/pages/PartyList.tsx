import React, { useState, useEffect } from 'react';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { collection, onSnapshot, doc, setDoc, query, where } from 'firebase/firestore';
import { Party } from '../types';
import { Search, Plus, Upload, UserPlus, X } from 'lucide-react';
import { useAuth } from '../AuthContext';
import { useLedger } from '../LedgerContext';
import { v4 as uuidv4 } from 'uuid';
import { useNavigate } from 'react-router-dom';

export default function PartyList() {
  const { currentUser } = useAuth();
  const { activeLedger } = useLedger();
  const navigate = useNavigate();
  const [parties, setParties] = useState<Party[]>([]);
  const [search, setSearch] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);

  useEffect(() => {
    if (!activeLedger?.id) {
      setParties([]);
      return;
    }
    const q = query(collection(db, 'parties'), where('ledgerId', '==', activeLedger.id));
    const unsub = onSnapshot(q, (snapshot) => {
      setParties(snapshot.docs.map(d => d.data() as Party));
    }, e => handleFirestoreError(e, OperationType.GET, 'parties'));
    return () => unsub();
  }, [activeLedger?.id]);

  const filteredParties = parties.filter(p => p.name.toLowerCase().includes(search.toLowerCase()) || p.phone.includes(search));

  const AddPartyModal = () => {
    const [name, setName] = useState('');
    const [phone, setPhone] = useState('');
    const [address, setAddress] = useState('');
    const [openingBalance, setOpeningBalance] = useState('');

    const handleSubmit = async (e: React.FormEvent) => {
      e.preventDefault();
      if (!activeLedger?.id) return;
      const id = uuidv4();
      const balance = parseFloat(openingBalance) || 0;
      const newParty: Party = {
        id,
        ledgerId: activeLedger.id,
        name,
        phone,
        address,
        openingBalance: balance,
        currentDue: balance,
        lastTransaction: Date.now(),
        status: 'Active'
      };
      try {
        await setDoc(doc(db, 'parties', id), newParty);
        setShowAddModal(false);
      } catch (e) {
        handleFirestoreError(e, OperationType.CREATE, `parties/${id}`);
      }
    };

    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
        <div className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden">
          <div className="flex justify-between items-center p-4 border-b">
            <h3 className="font-semibold text-lg text-gray-900">Add New Party</h3>
            <button onClick={() => setShowAddModal(false)} className="text-gray-400 hover:text-gray-600"><X size={20}/></button>
          </div>
          <form onSubmit={handleSubmit} className="p-6 space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
              <input required type="text" value={name} onChange={e => setName(e.target.value)} className="w-full px-3 py-2 border rounded-md focus:border-sky-500 focus:ring-1 focus:ring-sky-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
              <input required type="text" value={phone} onChange={e => setPhone(e.target.value)} className="w-full px-3 py-2 border rounded-md focus:border-sky-500 focus:ring-1 focus:ring-sky-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Address</label>
              <input type="text" value={address} onChange={e => setAddress(e.target.value)} className="w-full px-3 py-2 border rounded-md focus:border-sky-500 focus:ring-1 focus:ring-sky-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Opening Balance (Positive = Due to us, Negative = Advance)</label>
              <input type="number" step="0.01" value={openingBalance} onChange={e => setOpeningBalance(e.target.value)} className="w-full px-3 py-2 border rounded-md focus:border-sky-500 focus:ring-1 focus:ring-sky-500" />
            </div>
            <div className="pt-4 flex justify-end">
              <button type="button" onClick={() => setShowAddModal(false)} className="px-4 py-2 text-gray-600 mr-2 hover:bg-gray-50 rounded-md">Cancel</button>
              <button type="submit" className="px-4 py-2 bg-sky-600 text-white rounded-md hover:bg-sky-700">Save Party</button>
            </div>
          </form>
        </div>
      </div>
    );
  };

  const ImportModal = () => {
    const [csvContent, setCsvContent] = useState('');

    const handleImport = async () => {
      if (!activeLedger?.id) return;
      const lines = csvContent.split('\n');
      for (const line of lines) {
        if (!line.trim()) continue;
        const parts = line.split(',');
        const name = parts[0]?.trim();
        const phone = parts[1]?.trim() || '';
        const balanceStr = parts[2]?.trim() || '0';
        
        if (name) {
          const id = uuidv4();
          const balance = parseFloat(balanceStr) || 0;
          const newParty: Party = {
            id,
            ledgerId: activeLedger.id,
            name,
            phone,
            address: '',
            openingBalance: balance,
            currentDue: balance,
            lastTransaction: Date.now(),
            status: 'Active'
          };
          await setDoc(doc(db, 'parties', id), newParty).catch(e => console.error(e));
        }
      }
      setShowImportModal(false);
    };

    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
        <div className="bg-white rounded-xl shadow-xl w-full max-w-lg overflow-hidden">
          <div className="flex justify-between items-center p-4 border-b">
            <h3 className="font-semibold text-lg text-gray-900">Bulk Import Parties</h3>
            <button onClick={() => setShowImportModal(false)} className="text-gray-400 hover:text-gray-600"><X size={20}/></button>
          </div>
          <div className="p-6">
            <p className="text-sm text-gray-500 mb-4">Paste CSV format: <code>Name,Phone,OpeningBalance</code> (one per line)</p>
            <textarea
              className="w-full h-48 px-3 py-2 border rounded-md focus:border-sky-500 focus:ring-1 focus:ring-sky-500 font-mono text-sm"
              value={csvContent}
              onChange={e => setCsvContent(e.target.value)}
              placeholder="John Doe,1234567890,500.00&#10;Jane Smith,0987654321,-200.00"
            ></textarea>
            <div className="mt-4 flex justify-end">
              <button onClick={() => setShowImportModal(false)} className="px-4 py-2 text-gray-600 mr-2 hover:bg-gray-50 rounded-md">Cancel</button>
              <button onClick={handleImport} className="px-4 py-2 bg-sky-600 text-white rounded-md hover:bg-sky-700">Import</button>
            </div>
          </div>
        </div>
      </div>
    );
  };

  if (!activeLedger) return <div className="p-8 text-center text-gray-500">Please select a ledger.</div>;

  return (
    <div className="p-4 sm:p-8 max-w-7xl mx-auto w-full pb-24 sm:pb-8">
      {showAddModal && <AddPartyModal />}
      {showImportModal && <ImportModal />}

      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-8 gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900 tracking-tight">Parties</h1>
          <p className="text-sm text-gray-500 mt-1">Manage your customers and suppliers in {activeLedger.name}</p>
        </div>
        <div className="flex space-x-2">
          {currentUser?.isAdmin && (
            <button onClick={() => setShowImportModal(true)} className="flex items-center px-3 py-2 bg-white border border-gray-200 text-gray-700 rounded-md text-sm font-medium hover:bg-gray-50 transition-colors">
              <Upload size={16} className="mr-2" />
              Import
            </button>
          )}
          <button onClick={() => setShowAddModal(true)} className="flex items-center px-3 py-2 bg-sky-600 text-white rounded-md text-sm font-medium hover:bg-sky-700 transition-colors">
            <UserPlus size={16} className="mr-2" />
            Add Party
          </button>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="p-4 border-b border-gray-100 flex items-center bg-gray-50/50">
          <div className="relative w-full max-w-md border bg-white rounded-md flex items-center px-3">
            <Search size={18} className="text-gray-400 min-w-4" />
            <input 
              type="text" 
              placeholder="Search by name or phone..." 
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full py-2 ml-2 bg-transparent focus:outline-none text-sm"
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-white border-b text-xs uppercase tracking-wider text-gray-500">
                <th className="p-4 font-medium">Party Name</th>
                <th className="p-4 font-medium">Contact</th>
                <th className="p-4 font-medium text-right">Current Balance</th>
                <th className="p-4 font-medium text-center">Status</th>
              </tr>
            </thead>
            <tbody className="align-middle">
              {filteredParties.map((party) => (
                <tr 
                  key={party.id} 
                  onClick={() => navigate(`/parties/${party.id}`)}
                  className="border-b border-gray-50 hover:bg-gray-50 cursor-pointer transition-colors"
                >
                  <td className="p-4">
                    <div className="font-medium text-gray-900">{party.name}</div>
                    <div className="text-xs text-gray-500 lg:hidden">{party.phone}</div>
                  </td>
                  <td className="p-4 text-sm text-gray-600 hidden lg:table-cell">{party.phone}</td>
                  <td className="p-4 text-right">
                    <div className={`font-semibold ${party.currentDue > 0 ? 'text-red-600' : party.currentDue < 0 ? 'text-green-600' : 'text-gray-600'}`}>
                      {party.currentDue > 0 ? (
                        <>-₹{Math.abs(party.currentDue).toLocaleString(undefined, {minimumFractionDigits:2})}</>
                      ) : party.currentDue < 0 ? (
                        <>₹ {Math.abs(party.currentDue).toLocaleString(undefined, {minimumFractionDigits:2})}</>
                      ) : (
                        <>₹ 0.00</>
                      )}
                    </div>
                  </td>
                  <td className="p-4 text-center">
                    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800">
                      {party.status}
                    </span>
                  </td>
                </tr>
              ))}
              {filteredParties.length === 0 && (
                <tr>
                  <td colSpan={4} className="p-8 text-center text-sm text-gray-500">
                    No parties found matching your search.
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

import React, { useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { LayoutDashboard, Users as UsersIcon, FileText, Settings, LogOut, ChevronDown, Plus, BookOpen } from 'lucide-react';
import { useAuth } from '../AuthContext';
import { useLedger } from '../LedgerContext';

export default function Navigation() {
  const { currentUser, logout } = useAuth();
  const { ledgers, activeLedger, setActiveLedgerId, createLedger } = useLedger();
  const [showLedgerMenu, setShowLedgerMenu] = useState(false);
  const [showNewLedgerModal, setShowNewLedgerModal] = useState(false);
  const navigate = useNavigate();

  const handleLedgerSwitch = (id: string) => {
    setActiveLedgerId(id);
    setShowLedgerMenu(false);
    navigate('/');
  };

  if (!currentUser) return null;

  const links = [
    { to: '/', icon: <LayoutDashboard size={20} />, label: 'Dashboard' },
    { to: '/parties', icon: <UsersIcon size={20} />, label: 'Parties' },
    { to: '/master-entry', icon: <Plus size={20} />, label: 'Master Entry' },
    ...(activeLedger?.type === 'SALE' ? [{ to: '/invoice-sheets', icon: <BookOpen size={20} />, label: 'Invoice Sheets' }] : []),
    { to: '/log', icon: <FileText size={20} />, label: 'Log' },
  ];

  if (currentUser.isAdmin) {
    links.push({ to: '/admin', icon: <Settings size={20} />, label: 'Admin Users' });
  }

  const NewLedgerModal = () => {
    const [name, setName] = useState('');
    const [type, setType] = useState<'SALE' | 'PURCHASE'>('SALE');
    
    const handleSubmit = async (e: React.FormEvent) => {
      e.preventDefault();
      await createLedger(name, type);
      setShowNewLedgerModal(false);
      setShowLedgerMenu(false);
    };

    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
        <div className="bg-white rounded-xl shadow-xl w-full max-w-sm overflow-hidden">
          <div className="p-4 border-b flex justify-between items-center">
            <h3 className="font-semibold text-lg text-gray-900">New Ledger</h3>
            <button onClick={() => setShowNewLedgerModal(false)} className="text-gray-400 hover:text-gray-600">×</button>
          </div>
          <form onSubmit={handleSubmit} className="p-6 space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Ledger Name</label>
              <input required type="text" value={name} onChange={e => setName(e.target.value)} className="w-full px-3 py-2 border rounded-md focus:border-sky-500 focus:ring-1 focus:ring-sky-500" placeholder="e.g. Purchase Ledger 2026" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
              <select value={type} onChange={e => setType(e.target.value as any)} className="w-full px-3 py-2 border rounded-md focus:border-sky-500 focus:ring-1 focus:ring-sky-500">
                <option value="SALE">Sales (Receivables)</option>
                <option value="PURCHASE">Purchases (Payables)</option>
              </select>
            </div>
            <div className="pt-4 flex justify-end">
              <button type="button" onClick={() => setShowNewLedgerModal(false)} className="px-4 py-2 text-gray-600 mr-2 hover:bg-gray-50 rounded-md">Cancel</button>
              <button type="submit" className="px-4 py-2 bg-sky-600 text-white rounded-md hover:bg-sky-700">Create</button>
            </div>
          </form>
        </div>
      </div>
    );
  };

  return (
    <>
      {showNewLedgerModal && <NewLedgerModal />}
      <nav className="fixed bottom-0 left-0 right-0 bg-white border-t sm:relative sm:border-t-0 sm:border-r w-full sm:w-64 h-16 sm:h-screen flex flex-row sm:flex-col shadow-sm z-40 transition-all">
        <div className="hidden sm:flex flex-col border-b p-4">
          <h1 className="text-2xl font-black tracking-tighter mb-4 text-center">
            <span className="text-gray-900">GREENZAR</span><span className="text-sky-600">LDR</span>
          </h1>
          
          <div className="relative">
            <button 
              onClick={() => setShowLedgerMenu(!showLedgerMenu)}
              className="w-full flex items-center justify-between px-3 py-2 bg-gray-50 hover:bg-gray-100 border border-gray-200 rounded-md text-sm transition-colors text-left"
            >
              <div className="overflow-hidden">
                <div className="font-semibold text-gray-900 truncate">{activeLedger?.name || 'Select Ledger'}</div>
                <div className="text-xs text-gray-500">{activeLedger?.type === 'SALE' ? 'Sales / Receivables' : 'Purchases / Payables'}</div>
              </div>
              <ChevronDown size={16} className="text-gray-500 ml-2 flex-shrink-0" />
            </button>
            
            {showLedgerMenu && (
              <div className="absolute top-full mt-1 left-0 right-0 bg-white border border-gray-200 rounded-md shadow-lg overflow-hidden z-50">
                <div className="max-h-48 overflow-y-auto">
                  {ledgers.map(l => (
                    <button
                      key={l.id}
                      onClick={() => handleLedgerSwitch(l.id)}
                      className={`w-full text-left px-3 py-2 text-sm hover:bg-sky-50 transition-colors ${activeLedger?.id === l.id ? 'bg-sky-50 font-medium text-sky-700' : 'text-gray-700'}`}
                    >
                      {l.name}
                    </button>
                  ))}
                </div>
                {currentUser.isAdmin && (
                  <div className="border-t border-gray-100 p-1">
                    <button 
                      onClick={() => setShowNewLedgerModal(true)}
                      className="w-full flex items-center text-left px-2 py-1.5 text-sm text-sky-600 hover:bg-sky-50 rounded"
                    >
                      <Plus size={14} className="mr-1.5" />
                      Add Ledger
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
        
        {/* Mobile Ledger Display - purely informational or quick switch */}
        <div className="sm:hidden fixed top-0 w-full h-12 bg-white border-b flex items-center px-4 justify-between z-40 bg-opacity-95 backdrop-blur-sm">
          <div className="font-black tracking-tighter text-lg"><span className="text-gray-900">GREENZAR</span><span className="text-sky-600">LDR</span></div>
          <div className="text-sm font-medium text-sky-600 bg-sky-50 px-2 py-1 rounded-md max-w-[150px] truncate" onClick={() => setShowLedgerMenu(!showLedgerMenu)}>
            {activeLedger?.name || 'Select Ledger'}
          </div>
          {showLedgerMenu && (
              <div className="absolute top-full mt-1 right-2 w-48 bg-white border border-gray-200 rounded-md shadow-lg overflow-hidden z-50">
                <div className="max-h-48 overflow-y-auto">
                  {ledgers.map(l => (
                    <button
                      key={l.id}
                      onClick={() => handleLedgerSwitch(l.id)}
                      className={`w-full text-left px-3 py-2 text-sm hover:bg-sky-50 ${activeLedger?.id === l.id ? 'bg-sky-50 font-medium text-sky-700' : 'text-gray-700'}`}
                    >
                      {l.name}
                    </button>
                  ))}
                </div>
                {currentUser.isAdmin && (
                  <div className="border-t border-gray-100 p-1">
                    <button 
                      onClick={() => setShowNewLedgerModal(true)}
                      className="w-full flex items-center text-left px-2 py-1.5 text-sm text-sky-600 hover:bg-sky-50 rounded"
                    >
                      <Plus size={14} className="mr-1.5" />
                      Add Ledger
                    </button>
                  </div>
                )}
              </div>
            )}
        </div>
        
        <div className="flex-1 flex flex-row sm:flex-col overflow-y-auto mt-12 sm:mt-0">
          {links.map((link) => (
            <NavLink
              key={link.to}
              to={link.to}
              className={({ isActive }) =>
                `flex flex-col sm:flex-row items-center justify-center sm:justify-start flex-1 sm:flex-none p-2 sm:px-4 sm:py-3 text-xs sm:text-sm font-medium transition-colors ${
                  isActive ? 'text-sky-600 bg-sky-50/50 sm:bg-sky-50 border-t-2 border-sky-600 sm:border-t-0 sm:border-l-4' : 'text-gray-500 hover:text-gray-900 hover:bg-gray-50 border-t-2 border-transparent sm:border-t-0 sm:border-l-4'
                }`
              }
            >
              <span className="mb-1 sm:mb-0 sm:mr-3">{link.icon}</span>
              <span>{link.label}</span>
            </NavLink>
          ))}
        </div>

        <div className="hidden sm:block p-4 border-t">
          <div className="flex items-center mb-4">
            <div className="w-8 h-8 rounded-full bg-sky-100 flex items-center justify-center text-sky-700 font-bold mr-3">
              {currentUser.name.charAt(0).toUpperCase()}
            </div>
            <div className="overflow-hidden text-sm">
              <p className="font-medium text-gray-900 truncate">{currentUser.name}</p>
              <p className="text-xs text-gray-500 truncate">{currentUser.isAdmin ? 'Admin' : 'User'}</p>
            </div>
          </div>
          <button
            onClick={logout}
            className="w-full flex items-center justify-center px-4 py-2 text-sm font-medium text-gray-700 bg-gray-50 hover:bg-gray-100 rounded-md transition-colors"
          >
            <LogOut size={16} className="mr-2" />
            Sign Out
          </button>
        </div>
      </nav>
    </>
  );
}

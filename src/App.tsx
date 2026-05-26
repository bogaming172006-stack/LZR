import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './AuthContext';
import { LedgerProvider, useLedger } from './LedgerContext';
import Navigation from './components/Navigation';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import PartyList from './pages/PartyList';
import PartyDetail from './pages/PartyDetail';
import Log from './pages/Log';
import Users from './pages/Users';
import MasterEntry from './pages/MasterEntry';
import InvoiceSheets from './pages/InvoiceSheets';

const RequireAuth: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { currentUser, isLoading } = useAuth();
  if (isLoading) return <div className="min-h-screen flex items-center justify-center bg-gray-50 text-gray-500">Loading...</div>;
  if (!currentUser) return <Navigate to="/login" replace />;
  return <>{children}</>;
};

const AuthLayout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { activeLedger } = useLedger();
  
  return (
    <div className={`flex flex-col sm:flex-row h-screen bg-gray-50 overflow-hidden font-sans ${activeLedger?.type === 'PURCHASE' ? 'theme-purchase' : 'theme-sale'}`}>
      <Navigation />
      <main className="flex-1 overflow-y-auto w-full h-full relative">
        {children}
      </main>
    </div>
  );
};

export default function App() {
  return (
    <AuthProvider>
      <LedgerProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<Login />} />
            
            <Route path="/" element={
              <RequireAuth>
                <AuthLayout>
                  <Dashboard />
                </AuthLayout>
              </RequireAuth>
            } />
            
            <Route path="/parties" element={
              <RequireAuth>
                <AuthLayout>
                  <PartyList />
                </AuthLayout>
              </RequireAuth>
            } />
            
            <Route path="/parties/:id" element={
              <RequireAuth>
                <AuthLayout>
                  <PartyDetail />
                </AuthLayout>
              </RequireAuth>
            } />
            
            <Route path="/log" element={
              <RequireAuth>
                <AuthLayout>
                  <Log />
                </AuthLayout>
              </RequireAuth>
            } />
            
            <Route path="/master-entry" element={
              <RequireAuth>
                <AuthLayout>
                  <MasterEntry />
                </AuthLayout>
              </RequireAuth>
            } />
            
            <Route path="/invoice-sheets" element={
              <RequireAuth>
                <AuthLayout>
                  <InvoiceSheets />
                </AuthLayout>
              </RequireAuth>
            } />
            
            <Route path="/admin" element={
              <RequireAuth>
                <AuthLayout>
                  <Users />
                </AuthLayout>
              </RequireAuth>
            } />
            
          </Routes>
        </BrowserRouter>
      </LedgerProvider>
    </AuthProvider>
  );
}

import React, { useState, useEffect } from 'react';
import { auth } from './firebase';
import { onAuthStateChanged, User } from 'firebase/auth';
import { Auth } from './components/Auth';
import { Dashboard } from './components/Dashboard';
import { Shield } from 'lucide-react';

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center">
        <div className="w-16 h-16 bg-emerald-500 rounded-2xl flex items-center justify-center animate-bounce shadow-xl shadow-emerald-100">
          <Shield className="text-white w-8 h-8" />
        </div>
        <p className="mt-4 text-slate-400 font-bold uppercase tracking-widest text-xs">Initializing Safety...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 font-sans selection:bg-emerald-100 selection:text-emerald-900">
      {!user ? (
        <Auth onAuthSuccess={() => {}} />
      ) : (
        <Dashboard />
      )}
    </div>
  );
}

import React, { useState, useEffect } from 'react';
import { db, auth } from '../firebase';
import { collection, addDoc, query, where, onSnapshot, deleteDoc, doc } from 'firebase/firestore';
import { Guardian } from '../types';
import { UserPlus, Trash2, Users, X } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

export const GuardianManager: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const [guardians, setGuardians] = useState<Guardian[]>([]);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [relationship, setRelationship] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!auth.currentUser) return;
    const q = query(collection(db, 'guardians'), where('userId', '==', auth.currentUser.uid));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const list = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Guardian));
      setGuardians(list);
    });
    return unsubscribe;
  }, []);

  const handleAddGuardian = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!auth.currentUser || !name || !phone) return;
    setLoading(true);
    try {
      await addDoc(collection(db, 'guardians'), {
        userId: auth.currentUser.uid,
        name,
        phoneNumber: phone,
        relationship,
      });
      setName('');
      setPhone('');
      setRelationship('');
    } catch (error) {
      console.error('Error adding guardian:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'guardians', id));
    } catch (error) {
      console.error('Error deleting guardian:', error);
    }
  };

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 20 }}
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/40 backdrop-blur-sm"
    >
      <div className="bg-white w-full max-w-lg rounded-t-[32px] sm:rounded-[32px] shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-indigo-100 rounded-xl flex items-center justify-center">
              <Users className="text-indigo-600 w-6 h-6" />
            </div>
            <h2 className="text-xl font-bold text-slate-900">Guardians</h2>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-slate-200 rounded-full transition-colors">
            <X className="w-6 h-6 text-slate-500" />
          </button>
        </div>

        <div className="p-6 overflow-y-auto flex-1">
          <form onSubmit={handleAddGuardian} className="space-y-4 mb-8 bg-indigo-50/50 p-5 rounded-2xl border border-indigo-100">
            <h3 className="text-sm font-bold text-indigo-900 uppercase tracking-wider mb-2">Add New Guardian</h3>
            <div className="grid grid-cols-1 gap-4">
              <input
                type="text"
                placeholder="Full Name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full p-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                required
              />
              <input
                type="tel"
                placeholder="Phone Number"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="w-full p-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                required
              />
              <input
                type="text"
                placeholder="Relationship (e.g. Mom, Friend)"
                value={relationship}
                onChange={(e) => setRelationship(e.target.value)}
                className="w-full p-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-indigo-600 text-white py-3 rounded-xl font-semibold flex items-center justify-center gap-2 hover:bg-indigo-700 active:scale-95 transition-all disabled:opacity-50"
            >
              <UserPlus className="w-5 h-5" />
              {loading ? 'Adding...' : 'Add Guardian'}
            </button>
          </form>

          <div className="space-y-3">
            <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-2">Your Trusted Contacts</h3>
            <AnimatePresence>
              {guardians.length === 0 ? (
                <div className="text-center py-10 text-slate-400 italic">
                  No guardians added yet.
                </div>
              ) : (
                guardians.map((g) => (
                  <motion.div
                    key={g.id}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 10 }}
                    className="flex items-center justify-between p-4 bg-white border border-slate-100 rounded-2xl shadow-sm hover:shadow-md transition-all"
                  >
                    <div>
                      <p className="font-bold text-slate-900">{g.name}</p>
                      <p className="text-sm text-slate-500">{g.phoneNumber} • {g.relationship}</p>
                    </div>
                    <button
                      onClick={() => g.id && handleDelete(g.id)}
                      className="p-2 text-rose-500 hover:bg-rose-50 rounded-xl transition-colors"
                    >
                      <Trash2 className="w-5 h-5" />
                    </button>
                  </motion.div>
                ))
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>
    </motion.div>
  );
};

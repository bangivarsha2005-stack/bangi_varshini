import React, { useState, useEffect } from 'react';
import { Phone, PhoneOff, User, MessageCircle, Video } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

export const FakeCall: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const [status, setStatus] = useState<'incoming' | 'active'>('incoming');
  const [timer, setTimer] = useState(0);

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (status === 'active') {
      interval = setInterval(() => {
        setTimer(prev => prev + 1);
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [status]);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[100] bg-slate-900 text-white flex flex-col items-center justify-between py-20 px-10"
    >
      <div className="text-center">
        <div className="w-24 h-24 bg-slate-700 rounded-full flex items-center justify-center mx-auto mb-6 shadow-2xl">
          <User className="w-12 h-12 text-slate-400" />
        </div>
        <h2 className="text-3xl font-bold mb-2">Mom</h2>
        <p className="text-slate-400 text-lg uppercase tracking-widest font-medium">
          {status === 'incoming' ? 'Incoming Call...' : formatTime(timer)}
        </p>
      </div>

      {status === 'incoming' ? (
        <div className="w-full flex justify-around items-center">
          <div className="flex flex-col items-center gap-4">
            <button
              onClick={onClose}
              className="w-20 h-20 bg-rose-500 rounded-full flex items-center justify-center shadow-lg shadow-rose-500/30 active:scale-90 transition-transform"
            >
              <PhoneOff className="w-8 h-8 text-white" />
            </button>
            <span className="text-sm font-medium text-slate-400">Decline</span>
          </div>
          
          <div className="flex flex-col items-center gap-4">
            <button
              onClick={() => setStatus('active')}
              className="w-20 h-20 bg-emerald-500 rounded-full flex items-center justify-center shadow-lg shadow-emerald-500/30 animate-bounce active:scale-90 transition-transform"
            >
              <Phone className="w-8 h-8 text-white" />
            </button>
            <span className="text-sm font-medium text-slate-400">Accept</span>
          </div>
        </div>
      ) : (
        <div className="w-full space-y-12">
          <div className="grid grid-cols-3 gap-8">
            <div className="flex flex-col items-center gap-2">
              <div className="w-16 h-16 bg-slate-800 rounded-full flex items-center justify-center"><MessageCircle className="w-6 h-6" /></div>
              <span className="text-xs text-slate-400">Message</span>
            </div>
            <div className="flex flex-col items-center gap-2">
              <div className="w-16 h-16 bg-slate-800 rounded-full flex items-center justify-center"><Video className="w-6 h-6" /></div>
              <span className="text-xs text-slate-400">Video</span>
            </div>
            <div className="flex flex-col items-center gap-2">
              <div className="w-16 h-16 bg-slate-800 rounded-full flex items-center justify-center"><Phone className="w-6 h-6" /></div>
              <span className="text-xs text-slate-400">Mute</span>
            </div>
          </div>
          
          <div className="flex flex-col items-center gap-4">
            <button
              onClick={onClose}
              className="w-20 h-20 bg-rose-500 rounded-full flex items-center justify-center shadow-lg shadow-rose-500/30 active:scale-90 transition-transform"
            >
              <PhoneOff className="w-8 h-8 text-white" />
            </button>
            <span className="text-sm font-medium text-slate-400">End Call</span>
          </div>
        </div>
      )}
    </motion.div>
  );
};

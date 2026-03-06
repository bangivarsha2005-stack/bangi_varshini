import React, { useState, useEffect } from 'react';
import { Timer, X, CheckCircle, AlertTriangle } from 'lucide-react';
import { motion } from 'motion/react';

export const SafetyTimer: React.FC<{ onTriggerSOS: () => void; onClose: () => void }> = ({ onTriggerSOS, onClose }) => {
  const [minutes, setMinutes] = useState(5);
  const [isActive, setIsActive] = useState(false);
  const [timeLeft, setTimeLeft] = useState(0);
  const [showCheck, setShowCheck] = useState(false);
  const [checkTimeout, setCheckTimeout] = useState<NodeJS.Timeout | null>(null);

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isActive && timeLeft > 0) {
      interval = setInterval(() => {
        setTimeLeft(prev => prev - 1);
      }, 1000);
    } else if (isActive && timeLeft === 0) {
      setIsActive(false);
      handleTimerEnd();
    }
    return () => clearInterval(interval);
  }, [isActive, timeLeft]);

  const startTimer = () => {
    setTimeLeft(minutes * 60);
    setIsActive(true);
  };

  const handleTimerEnd = () => {
    setShowCheck(true);
    const timeout = setTimeout(() => {
      onTriggerSOS();
      setShowCheck(false);
      onClose();
    }, 30000); // 30 seconds to respond
    setCheckTimeout(timeout);
  };

  const confirmSafe = () => {
    if (checkTimeout) clearTimeout(checkTimeout);
    setShowCheck(false);
    onClose();
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-black/60 backdrop-blur-md"
    >
      <div className="bg-white w-full max-w-sm rounded-[32px] p-8 shadow-2xl text-center relative overflow-hidden">
        <button onClick={onClose} className="absolute top-6 right-6 p-2 hover:bg-slate-100 rounded-full">
          <X className="w-6 h-6 text-slate-400" />
        </button>

        {!isActive && !showCheck ? (
          <>
            <div className="w-16 h-16 bg-amber-100 rounded-2xl flex items-center justify-center mx-auto mb-6">
              <Timer className="text-amber-600 w-8 h-8" />
            </div>
            <h2 className="text-2xl font-bold text-slate-900 mb-2">Safety Timer</h2>
            <p className="text-slate-500 mb-8">Set a timer for your journey. We'll check on you when it's up.</p>
            
            <div className="flex items-center justify-center gap-4 mb-8">
              <button 
                onClick={() => setMinutes(m => Math.max(1, m - 1))}
                className="w-12 h-12 rounded-xl border border-slate-200 flex items-center justify-center text-2xl font-bold hover:bg-slate-50"
              >-</button>
              <div className="text-4xl font-black text-slate-900 w-20">{minutes}m</div>
              <button 
                onClick={() => setMinutes(m => m + 1)}
                className="w-12 h-12 rounded-xl border border-slate-200 flex items-center justify-center text-2xl font-bold hover:bg-slate-50"
              >+</button>
            </div>

            <button
              onClick={startTimer}
              className="w-full bg-slate-900 text-white py-4 rounded-2xl font-bold text-lg hover:bg-slate-800 transition-all active:scale-95"
            >
              Start Timer
            </button>
          </>
        ) : isActive ? (
          <>
            <div className="w-32 h-32 rounded-full border-4 border-amber-500 flex items-center justify-center mx-auto mb-8 relative">
              <div className="text-4xl font-black text-slate-900">{formatTime(timeLeft)}</div>
              <motion.div 
                animate={{ rotate: 360 }}
                transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
                className="absolute inset-0 border-t-4 border-transparent rounded-full"
              />
            </div>
            <h2 className="text-2xl font-bold text-slate-900 mb-2">Timer Active</h2>
            <p className="text-slate-500 mb-8">We'll check in soon. Stay safe!</p>
            <button
              onClick={() => setIsActive(false)}
              className="w-full border-2 border-slate-200 text-slate-600 py-4 rounded-2xl font-bold hover:bg-slate-50 transition-all"
            >
              Cancel Timer
            </button>
          </>
        ) : (
          <motion.div
            initial={{ scale: 0.8 }}
            animate={{ scale: 1 }}
            className="py-4"
          >
            <div className="w-20 h-20 bg-rose-100 rounded-full flex items-center justify-center mx-auto mb-6 animate-pulse">
              <AlertTriangle className="text-rose-600 w-10 h-10" />
            </div>
            <h2 className="text-3xl font-black text-slate-900 mb-4">Are you safe?</h2>
            <p className="text-slate-500 mb-8">Please confirm your safety within 30 seconds or SOS will be triggered.</p>
            <button
              onClick={confirmSafe}
              className="w-full bg-emerald-500 text-white py-5 rounded-2xl font-black text-xl flex items-center justify-center gap-3 shadow-lg shadow-emerald-200 hover:bg-emerald-600 active:scale-95 transition-all"
            >
              <CheckCircle className="w-8 h-8" />
              I AM SAFE
            </button>
          </motion.div>
        )}
      </div>
    </motion.div>
  );
};

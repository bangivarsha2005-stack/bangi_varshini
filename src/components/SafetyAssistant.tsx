import React, { useState, useRef, useEffect } from 'react';
import { Sparkles, Send, X, MapPin, Shield, Loader2, ExternalLink } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { getSafetyAdvice, SafetyAdvice } from '../services/geminiService';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  places?: SafetyAdvice['places'];
}

export const SafetyAssistant: React.FC<{ onClose: () => void; location: { lat: number; lng: number } | null }> = ({ onClose, location }) => {
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<Message[]>([
    { role: 'assistant', content: "Hi! I'm your AI Safety Assistant. How can I help you stay safe today? You can ask me for safe routes, nearby help, or safety tips." }
  ]);
  const [isLoading, setIsLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSend = async () => {
    if (!input.trim() || isLoading) return;

    const userMessage = input.trim();
    setInput('');
    setMessages(prev => [...prev, { role: 'user', content: userMessage }]);
    setIsLoading(true);

    try {
      const result = await getSafetyAdvice(userMessage, location || undefined);
      setMessages(prev => [...prev, { 
        role: 'assistant', 
        content: result.advice,
        places: result.places
      }]);
    } catch (error) {
      console.error('Gemini error:', error);
      setMessages(prev => [...prev, { role: 'assistant', content: "I'm sorry, I encountered an error. Please try again." }]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-50 flex items-end sm:items-center justify-center p-4">
      <motion.div 
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        className="glass w-full max-w-lg rounded-t-[40px] sm:rounded-[40px] p-0 shadow-2xl flex flex-col h-[80vh] overflow-hidden"
      >
        {/* Header */}
        <div className="p-6 border-b border-white/5 flex items-center justify-between bg-indigo-600/20 text-white">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-white/10 rounded-xl flex items-center justify-center backdrop-blur-md">
              <Sparkles className="w-6 h-6 text-indigo-400" />
            </div>
            <div>
              <h2 className="text-xl font-black tracking-tight">Safety AI</h2>
              <p className="text-[10px] font-bold uppercase tracking-widest opacity-40">Powered by Gemini</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-full transition-colors">
            <X className="w-6 h-6 text-white/30" />
          </button>
        </div>

        {/* Messages */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto p-6 space-y-6 bg-black/20 custom-scrollbar">
          {messages.map((msg, idx) => (
            <motion.div 
              key={idx}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div className={`max-w-[85%] p-4 rounded-2xl shadow-sm ${
                msg.role === 'user' 
                  ? 'bg-indigo-600 text-white rounded-tr-none' 
                  : 'glass text-white/90 rounded-tl-none'
              }`}>
                <p className="text-sm font-medium leading-relaxed whitespace-pre-wrap">{msg.content}</p>
                
                {msg.places && msg.places.length > 0 && (
                  <div className="mt-4 space-y-2">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-white/30 mb-2">Suggested Places:</p>
                    {msg.places.map((place, pIdx) => (
                      <a 
                        key={pIdx}
                        href={place.uri}
                        target="_blank"
                        rel="noreferrer"
                        className="flex items-center justify-between p-3 bg-white/5 rounded-xl border border-white/5 hover:bg-white/10 transition-colors group"
                      >
                        <div className="flex items-center gap-3">
                          <MapPin className="w-4 h-4 text-indigo-400" />
                          <span className="text-xs font-bold text-white/70">{place.name}</span>
                        </div>
                        <ExternalLink className="w-3 h-3 text-white/20 group-hover:text-indigo-400 transition-colors" />
                      </a>
                    ))}
                  </div>
                )}
              </div>
            </motion.div>
          ))}
          {isLoading && (
            <div className="flex justify-start">
              <div className="glass p-4 rounded-2xl rounded-tl-none flex items-center gap-2">
                <Loader2 className="w-4 h-4 text-indigo-400 animate-spin" />
                <span className="text-xs font-bold text-white/30">Thinking...</span>
              </div>
            </div>
          )}
        </div>

        {/* Input */}
        <div className="p-6 bg-black/40 border-t border-white/5">
          <div className="relative">
            <input 
              type="text"
              placeholder="Ask about safe routes, nearby help..."
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSend()}
              className="w-full bg-white/5 border border-white/10 rounded-2xl py-4 pl-6 pr-14 font-medium text-white placeholder:text-white/20 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
            />
            <button 
              onClick={handleSend}
              disabled={!input.trim() || isLoading}
              className="absolute right-2 top-1/2 -translate-y-1/2 w-10 h-10 bg-indigo-600 text-white rounded-xl flex items-center justify-center shadow-lg shadow-indigo-500/20 disabled:opacity-50 transition-all hover:bg-indigo-700"
            >
              <Send className="w-5 h-5" />
            </button>
          </div>
          <p className="mt-3 text-[10px] text-white/20 text-center font-medium">
            AI can make mistakes. Always prioritize your immediate safety.
          </p>
        </div>
      </motion.div>
    </div>
  );
};

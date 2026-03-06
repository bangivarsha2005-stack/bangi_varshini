import React, { useState, useEffect, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import { auth, db, handleFirestoreError, OperationType } from '../firebase';
import { doc, getDoc, onSnapshot, query, where, collection, addDoc, orderBy, limit } from 'firebase/firestore';
import { GoogleGenAI } from "@google/genai";
import { 
  Shield, 
  Phone, 
  Timer, 
  MapPin, 
  Mic, 
  Users, 
  LogOut, 
  AlertCircle,
  Activity,
  Share2,
  Calendar,
  User as UserIcon,
  Camera,
  Volume2,
  VolumeX,
  RefreshCw,
  X,
  Check,
  CheckCircle,
  ShieldAlert,
  Sparkles,
  Send,
  History,
  MessageSquare
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { GuardianManager } from './GuardianManager';
import { FakeCall } from './FakeCall';
import { SafetyTimer } from './SafetyTimer';
import { CameraCapture } from './CameraCapture';
import { SafetyAssistant } from './SafetyAssistant';
import { getSafetySummary } from '../services/geminiService';
import { Guardian, UserProfile } from '../types';

interface SafetyNotification {
  id: string;
  type: string;
  recipient: string;
  message: string;
  status: string;
  timestamp: string;
}

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

export const Dashboard: React.FC = () => {
  const [isSOSActive, setIsSOSActive] = useState(false);
  const [showGuardians, setShowGuardians] = useState(false);
  const [showFakeCall, setShowFakeCall] = useState(false);
  const [showTimer, setShowTimer] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const [isTracking, setIsTracking] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [isAutoRecordEnabled, setIsAutoRecordEnabled] = useState(true);
  const [showCamera, setShowCamera] = useState(false);
  const [lastSurroundings, setLastSurroundings] = useState<string | null>(null);
  const [location, setLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [guardians, setGuardians] = useState<Guardian[]>([]);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [newPhone, setNewPhone] = useState('');
  const [shakeSensitivity, setShakeSensitivity] = useState<'low' | 'medium' | 'high'>('medium');
  const [showSafetyCheck, setShowSafetyCheck] = useState(false);
  const [safetyCheckCountdown, setSafetyCheckCountdown] = useState(60);
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [isSendingTestNotification, setIsSendingTestNotification] = useState(false);
  const [safetyLogs, setSafetyLogs] = useState<SafetyNotification[]>([]);
  const [showSafetyLogs, setShowSafetyLogs] = useState(false);
  const [showAI, setShowAI] = useState(false);
  const [lastAnalysis, setLastAnalysis] = useState<string>('');
  const [remoteGuardians, setRemoteGuardians] = useState<any[]>([]);
  const [aiSummary, setAiSummary] = useState<string>('');
  const [isGeneratingSummary, setIsGeneratingSummary] = useState(false);
  
  const socketRef = useRef<Socket | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const notificationIntervalRef = useRef<number | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const oscillatorRef = useRef<OscillatorNode | null>(null);
  const lfoRef = useRef<OscillatorNode | null>(null);
  const gainNodeRef = useRef<GainNode | null>(null);

  const startBuzzer = () => {
    try {
      if (!audioContextRef.current) {
        audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      }
      
      const ctx = audioContextRef.current;
      if (ctx.state === 'suspended') {
        ctx.resume();
      }

      const osc = ctx.createOscillator();
      const lfo = ctx.createOscillator();
      const lfoGain = ctx.createGain();
      const gain = ctx.createGain();
      
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(880, ctx.currentTime);
      
      lfo.type = 'sine';
      lfo.frequency.setValueAtTime(2, ctx.currentTime);
      lfoGain.gain.setValueAtTime(440, ctx.currentTime);
      
      lfo.connect(lfoGain);
      lfoGain.connect(osc.frequency);
      
      gain.gain.setValueAtTime(0.15, ctx.currentTime);
      
      osc.connect(gain);
      gain.connect(ctx.destination);
      
      osc.start();
      lfo.start();

      oscillatorRef.current = osc;
      lfoRef.current = lfo;
      gainNodeRef.current = gain;
    } catch (err) {
      console.error('Buzzer error:', err);
    }
  };

  const stopBuzzer = () => {
    if (oscillatorRef.current) {
      try {
        oscillatorRef.current.stop();
        oscillatorRef.current.disconnect();
      } catch (e) {}
      oscillatorRef.current = null;
    }
    if (lfoRef.current) {
      try {
        lfoRef.current.stop();
        lfoRef.current.disconnect();
      } catch (e) {}
      lfoRef.current = null;
    }
    if (gainNodeRef.current) {
      try {
        gainNodeRef.current.disconnect();
      } catch (e) {}
      gainNodeRef.current = null;
    }
  };

  // Notification permission
  useEffect(() => {
    if ("Notification" in window && Notification.permission === "default") {
      Notification.requestPermission();
    }
  }, []);

  // 5-minute notification interval during walk
  useEffect(() => {
    if (isTracking) {
      const triggerSafetyCheck = async () => {
        // 1. Show in-app modal
        setShowSafetyCheck(true);
        setSafetyCheckCountdown(60);

        // 2. Queue Firebase SMS Notification (Simulated)
        if (auth.currentUser && userProfile?.phoneNumber) {
          try {
            await addDoc(collection(db, 'notifications'), {
              userId: auth.currentUser.uid,
              type: 'sms',
              recipient: userProfile.phoneNumber,
              message: 'WalkWithMe Safety Check: Are you safe? Please check the app. If no response, guardians will be alerted.',
              status: 'pending',
              timestamp: new Date().toISOString()
            });
          } catch (err) {
            handleFirestoreError(err, OperationType.CREATE, 'notifications');
          }
        }

        // 3. Browser Notification
        if ("Notification" in window && Notification.permission === "granted") {
          new Notification("WalkWithMe: Safety Check", {
            body: "Are you safe? Please respond in the app within 60 seconds.",
            icon: "/shield.png"
          });
        }
      };

      notificationIntervalRef.current = window.setInterval(triggerSafetyCheck, 5 * 60 * 1000);
    } else {
      if (notificationIntervalRef.current) {
        clearInterval(notificationIntervalRef.current);
        notificationIntervalRef.current = null;
      }
      setShowSafetyCheck(false);
    }

    return () => {
      if (notificationIntervalRef.current) {
        clearInterval(notificationIntervalRef.current);
      }
      stopBuzzer();
    };
  }, [isTracking, userProfile]);

  // Safety Check Countdown Logic
  useEffect(() => {
    let timer: number;
    if (showSafetyCheck && safetyCheckCountdown > 0) {
      timer = window.setInterval(() => {
        setSafetyCheckCountdown(prev => prev - 1);
      }, 1000);
    } else if (showSafetyCheck && safetyCheckCountdown === 0) {
      // Timeout! Trigger SOS
      triggerSOS();
      setShowSafetyCheck(false);
    }

    return () => clearInterval(timer);
  }, [showSafetyCheck, safetyCheckCountdown]);

  useEffect(() => {
    // Initialize Socket.io
    socketRef.current = io();
    
    if (auth.currentUser) {
      socketRef.current.emit('join-room', auth.currentUser.uid);
    }

    socketRef.current.on('remote-location', (data) => {
      console.log('Remote location update:', data);
    });

    socketRef.current.on('sos-alert', (data) => {
      console.log('SOS Alert received from:', data.userId);
    });

    return () => {
      socketRef.current?.disconnect();
    };
  }, []);

  useEffect(() => {
    if (location && isSOSActive && auth.currentUser) {
      socketRef.current?.emit('location-update', {
        roomId: auth.currentUser.uid,
        userId: auth.currentUser.uid,
        lat: location.lat,
        lng: location.lng,
        timestamp: new Date().toISOString()
      });
    }
  }, [location, isSOSActive]);

  useEffect(() => {
    const generateSummary = async () => {
      if (!auth.currentUser || isGeneratingSummary) return;
      setIsGeneratingSummary(true);
      try {
        const response = await ai.models.generateContent({
          model: "gemini-3.1-flash-lite-preview",
          contents: `Provide a very brief (1 sentence) safety status summary for a user. 
          Current status: ${isSOSActive ? 'EMERGENCY ACTIVE' : isTracking ? 'Walking home' : 'Safe at home'}. 
          Guardians: ${guardians.length}. 
          Last surroundings: ${lastSurroundings ? 'Captured' : 'None'}.`
        });
        setAiSummary(response.text || "You're all set. Stay alert.");
      } catch (e) {
        console.error("Summary error:", e);
      } finally {
        setIsGeneratingSummary(false);
      }
    };

    const interval = setInterval(generateSummary, 60000); // Update every minute
    generateSummary();
    return () => clearInterval(interval);
  }, [isSOSActive, isTracking, guardians.length, lastSurroundings]);

  // Fetch User Profile
  useEffect(() => {
    if (!auth.currentUser) return;
    const unsubscribe = onSnapshot(doc(db, 'users', auth.currentUser.uid), (doc) => {
      if (doc.exists()) {
        const data = doc.data() as UserProfile;
        setUserProfile(data);
        if (data.shakeSensitivity) {
          setShakeSensitivity(data.shakeSensitivity);
        }
      }
    }, (error) => {
      handleFirestoreError(error, OperationType.GET, `users/${auth.currentUser?.uid}`);
    });
    return unsubscribe;
  }, []);

  // Fetch Guardians
  useEffect(() => {
    if (!auth.currentUser) return;
    const q = query(collection(db, 'guardians'), where('userId', '==', auth.currentUser.uid));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const list = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Guardian));
      setGuardians(list);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'guardians');
    });
    return unsubscribe;
  }, []);

  // Fetch Safety Logs
  useEffect(() => {
    if (!auth.currentUser) return;
    const q = query(
      collection(db, 'notifications'), 
      where('userId', '==', auth.currentUser.uid),
      orderBy('timestamp', 'desc'),
      limit(10)
    );
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const logs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as SafetyNotification));
      setSafetyLogs(logs);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'notifications');
    });
    return unsubscribe;
  }, []);

  // Check location permission and get initial location on mount
  useEffect(() => {
    if ("permissions" in navigator) {
      navigator.permissions.query({ name: 'geolocation' as PermissionName }).then((result) => {
        if (result.state === 'denied') {
          setLocationError("Location access is denied. Please enable it in your browser settings to use safety features.");
        } else {
          // Get initial location
          navigator.geolocation.getCurrentPosition(
            (pos) => {
              setLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude });
            },
            (err) => console.error("Initial location error:", err)
          );
        }
        result.onchange = () => {
          if (result.state === 'denied') {
            setLocationError("Location access is denied. Please enable it in your browser settings.");
          } else {
            setLocationError(null);
            // Retry getting location
            navigator.geolocation.getCurrentPosition(
              (pos) => setLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
              (err) => console.error(err)
            );
          }
        };
      });
    }
  }, []);

  // Shake detection
  useEffect(() => {
    let lastX: number, lastY: number, lastZ: number;
    let moveCounter = 0;

    const handleMotion = (event: DeviceMotionEvent) => {
      const { x, y, z } = event.accelerationIncludingGravity || {};
      if (x === null || y === null || z === null) return;

      if (lastX !== undefined) {
        const deltaX = Math.abs(lastX - (x || 0));
        const deltaY = Math.abs(lastY - (y || 0));
        const deltaZ = Math.abs(lastZ - (z || 0));

        const thresholds = {
          low: { force: 45, count: 8 },
          medium: { force: 30, count: 5 },
          high: { force: 15, count: 3 }
        };

        const config = thresholds[shakeSensitivity];

        if (deltaX + deltaY + deltaZ > config.force) {
          moveCounter++;
          if (moveCounter > config.count) {
            triggerSOS();
            moveCounter = 0;
          }
        } else {
          moveCounter = Math.max(0, moveCounter - 1);
        }
      }

      lastX = x || 0;
      lastY = y || 0;
      lastZ = z || 0;
    };

    window.addEventListener('devicemotion', handleMotion);
    return () => window.removeEventListener('devicemotion', handleMotion);
  }, [shakeSensitivity]);

  // Location tracking
  useEffect(() => {
    let watchId: number;
    if (isTracking) {
      watchId = navigator.geolocation.watchPosition(
        (pos) => {
          setLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude });
          setLocationError(null);
        },
        (err) => {
          console.error(err);
          if (err.code === err.PERMISSION_DENIED) {
            setLocationError("Location access denied. Please enable it to use live tracking.");
          }
        },
        { enableHighAccuracy: true }
      );
    }
    return () => navigator.geolocation.clearWatch(watchId);
  }, [isTracking]);

  const startRecording = async (alertId: string) => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        audioChunksRef.current.push(event.data);
      };

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        const reader = new FileReader();
        reader.readAsDataURL(audioBlob);
        reader.onloadend = async () => {
          const base64Audio = reader.result as string;
          if (auth.currentUser) {
            try {
              await addDoc(collection(db, 'recordings'), {
                userId: auth.currentUser.uid,
                alertId,
                timestamp: new Date().toISOString(),
                audioUrl: base64Audio.substring(0, 100000), // Store partial or metadata in real app
              });
            } catch (err) {
              handleFirestoreError(err, OperationType.CREATE, 'recordings');
            }
          }
        };
      };

      mediaRecorder.start();
      setIsRecording(true);
      
      // Stop recording after 30 seconds
      setTimeout(() => {
        if (mediaRecorder.state === 'recording') {
          mediaRecorder.stop();
          setIsRecording(false);
        }
      }, 30000);
    } catch (err) {
      console.error('Recording error:', err);
    }
  };

  // AI Summary Logic
  useEffect(() => {
    if (!auth.currentUser || isGeneratingSummary) return;

    const updateSummary = async () => {
      setIsGeneratingSummary(true);
      try {
        const summary = await getSafetySummary(location, isTracking, isSOSActive);
        setAiSummary(summary);
      } catch (error) {
        console.error('Error generating summary:', error);
      } finally {
        setIsGeneratingSummary(false);
      }
    };

    const interval = setInterval(updateSummary, 60000); // Update every minute
    updateSummary(); // Initial update

    return () => clearInterval(interval);
  }, [location, isTracking, isSOSActive]);

  const triggerSOS = async () => {
    if (isSOSActive) {
      setIsSOSActive(false);
      stopBuzzer();
      return;
    }
    if (!auth.currentUser) return;
    setIsSOSActive(true);
    startBuzzer();
    
    const userPhone = userProfile?.phoneNumber || 'Unknown';
    
    const sendFirebaseSmsNotification = async (recipient: string, message: string) => {
      if (!auth.currentUser) return;
      try {
        // 1. Queue in Firestore for logs
        const notificationRef = await addDoc(collection(db, 'notifications'), {
          userId: auth.currentUser.uid,
          type: 'sms',
          recipient,
          message,
          status: 'pending',
          timestamp: new Date().toISOString()
        });

        // 2. Call backend to send real SMS
        try {
          const response = await fetch('/api/send-sms', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ to: recipient, message })
          });
          
          if (response.ok) {
            const { updateDoc } = await import('firebase/firestore');
            await updateDoc(notificationRef, { status: 'sent' });
          } else {
            const { updateDoc } = await import('firebase/firestore');
            await updateDoc(notificationRef, { status: 'failed' });
          }
        } catch (apiErr) {
          console.error('Backend SMS API error:', apiErr);
          const { updateDoc } = await import('firebase/firestore');
          await updateDoc(notificationRef, { status: 'failed' });
        }
      } catch (err) {
        handleFirestoreError(err, OperationType.CREATE, 'notifications');
      }
    };

    const handleOfflineAlert = () => {
      if (guardians.length > 0) {
        const numbers = guardians.map(g => g.phoneNumber).join(',');
        const locStr = location ? ` My last location: https://www.google.com/maps?q=${location.lat},${location.lng}` : '';
        const message = `EMERGENCY ALERT! This is ${userProfile?.displayName || 'me'}. I need help.${locStr}`;
        
        // Open SMS app as fallback
        window.location.href = `sms:${numbers}?body=${encodeURIComponent(message)}`;
        alert('You are offline. Opening SMS app to notify guardians.');
      } else {
        alert('You are offline and have no guardians added. Please find a safe place.');
      }
      setIsSOSActive(false);
    };

    if (!navigator.onLine) {
      handleOfflineAlert();
      return;
    }

    // Get current location
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        const mapsLink = `https://www.google.com/maps?q=${lat},${lng}`;
        
        try {
          const alertDoc = await addDoc(collection(db, 'alerts'), {
            userId: auth.currentUser?.uid,
            userPhone,
            timestamp: new Date().toISOString(),
            location: { latitude: lat, longitude: lng },
            mapsLink,
            status: 'active'
          });

          // Trigger Firebase SMS Notifications for each guardian
          for (const guardian of guardians) {
            await sendFirebaseSmsNotification(
              guardian.phoneNumber, 
              `EMERGENCY ALERT from ${userProfile?.displayName || 'WalkWithMe User'}: I need help! My location: ${mapsLink}`
            );
          }

          // Start recording if enabled
          if (isAutoRecordEnabled) {
            startRecording(alertDoc.id);
          }

          console.log('Alert Triggered! Alert sent to guardians via Firebase.');
          // alert('EMERGENCY ALERT TRIGGERED! Firebase is sending SMS notifications to your guardians.');
        } catch (err) {
          console.error('Alert Error:', err);
          handleOfflineAlert();
        }
      },
      (err) => {
        console.error('Location error:', err);
        setIsSOSActive(false);
        stopBuzzer();
        if (err.code === err.PERMISSION_DENIED) {
          alert('Location access denied. Please enable location permissions to send alerts.');
        } else {
          alert('Could not get your location. Opening SMS fallback.');
          handleOfflineAlert();
        }
      }
    );
  };

  const handleShareLocation = async () => {
    if (!location) {
      alert('Getting your location... please wait.');
      navigator.geolocation.getCurrentPosition((pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        const mapsLink = `https://www.google.com/maps?q=${lat},${lng}`;
        shareLink(mapsLink);
      });
      return;
    }
    const mapsLink = `https://www.google.com/maps?q=${location.lat},${location.lng}`;
    shareLink(mapsLink);
  };

  const shareLink = async (link: string) => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: 'My Current Location - WalkWithMe',
          text: 'I am sharing my current location for safety.',
          url: link,
        });
      } catch (err) {
        console.error('Share failed:', err);
      }
    } else {
      // Fallback: copy to clipboard
      navigator.clipboard.writeText(link);
      alert('Location link copied to clipboard!');
    }
  };

  const handleCaptureSurroundings = async (imageData: string) => {
    setLastSurroundings(imageData);
    if (auth.currentUser) {
      try {
        // Optional: Analyze image with Gemini for safety context
        let analysis = "";
        try {
          const response = await ai.models.generateContent({
            model: "gemini-3.1-flash-lite-preview",
            contents: [
              { text: "Analyze this surroundings image for a personal safety app. Identify landmarks, lighting conditions, and any potential safety concerns. Be concise." },
              { inlineData: { data: imageData.split(',')[1], mimeType: "image/jpeg" } }
            ]
          });
          analysis = response.text || "";
          setLastAnalysis(analysis);
        } catch (e) {
          console.error("Gemini analysis error:", e);
        }

        await addDoc(collection(db, 'surroundings'), {
          userId: auth.currentUser.uid,
          timestamp: new Date().toISOString(),
          imageData: imageData.substring(0, 100000), // Real app would use Storage
          location: location ? { latitude: location.lat, longitude: location.lng } : null,
          analysis
        });
        alert('Surroundings captured and analyzed by AI.');
      } catch (err) {
        handleFirestoreError(err, OperationType.CREATE, 'surroundings');
      }
    }
  };

  const handleUpdateProfile = async () => {
    if (!auth.currentUser || !newPhone) return;
    setIsSavingProfile(true);
    try {
      const { updateDoc } = await import('firebase/firestore');
      const userRef = doc(db, 'users', auth.currentUser.uid);
      await updateDoc(userRef, {
        phoneNumber: newPhone,
        shakeSensitivity: shakeSensitivity
      });
      setShowProfile(false);
      alert('Profile updated successfully!');
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `users/${auth.currentUser?.uid}`);
    } finally {
      setIsSavingProfile(false);
    }
  };

  const sendTestSmsNotification = async () => {
    if (!auth.currentUser || !userProfile?.phoneNumber) {
      alert('Please add your phone number first.');
      setShowProfile(true);
      return;
    }
    
    setIsSendingTestNotification(true);
    try {
      await addDoc(collection(db, 'notifications'), {
        userId: auth.currentUser.uid,
        type: 'sms',
        recipient: userProfile.phoneNumber,
        message: 'WalkWithMe: This is a test safety notification sent via Firebase.',
        status: 'pending',
        timestamp: new Date().toISOString()
      });
      alert('Test SMS notification queued in Firebase!');
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, 'notifications');
    } finally {
      setIsSendingTestNotification(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#050505] text-white pb-24 selection:bg-indigo-500/30">
      {/* Header */}
      <header className="glass px-6 py-8 flex items-center justify-between sticky top-0 z-40">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center shadow-lg shadow-indigo-500/20">
            <Shield className="text-white w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl font-black text-white leading-tight tracking-tight">WalkWithMe</h1>
            <div className="flex items-center gap-1.5">
              <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
              <span className="text-[10px] font-bold text-white/40 uppercase tracking-widest">System Active</span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button 
            onClick={() => setShowGuardians(true)}
            className="p-3 bg-white/5 hover:bg-white/10 rounded-2xl transition-colors relative"
          >
            <Users className="w-6 h-6 text-white/70" />
          </button>
          <button 
            onClick={() => auth.signOut()}
            className="p-3 bg-white/5 hover:bg-white/10 rounded-2xl transition-colors"
          >
            <LogOut className="w-6 h-6 text-white/70" />
          </button>
        </div>
      </header>

      <main className="p-6 max-w-lg mx-auto space-y-8">
        {/* AI Safety Summary */}
        <motion.section 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="glass rounded-[32px] p-6 relative overflow-hidden group"
        >
          <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
            <Sparkles className="w-12 h-12 text-indigo-400" />
          </div>
          <div className="flex items-center gap-2 mb-3">
            <div className={`w-2 h-2 rounded-full ${isGeneratingSummary ? 'bg-indigo-400 animate-pulse' : 'bg-indigo-500'}`} />
            <span className="text-[10px] font-black uppercase tracking-widest text-indigo-400">AI Safety Status</span>
          </div>
          <p className="text-lg font-medium leading-tight text-white/90">
            {isGeneratingSummary && !aiSummary ? "Analyzing safety context..." : aiSummary || "System monitoring active. You are currently in a safe zone."}
          </p>
        </motion.section>

        {locationError && (
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-rose-500/10 border border-rose-500/20 p-4 rounded-2xl flex items-start gap-3 text-rose-400 text-sm font-medium"
          >
            <AlertCircle className="w-5 h-5 flex-shrink-0" />
            <p>{locationError}</p>
          </motion.div>
        )}

        {userProfile && !userProfile.phoneNumber && (
          <motion.div 
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-indigo-500/10 border border-indigo-500/20 p-4 rounded-2xl flex items-center justify-between gap-3 text-indigo-400 text-sm font-medium"
          >
            <div className="flex items-center gap-3">
              <Phone className="w-5 h-5 flex-shrink-0" />
              <p>Add your phone number to activate SMS alerts.</p>
            </div>
            <button 
              onClick={() => {
                setNewPhone('');
                setShowProfile(true);
              }}
              className="bg-indigo-600 text-white px-4 py-1.5 rounded-xl font-bold text-xs"
            >
              Add
            </button>
          </motion.div>
        )}
        
        {/* Alert Button Section */}
        <section className="text-center py-6">
          <motion.button
            whileTap={{ scale: 0.9 }}
            onClick={triggerSOS}
            className={`w-56 h-56 rounded-full flex flex-col items-center justify-center gap-4 shadow-2xl transition-all relative ${
              isSOSActive 
                ? 'bg-rose-600 sos-glow' 
                : 'bg-rose-500/10 border-4 border-rose-500/20 hover:bg-rose-500/20'
            }`}
          >
            <AnimatePresence>
              {isSOSActive && (
                <motion.div
                  initial={{ scale: 1, opacity: 0.5 }}
                  animate={{ scale: 1.5, opacity: 0 }}
                  transition={{ duration: 1.5, repeat: Infinity }}
                  className="absolute inset-0 bg-rose-500 rounded-full"
                />
              )}
            </AnimatePresence>
            <AlertCircle className={`w-20 h-20 ${isSOSActive ? 'text-white' : 'text-rose-500'}`} />
            <span className={`text-3xl font-black uppercase tracking-tighter ${isSOSActive ? 'text-white' : 'text-rose-500'}`}>
              {isSOSActive ? 'Stop' : 'Alert'}
            </span>
          </motion.button>
          <p className="mt-6 text-white/30 font-medium text-sm tracking-wide">
            {isSOSActive ? 'Emergency Alert Active' : 'Press or Shake for Emergency'}
          </p>
        </section>

        {/* Action Grid */}
        <div className="grid grid-cols-2 gap-4">
          <ActionButton 
            icon={<Phone className="w-7 h-7" />}
            label="Fake Call"
            color="bg-white/5"
            onClick={() => setShowFakeCall(true)}
          />
          <ActionButton 
            icon={<Timer className="w-7 h-7" />}
            label="Safety Timer"
            color="bg-white/5"
            onClick={() => setShowTimer(true)}
          />
          <ActionButton 
            icon={<Camera className="w-7 h-7" />}
            label="Surroundings"
            color="bg-white/5"
            onClick={() => setShowCamera(true)}
          />
          <ActionButton 
            icon={isAutoRecordEnabled ? <Volume2 className="w-7 h-7" /> : <VolumeX className="w-7 h-7" />}
            label={isAutoRecordEnabled ? "Auto-Record ON" : "Auto-Record OFF"}
            color={isAutoRecordEnabled ? "bg-emerald-500/20" : "bg-white/5"}
            onClick={() => setIsAutoRecordEnabled(!isAutoRecordEnabled)}
            active={isAutoRecordEnabled}
          />
          <ActionButton 
            icon={<MapPin className="w-7 h-7" />}
            label={isTracking ? "Finish Walking" : "Start Walking"}
            color={isTracking ? "bg-emerald-500/20" : "bg-white/5"}
            onClick={() => setIsTracking(!isTracking)}
            active={isTracking}
          />
          <ActionButton 
            icon={<History className="w-7 h-7" />}
            label="Safety Logs"
            color="bg-white/5"
            onClick={() => setShowSafetyLogs(true)}
          />
          <ActionButton 
            icon={<Sparkles className="w-7 h-7" />}
            label="Safety AI"
            color="bg-indigo-600/20"
            onClick={() => setShowAI(true)}
          />
        </div>

        {/* Surroundings Card */}
        {lastSurroundings && (
          <div className="glass rounded-[32px] p-2 overflow-hidden">
            <div className="p-4 flex items-center justify-between">
              <h3 className="font-bold text-white">Last Surroundings</h3>
              <span className="text-[10px] bg-white/10 text-white/50 px-2 py-0.5 rounded-full font-bold uppercase tracking-wider">
                Captured
              </span>
            </div>
            <div className="w-full aspect-video bg-white/5 rounded-[24px] overflow-hidden">
              <img src={lastSurroundings} alt="Last Surroundings" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
            </div>
            {lastAnalysis && (
              <div className="p-4 bg-indigo-500/5">
                <div className="flex items-center gap-2 mb-2">
                  <Sparkles className="w-4 h-4 text-indigo-400" />
                  <span className="text-[10px] font-black uppercase tracking-widest text-indigo-400">AI Safety Analysis</span>
                </div>
                <p className="text-xs text-white/60 font-medium leading-relaxed italic">
                  "{lastAnalysis}"
                </p>
              </div>
            )}
          </div>
        )}

        {/* User Info Card */}
        {userProfile && (
          <div className="glass rounded-[32px] p-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 bg-white/5 rounded-2xl flex items-center justify-center">
                  <UserIcon className="w-8 h-8 text-white/20" />
                </div>
                <div>
                  <h3 className="font-bold text-white text-lg">{userProfile.displayName}</h3>
                  <div className="flex flex-col gap-0.5">
                    <div className="flex items-center gap-1.5 text-white/40 text-xs">
                      <Calendar className="w-3.5 h-3.5" />
                      <span>Joined {new Date(userProfile.createdAt).toLocaleDateString()}</span>
                    </div>
                    {userProfile.phoneNumber && (
                      <div className="flex items-center gap-1.5 text-indigo-400 text-xs font-bold">
                        <Phone className="w-3.5 h-3.5" />
                        <span>{userProfile.phoneNumber}</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
              <button 
                onClick={() => {
                  setNewPhone(userProfile.phoneNumber || '');
                  setShowProfile(true);
                }}
                className="p-2 hover:bg-white/5 rounded-xl transition-colors"
              >
                <RefreshCw className="w-5 h-5 text-white/20" />
              </button>
            </div>
          </div>
        )}

        {/* Guardians List Card */}
        <div className="glass rounded-[32px] p-6">
          <div className="flex items-center justify-between mb-6">
            <h3 className="font-bold text-white text-lg">My Guardians</h3>
            <button 
              onClick={() => setShowGuardians(true)}
              className="text-indigo-400 font-bold text-sm hover:underline"
            >
              Manage
            </button>
          </div>
          <div className="space-y-4">
            {guardians.length === 0 ? (
              <p className="text-white/30 text-sm italic">No guardians added yet.</p>
            ) : (
              guardians.map((g) => (
                <div key={g.id} className="flex items-center justify-between p-4 bg-white/5 rounded-2xl border border-white/5">
                  <div>
                    <p className="font-bold text-white">{g.name}</p>
                    <p className="text-xs text-white/40 uppercase tracking-wider font-medium">{g.relationship}</p>
                  </div>
                  <a 
                    href={`tel:${g.phoneNumber}`}
                    className="w-10 h-10 bg-white/5 rounded-xl flex items-center justify-center border border-white/10 text-indigo-400 shadow-sm"
                  >
                    <Phone className="w-5 h-5" />
                  </a>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Live Map Card */}
        <div className="glass rounded-[32px] p-2 overflow-hidden">
          <div className="p-4 flex items-center justify-between">
            <h3 className="font-bold text-white">Live Map</h3>
            {location && (
              <span className="text-[10px] bg-emerald-500/20 text-emerald-400 px-2 py-0.5 rounded-full font-bold uppercase tracking-wider">
                Live
              </span>
            )}
          </div>
          <div className="w-full aspect-video bg-white/5 rounded-[24px] overflow-hidden relative">
            {location ? (
              <iframe
                title="Live Location Map"
                width="100%"
                height="100%"
                frameBorder="0"
                style={{ border: 0, filter: 'invert(90%) hue-rotate(180deg) brightness(0.8) contrast(1.2)' }}
                src={`https://maps.google.com/maps?q=${location.lat},${location.lng}&z=15&output=embed`}
                allowFullScreen
                referrerPolicy="no-referrer"
              />
            ) : (
              <div className="absolute inset-0 flex flex-col items-center justify-center text-white/20 p-6 text-center">
                <MapPin className="w-10 h-10 mb-2 opacity-20" />
                <p className="text-sm font-medium">Enable Live Tracking to see your map</p>
              </div>
            )}
          </div>
        </div>

        {/* Status Card */}
        <div className="glass rounded-[32px] p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-bold text-white">Safety Status</h3>
            <Activity className="w-5 h-5 text-emerald-500" />
          </div>
          <div className="space-y-4">
            <StatusItem 
              label="GPS Location" 
              value={location ? `${location.lat.toFixed(4)}, ${location.lng.toFixed(4)}` : "Not Tracking"} 
              active={!!location}
            />
            <StatusItem 
              label="Shake Detection" 
              value="Enabled" 
              active={true}
            />
            <StatusItem 
              label="Cloud Sync" 
              value="Connected" 
              active={true}
            />
          </div>
          
          <div className="mt-6 pt-6 border-t border-white/5">
            <button 
              onClick={sendTestSmsNotification}
              disabled={isSendingTestNotification}
              className="w-full py-3 bg-white/5 hover:bg-white/10 rounded-2xl text-indigo-400 text-xs font-bold flex items-center justify-center gap-2 transition-colors"
            >
              {isSendingTestNotification ? (
                <RefreshCw className="w-4 h-4 animate-spin" />
              ) : (
                <>
                  <Volume2 className="w-4 h-4" />
                  <span>Test Firebase SMS Notification</span>
                </>
              )}
            </button>
          </div>
        </div>
      </main>
          
          <div className="mt-6 pt-6 border-t border-slate-50">
            <button 
              onClick={sendTestSmsNotification}
              disabled={isSendingTestNotification}
              className="w-full py-3 bg-slate-50 hover:bg-slate-100 rounded-2xl text-indigo-600 text-xs font-bold flex items-center justify-center gap-2 transition-colors"
            >
              {isSendingTestNotification ? (
                <RefreshCw className="w-4 h-4 animate-spin" />
              ) : (
                <>
                  <Volume2 className="w-4 h-4" />
                  <span>Test Firebase SMS Notification</span>
                </>
              )}
            </button>
          </div>
        </div>
      </main>

      {/* Modals */}
      <AnimatePresence>
        {showGuardians && <GuardianManager onClose={() => setShowGuardians(false)} />}
        {showFakeCall && <FakeCall onClose={() => setShowFakeCall(false)} />}
        {showTimer && <SafetyTimer onTriggerSOS={triggerSOS} onClose={() => setShowTimer(false)} />}
        {showCamera && <CameraCapture onCapture={handleCaptureSurroundings} onClose={() => setShowCamera(false)} />}
        {showAI && <SafetyAssistant onClose={() => setShowAI(false)} location={location} />}
        
        {showSafetyCheck && (
          <div className="fixed inset-0 bg-rose-600/90 backdrop-blur-xl z-[100] flex items-center justify-center p-6">
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="glass w-full max-w-md rounded-[40px] p-8 text-center shadow-2xl"
            >
              <div className="w-20 h-20 bg-rose-500/20 rounded-full flex items-center justify-center mx-auto mb-6">
                <ShieldAlert className="w-10 h-10 text-rose-500 animate-pulse" />
              </div>
              
              <h2 className="text-3xl font-black text-white mb-2">Safety Check</h2>
              <p className="text-white/50 font-medium mb-8">
                Are you safe? Please respond. If you don't respond in <span className="text-rose-500 font-bold">{safetyCheckCountdown}s</span>, we will alert your guardians.
              </p>

              <div className="space-y-4">
                <button 
                  onClick={() => setShowSafetyCheck(false)}
                  className="w-full bg-emerald-500 hover:bg-emerald-600 text-white font-black py-5 rounded-3xl shadow-xl shadow-emerald-500/20 transition-all flex items-center justify-center gap-3"
                >
                  <CheckCircle className="w-6 h-6" />
                  <span>I'm Safe</span>
                </button>

                <button 
                  onClick={() => {
                    triggerSOS();
                    setShowSafetyCheck(false);
                  }}
                  className="w-full bg-rose-600 hover:bg-rose-700 text-white font-black py-5 rounded-3xl shadow-xl shadow-rose-500/20 transition-all flex items-center justify-center gap-3"
                >
                  <AlertCircle className="w-6 h-6" />
                  <span>I'm Not Safe</span>
                </button>
              </div>
            </motion.div>
          </div>
        )}
        
        {showProfile && (
          <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-50 flex items-end sm:items-center justify-center p-4">
            <motion.div 
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              className="glass w-full max-w-md rounded-t-[40px] sm:rounded-[40px] p-8 shadow-2xl"
            >
              <div className="flex items-center justify-between mb-8">
                <h2 className="text-2xl font-black text-white">Profile Settings</h2>
                <button onClick={() => setShowProfile(false)} className="p-2 hover:bg-white/5 rounded-full">
                  <X className="w-6 h-6 text-white/30" />
                </button>
              </div>
              
              <div className="space-y-6">
                <div>
                  <label className="block text-[10px] font-bold text-white/30 uppercase tracking-widest mb-2 ml-1">
                    Mobile Number
                  </label>
                  <div className="relative">
                    <Phone className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-white/20" />
                    <input 
                      type="tel"
                      placeholder="+1 234 567 8900"
                      value={newPhone}
                      onChange={(e) => setNewPhone(e.target.value)}
                      className="w-full bg-white/5 border border-white/10 rounded-2xl py-4 pl-12 pr-4 font-bold text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                    />
                  </div>
                  <p className="mt-2 text-[10px] text-white/30 font-medium ml-1">
                    Used for SMS alerts and guardian notifications.
                  </p>
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-white/30 uppercase tracking-widest mb-2 ml-1">
                    Shake Sensitivity
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    {(['low', 'medium', 'high'] as const).map((level) => (
                      <button
                        key={level}
                        onClick={() => setShakeSensitivity(level)}
                        className={`py-3 rounded-xl font-bold text-xs capitalize transition-all ${
                          shakeSensitivity === level
                            ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/20'
                            : 'bg-white/5 text-white/30 border border-white/10 hover:bg-white/10'
                        }`}
                      >
                        {level}
                      </button>
                    ))}
                  </div>
                  <p className="mt-2 text-[10px] text-white/30 font-medium ml-1">
                    Adjust how hard you need to shake to trigger an alert.
                  </p>
                </div>

                <button 
                  onClick={handleUpdateProfile}
                  disabled={isSavingProfile || !newPhone}
                  className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-black py-5 rounded-3xl shadow-xl shadow-indigo-500/20 transition-all flex items-center justify-center gap-2"
                >
                  {isSavingProfile ? (
                    <RefreshCw className="w-6 h-6 animate-spin" />
                  ) : (
                    <>
                      <Check className="w-6 h-6" />
                      <span>Save Profile</span>
                    </>
                  )}
                </button>
              </div>
            </motion.div>
          </div>
        )}

        {showSafetyLogs && (
          <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-50 flex items-end sm:items-center justify-center p-4">
            <motion.div 
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              className="glass w-full max-w-md rounded-t-[40px] sm:rounded-[40px] p-8 shadow-2xl flex flex-col max-h-[80vh]"
            >
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-white/5 rounded-xl flex items-center justify-center">
                    <History className="w-6 h-6 text-white/50" />
                  </div>
                  <h2 className="text-2xl font-black text-white">Safety Logs</h2>
                </div>
                <button onClick={() => setShowSafetyLogs(false)} className="p-2 hover:bg-white/5 rounded-full">
                  <X className="w-6 h-6 text-white/30" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto pr-2 -mr-2 space-y-4 custom-scrollbar">
                {safetyLogs.length === 0 ? (
                  <div className="text-center py-12">
                    <MessageSquare className="w-12 h-12 text-white/10 mx-auto mb-4" />
                    <p className="text-white/30 font-medium">No alerts triggered yet.</p>
                  </div>
                ) : (
                  safetyLogs.map((log) => (
                    <div key={log.id} className="p-4 bg-white/5 rounded-2xl border border-white/5 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className={`text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full ${
                          log.status === 'sent' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-amber-500/20 text-amber-400'
                        }`}>
                          {log.status}
                        </span>
                        <span className="text-[10px] text-white/30 font-bold">
                          {new Date(log.timestamp).toLocaleString()}
                        </span>
                      </div>
                      <p className="text-sm font-bold text-white/90 leading-snug">
                        {log.message}
                      </p>
                      <div className="flex items-center gap-1.5 text-[10px] text-white/30 font-medium">
                        <Phone className="w-3 h-3" />
                        <span>To: {log.recipient}</span>
                      </div>
                    </div>
                  ))
                )}
              </div>
              
              <p className="mt-6 text-[10px] text-white/20 text-center font-medium">
                These logs show the SMS notifications queued in Firebase.
              </p>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};

const ActionButton: React.FC<{ 
  icon: React.ReactNode; 
  label: string; 
  color: string; 
  onClick: () => void;
  active?: boolean;
}> = ({ icon, label, color, onClick, active }) => (
  <motion.button
    whileTap={{ scale: 0.95 }}
    onClick={onClick}
    className={`${color} glass p-6 rounded-[32px] flex flex-col items-center justify-center gap-3 text-white transition-all ${active ? 'ring-2 ring-indigo-500 ring-inset' : ''}`}
  >
    <div className={`${active ? 'text-indigo-400' : 'text-white/70'}`}>
      {icon}
    </div>
    <span className={`font-bold text-xs tracking-tight ${active ? 'text-indigo-400' : 'text-white/50'}`}>{label}</span>
  </motion.button>
);

const StatusItem: React.FC<{ label: string; value: string; active: boolean }> = ({ label, value, active }) => (
  <div className="flex items-center justify-between text-sm">
    <span className="text-white/30 font-medium">{label}</span>
    <span className={`font-bold ${active ? 'text-white/90' : 'text-white/10'}`}>{value}</span>
  </div>
);

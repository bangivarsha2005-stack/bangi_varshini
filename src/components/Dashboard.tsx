import React, { useState, useEffect, useRef } from 'react';
import { auth, db } from '../firebase';
import { doc, getDoc, onSnapshot, query, where, collection, addDoc } from 'firebase/firestore';
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
  ShieldAlert
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { GuardianManager } from './GuardianManager';
import { FakeCall } from './FakeCall';
import { SafetyTimer } from './SafetyTimer';
import { CameraCapture } from './CameraCapture';
import { Guardian, UserProfile } from '../types';

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
            console.error('Safety check notification error:', err);
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
            await addDoc(collection(db, 'recordings'), {
              userId: auth.currentUser.uid,
              alertId,
              timestamp: new Date().toISOString(),
              audioUrl: base64Audio.substring(0, 100000), // Store partial or metadata in real app
            });
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
        await addDoc(collection(db, 'notifications'), {
          userId: auth.currentUser.uid,
          type: 'sms',
          recipient,
          message,
          status: 'pending',
          timestamp: new Date().toISOString()
        });
      } catch (err) {
        console.error('Firebase Notification Error:', err);
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
        await addDoc(collection(db, 'surroundings'), {
          userId: auth.currentUser.uid,
          timestamp: new Date().toISOString(),
          imageData: imageData.substring(0, 100000), // Real app would use Storage
          location: location ? { latitude: location.lat, longitude: location.lng } : null
        });
        alert('Surroundings captured and synced to cloud.');
      } catch (err) {
        console.error('Capture sync error:', err);
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
      console.error('Profile update error:', err);
      alert('Failed to update profile.');
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
      console.error('Test notification error:', err);
      alert('Failed to queue notification.');
    } finally {
      setIsSendingTestNotification(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 pb-24">
      {/* Header */}
      <header className="bg-white px-6 py-8 flex items-center justify-between shadow-sm border-b border-slate-100 sticky top-0 z-40">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-emerald-500 rounded-xl flex items-center justify-center shadow-lg shadow-emerald-100">
            <Shield className="text-white w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl font-black text-slate-900 leading-tight">WalkWithMe</h1>
            <div className="flex items-center gap-1.5">
              <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">System Active</span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button 
            onClick={() => setShowGuardians(true)}
            className="p-3 bg-slate-100 hover:bg-slate-200 rounded-2xl transition-colors relative"
          >
            <Users className="w-6 h-6 text-slate-600" />
          </button>
          <button 
            onClick={() => auth.signOut()}
            className="p-3 bg-slate-100 hover:bg-slate-200 rounded-2xl transition-colors"
          >
            <LogOut className="w-6 h-6 text-slate-600" />
          </button>
        </div>
      </header>

      <main className="p-6 max-w-lg mx-auto space-y-8">
        {locationError && (
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-rose-50 border border-rose-100 p-4 rounded-2xl flex items-start gap-3 text-rose-700 text-sm font-medium"
          >
            <AlertCircle className="w-5 h-5 flex-shrink-0" />
            <p>{locationError}</p>
          </motion.div>
        )}

        {userProfile && !userProfile.phoneNumber && (
          <motion.div 
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-indigo-50 border border-indigo-100 p-4 rounded-2xl flex items-center justify-between gap-3 text-indigo-700 text-sm font-medium"
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
                ? 'bg-rose-600 shadow-rose-200' 
                : 'bg-rose-500 shadow-rose-100 hover:bg-rose-600'
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
            <AlertCircle className="w-20 h-20 text-white" />
            <span className="text-3xl font-black text-white uppercase tracking-tighter">
              {isSOSActive ? 'Stop' : 'Alert'}
            </span>
          </motion.button>
          <p className="mt-6 text-slate-400 font-medium text-sm">
            {isSOSActive ? 'Emergency Alert Active' : 'Press or Shake for Emergency'}
          </p>
        </section>

        {/* Action Grid */}
        <div className="grid grid-cols-2 gap-4">
          <ActionButton 
            icon={<Phone className="w-7 h-7" />}
            label="Fake Call"
            color="bg-indigo-500"
            onClick={() => setShowFakeCall(true)}
          />
          <ActionButton 
            icon={<Timer className="w-7 h-7" />}
            label="Safety Timer"
            color="bg-amber-500"
            onClick={() => setShowTimer(true)}
          />
          <ActionButton 
            icon={<Camera className="w-7 h-7" />}
            label="Surroundings"
            color="bg-slate-800"
            onClick={() => setShowCamera(true)}
          />
          <ActionButton 
            icon={isAutoRecordEnabled ? <Volume2 className="w-7 h-7" /> : <VolumeX className="w-7 h-7" />}
            label={isAutoRecordEnabled ? "Auto-Record ON" : "Auto-Record OFF"}
            color={isAutoRecordEnabled ? "bg-emerald-500" : "bg-slate-400"}
            onClick={() => setIsAutoRecordEnabled(!isAutoRecordEnabled)}
            active={isAutoRecordEnabled}
          />
          <ActionButton 
            icon={<MapPin className="w-7 h-7" />}
            label={isTracking ? "Finish Walking" : "Start Walking"}
            color={isTracking ? "bg-emerald-600" : "bg-emerald-500"}
            onClick={() => setIsTracking(!isTracking)}
            active={isTracking}
          />
          <ActionButton 
            icon={<Share2 className="w-7 h-7" />}
            label="Share Location"
            color="bg-indigo-600"
            onClick={handleShareLocation}
          />
        </div>

        {/* Surroundings Card */}
        {lastSurroundings && (
          <div className="bg-white rounded-[32px] p-2 shadow-sm border border-slate-100 overflow-hidden">
            <div className="p-4 flex items-center justify-between">
              <h3 className="font-bold text-slate-900">Last Surroundings</h3>
              <span className="text-[10px] bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full font-bold uppercase tracking-wider">
                Captured
              </span>
            </div>
            <div className="w-full aspect-video bg-slate-100 rounded-[24px] overflow-hidden">
              <img src={lastSurroundings} alt="Last Surroundings" className="w-full h-full object-cover" />
            </div>
          </div>
        )}

        {/* User Info Card */}
        {userProfile && (
          <div className="bg-white rounded-[32px] p-6 shadow-sm border border-slate-100">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 bg-slate-100 rounded-2xl flex items-center justify-center">
                  <UserIcon className="w-8 h-8 text-slate-400" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-900 text-lg">{userProfile.displayName}</h3>
                  <div className="flex flex-col gap-0.5">
                    <div className="flex items-center gap-1.5 text-slate-500 text-xs">
                      <Calendar className="w-3.5 h-3.5" />
                      <span>Joined {new Date(userProfile.createdAt).toLocaleDateString()}</span>
                    </div>
                    {userProfile.phoneNumber && (
                      <div className="flex items-center gap-1.5 text-indigo-600 text-xs font-bold">
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
                className="p-2 hover:bg-slate-100 rounded-xl transition-colors"
              >
                <RefreshCw className="w-5 h-5 text-slate-400" />
              </button>
            </div>
          </div>
        )}

        {/* Guardians List Card */}
        <div className="bg-white rounded-[32px] p-6 shadow-sm border border-slate-100">
          <div className="flex items-center justify-between mb-6">
            <h3 className="font-bold text-slate-900 text-lg">My Guardians</h3>
            <button 
              onClick={() => setShowGuardians(true)}
              className="text-indigo-600 font-bold text-sm hover:underline"
            >
              Manage
            </button>
          </div>
          <div className="space-y-4">
            {guardians.length === 0 ? (
              <p className="text-slate-400 text-sm italic">No guardians added yet.</p>
            ) : (
              guardians.map((g) => (
                <div key={g.id} className="flex items-center justify-between p-4 bg-slate-50 rounded-2xl border border-slate-100">
                  <div>
                    <p className="font-bold text-slate-900">{g.name}</p>
                    <p className="text-xs text-slate-500 uppercase tracking-wider font-medium">{g.relationship}</p>
                  </div>
                  <a 
                    href={`tel:${g.phoneNumber}`}
                    className="w-10 h-10 bg-white rounded-xl flex items-center justify-center border border-slate-200 text-indigo-600 shadow-sm"
                  >
                    <Phone className="w-5 h-5" />
                  </a>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Live Map Card */}
        <div className="bg-white rounded-[32px] p-2 shadow-sm border border-slate-100 overflow-hidden">
          <div className="p-4 flex items-center justify-between">
            <h3 className="font-bold text-slate-900">Live Map</h3>
            {location && (
              <span className="text-[10px] bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full font-bold uppercase tracking-wider">
                Live
              </span>
            )}
          </div>
          <div className="w-full aspect-video bg-slate-100 rounded-[24px] overflow-hidden relative">
            {location ? (
              <iframe
                title="Live Location Map"
                width="100%"
                height="100%"
                frameBorder="0"
                style={{ border: 0 }}
                src={`https://maps.google.com/maps?q=${location.lat},${location.lng}&z=15&output=embed`}
                allowFullScreen
                referrerPolicy="no-referrer"
              />
            ) : (
              <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-400 p-6 text-center">
                <MapPin className="w-10 h-10 mb-2 opacity-20" />
                <p className="text-sm font-medium">Enable Live Tracking to see your map</p>
              </div>
            )}
          </div>
        </div>

        {/* Status Card */}
        <div className="bg-white rounded-[32px] p-6 shadow-sm border border-slate-100">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-bold text-slate-900">Safety Status</h3>
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
        
        {showSafetyCheck && (
          <div className="fixed inset-0 bg-rose-600 z-[100] flex items-center justify-center p-6">
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="bg-white w-full max-w-md rounded-[40px] p-8 text-center shadow-2xl"
            >
              <div className="w-20 h-20 bg-rose-100 rounded-full flex items-center justify-center mx-auto mb-6">
                <ShieldAlert className="w-10 h-10 text-rose-600 animate-pulse" />
              </div>
              
              <h2 className="text-3xl font-black text-slate-900 mb-2">Safety Check</h2>
              <p className="text-slate-500 font-medium mb-8">
                Are you safe? Please respond. If you don't respond in <span className="text-rose-600 font-bold">{safetyCheckCountdown}s</span>, we will alert your guardians.
              </p>

              <div className="space-y-4">
                <button 
                  onClick={() => setShowSafetyCheck(false)}
                  className="w-full bg-emerald-500 hover:bg-emerald-600 text-white font-black py-5 rounded-3xl shadow-xl shadow-emerald-200 transition-all flex items-center justify-center gap-3"
                >
                  <CheckCircle className="w-6 h-6" />
                  <span>I'm Safe</span>
                </button>

                <button 
                  onClick={() => {
                    triggerSOS();
                    setShowSafetyCheck(false);
                  }}
                  className="w-full bg-rose-600 hover:bg-rose-700 text-white font-black py-5 rounded-3xl shadow-xl shadow-rose-200 transition-all flex items-center justify-center gap-3"
                >
                  <AlertCircle className="w-6 h-6" />
                  <span>I'm Not Safe</span>
                </button>
              </div>
            </motion.div>
          </div>
        )}
        
        {showProfile && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-4">
            <motion.div 
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              className="bg-white w-full max-w-md rounded-t-[40px] sm:rounded-[40px] p-8 shadow-2xl"
            >
              <div className="flex items-center justify-between mb-8">
                <h2 className="text-2xl font-black text-slate-900">Profile Settings</h2>
                <button onClick={() => setShowProfile(false)} className="p-2 hover:bg-slate-100 rounded-full">
                  <X className="w-6 h-6 text-slate-400" />
                </button>
              </div>
              
              <div className="space-y-6">
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2 ml-1">
                    Mobile Number
                  </label>
                  <div className="relative">
                    <Phone className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                    <input 
                      type="tel"
                      placeholder="+1 234 567 8900"
                      value={newPhone}
                      onChange={(e) => setNewPhone(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-100 rounded-2xl py-4 pl-12 pr-4 font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                    />
                  </div>
                  <p className="mt-2 text-[10px] text-slate-400 font-medium ml-1">
                    Used for SMS alerts and guardian notifications.
                  </p>
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2 ml-1">
                    Shake Sensitivity
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    {(['low', 'medium', 'high'] as const).map((level) => (
                      <button
                        key={level}
                        onClick={() => setShakeSensitivity(level)}
                        className={`py-3 rounded-xl font-bold text-xs capitalize transition-all ${
                          shakeSensitivity === level
                            ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-200'
                            : 'bg-slate-50 text-slate-400 border border-slate-100 hover:bg-slate-100'
                        }`}
                      >
                        {level}
                      </button>
                    ))}
                  </div>
                  <p className="mt-2 text-[10px] text-slate-400 font-medium ml-1">
                    Adjust how hard you need to shake to trigger an alert.
                  </p>
                </div>

                <button 
                  onClick={handleUpdateProfile}
                  disabled={isSavingProfile || !newPhone}
                  className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-black py-5 rounded-3xl shadow-xl shadow-indigo-200 transition-all flex items-center justify-center gap-2"
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
    className={`${color} p-6 rounded-[32px] flex flex-col items-center justify-center gap-3 text-white shadow-lg shadow-slate-200 transition-all ${active ? 'ring-4 ring-white ring-inset' : ''}`}
  >
    {icon}
    <span className="font-bold text-sm tracking-tight">{label}</span>
  </motion.button>
);

const StatusItem: React.FC<{ label: string; value: string; active: boolean }> = ({ label, value, active }) => (
  <div className="flex items-center justify-between text-sm">
    <span className="text-slate-500 font-medium">{label}</span>
    <span className={`font-bold ${active ? 'text-slate-900' : 'text-slate-300'}`}>{value}</span>
  </div>
);

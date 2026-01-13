import React, { useState, useEffect, useRef } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, onAuthStateChanged, signInWithCustomToken } from 'firebase/auth'; 
import { 
  getFirestore, 
  collection, 
  addDoc, 
  deleteDoc, 
  onSnapshot, 
  query, 
  doc,
  orderBy,
  limit
} from 'firebase/firestore';
import { 
  Clock, 
  Calendar, 
  Users, 
  User, 
  ChevronLeft, 
  Plus, 
  CheckCircle, 
  XCircle, 
  ArrowRight,
  Edit2,
  Trash2,
  Zap,
  LayoutGrid,
  MapPin,
  Unlock,
  Loader2,
  AlignLeft,
  ChevronUp,
  ChevronDown,
  AlertCircle,
  FileText,
  History,
  Timer,
  Menu,
  Lock,
  AlertTriangle 
} from 'lucide-react';

// --- Firebase Setup ---
const manualConfig = {
  apiKey: "AIzaSyCLigkEyqGD0PWMTL2-K0xa5tPqyMTT8qk",
  authDomain: "lab-d-booking.firebaseapp.com",
  projectId: "lab-d-booking",
  storageBucket: "lab-d-booking.firebasestorage.app",
  messagingSenderId: "176522364289",
  appId: "1:176522364289:web:9d7a28818f529d48839480",
  measurementId: "G-JMF3CFS1DY"
};

const isManualConfigValid = manualConfig.apiKey.startsWith("AIza");
const firebaseConfig = isManualConfigValid 
  ? manualConfig 
  : (typeof __firebase_config !== 'undefined' ? JSON.parse(__firebase_config) : manualConfig);

const rawAppId = typeof __app_id !== 'undefined' ? __app_id : 'lab-d-meeting-app';
const appId = isManualConfigValid 
  ? 'lab-d-meeting-app' 
  : rawAppId.replace(/\//g, '_').replace(/\./g, '-');

let auth, db;
try {
  const app = initializeApp(firebaseConfig);
  auth = getAuth(app);
  db = getFirestore(app);
} catch (e) {
  console.error("Firebase init error:", e);
}

// --- Config Data ---
const ROOMS = [
  { 
    id: 'big', 
    name: 'Grand War Room', 
    thName: 'ห้องประชุมใหญ่',
    capacity: '25', 
    image: 'https://i.postimg.cc/Vs9gWN1Q/IMG-7122.jpg', 
    color: 'bg-emerald-600', 
    icon: '🏢' 
  },
  { 
    id: 'small', 
    name: 'Focus Room', 
    thName: 'ห้องประชุมเล็ก',
    capacity: '10', 
    image: 'https://i.postimg.cc/c18yxwQ6/IMG-7150.jpg', 
    color: 'bg-teal-500', 
    icon: '💡' 
  }
];

// --- Utility Functions ---
const formatTime = (timestamp) => {
  if (!timestamp) return '--:--';
  return new Date(timestamp).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });
};

const formatDateShort = (timestamp) => {
  if (!timestamp) return '-';
  const date = new Date(timestamp);
  const today = new Date();
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  if (date.getDate() === today.getDate() && date.getMonth() === today.getMonth()) {
    return 'Today';
  } else if (date.getDate() === tomorrow.getDate() && date.getMonth() === tomorrow.getMonth()) {
    return 'Tomorrow';
  } else {
    return date.toLocaleDateString('en-US', { day: 'numeric', month: 'short' });
  }
};

const getLocalDateStr = (date = new Date()) => {
  const offset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 10);
};

const getStatus = (roomId, bookings) => {
  const now = new Date().getTime();
  const safeBookings = Array.isArray(bookings) ? bookings : [];
  
  const currentBooking = safeBookings.find(b => 
    b.roomId === roomId && 
    b.start <= now && 
    b.end > now
  );
  
  if (currentBooking) {
      return { 
          status: 'busy', 
          text: 'BUSY', 
          detail: `Occupied until ${formatTime(currentBooking.end)}` 
      };
  }
  
  const nextBooking = safeBookings
    .filter(b => b.roomId === roomId && b.start > now)
    .sort((a, b) => a.start - b.start)[0];

  if (nextBooking) {
      const diffMins = (nextBooking.start - now) / (1000 * 60);
      
      if (diffMins <= 10) {
          return {
              status: 'soon',
              text: 'SOON',
              detail: `Starts in ${Math.ceil(diffMins)} min`
          };
      }

      const isToday = new Date(nextBooking.start).getDate() === new Date().getDate();
      const timeStr = formatTime(nextBooking.start);
      return { 
          status: 'free', 
          text: 'AVAILABLE', 
          detail: `Free until ${isToday ? timeStr : formatDateShort(nextBooking.start)}` 
      };
  }
  
  return { status: 'free', text: 'AVAILABLE', detail: 'Available' };
};

const isTimeBlocked = (timeStr, dateStr, roomId, bookings, currentBookingId, isStarted) => {
    const checkDate = new Date(`${dateStr}T${timeStr}`);
    const checkTime = checkDate.getTime();
    const now = new Date().getTime();
    const safeBookings = Array.isArray(bookings) ? bookings : [];

    // 1. Check Past Time (If not editing an active/started booking)
    // Buffer 1 min to allow immediate selection
    if (!isStarted && checkTime < now - 60000) return true; 

    // 2. Check Overlap with Existing Bookings
    return safeBookings.some(b => {
        if (b.id === currentBookingId) return false; // Ignore self when editing
        if (b.roomId !== roomId) return false;
        // Check intersection
        return checkTime >= b.start && checkTime < b.end;
    });
};

const getDisplayName = (name) => {
    if (!name) return '';
    return name.toLowerCase() === 'godmode' ? 'Admin' : name;
};

// --- Custom Components ---

const GlassTimePicker = ({ value, onChange, onClose, title, blockedCheck, minTime }) => {
  const safeValue = value || '09:00';
  const [hour, setHour] = useState(safeValue.split(':')[0].padStart(2, '0'));
  const [minute, setMinute] = useState(safeValue.split(':')[1].padStart(2, '0'));
  
  const hourRef = useRef(null);
  const minuteRef = useRef(null);

  const hours = Array.from({ length: 24 }, (_, i) => i.toString().padStart(2, '0'));
  const minutes = Array.from({ length: 12 }, (_, i) => (i * 5).toString().padStart(2, '0'));

  useEffect(() => {
    const timer = setTimeout(() => {
        if (hourRef.current) {
            const hIndex = parseInt(hour, 10);
            hourRef.current.scrollTop = hIndex * 48;
        }
        if (minuteRef.current) {
            const mVal = parseInt(minute, 10);
            const mIndex = Math.round(mVal / 5);
            minuteRef.current.scrollTop = mIndex * 48;
        }
    }, 100);
    return () => clearTimeout(timer);
  }, []);

  const handleSave = () => {
    if (blockedCheck && blockedCheck(`${hour}:${minute}`)) {
        return; 
    }
    onChange(`${hour}:${minute}`);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="absolute inset-0" onClick={onClose} />
      <div className="relative z-10 w-full max-w-md bg-gray-900/80 backdrop-blur-2xl border-t border-white/10 rounded-t-[2.5rem] p-6 shadow-2xl animate-in slide-in-from-bottom-10 duration-300">
        <div className="flex justify-between items-center mb-6">
          <button onClick={onClose} className="text-white/50 hover:text-white transition-colors">Cancel</button>
          <h3 className="text-white font-bold text-lg">{title}</h3>
          <button onClick={handleSave} className="text-emerald-400 font-bold hover:text-emerald-300 transition-colors">Done</button>
        </div>
        <div className="flex justify-center gap-4 h-48 relative">
          <div className="absolute top-1/2 -translate-y-1/2 w-full h-12 bg-white/10 rounded-xl pointer-events-none border border-white/10" />
          
          <div ref={hourRef} className="w-20 overflow-y-scroll no-scrollbar py-[calc(6rem-1.5rem)] snap-y snap-mandatory text-center">
            {hours.map(h => {
                let isBlocked = false;
                if (minTime) {
                    if (parseInt(h) < parseInt(minTime.split(':')[0])) isBlocked = true;
                }
                if (blockedCheck && !isBlocked) {
                   isBlocked = blockedCheck(`${h}:00`) && blockedCheck(`${h}:30`);
                }
                
                return (
                  <div key={h} onClick={() => !isBlocked && setHour(h)} className={`h-12 flex items-center justify-center snap-center cursor-pointer transition-all duration-200 ${hour === h ? 'text-white text-2xl font-bold' : isBlocked ? 'text-white/10 decoration-slice line-through' : 'text-white/30 text-lg'}`}>{h}</div>
                );
            })}
          </div>
          <div className="flex items-center text-white pb-1 font-bold text-xl">:</div>
          <div ref={minuteRef} className="w-20 overflow-y-scroll no-scrollbar py-[calc(6rem-1.5rem)] snap-y snap-mandatory text-center">
            {minutes.map(m => {
                 let isBlocked = false;
                 if (minTime) {
                     if (parseInt(hour) < parseInt(minTime.split(':')[0])) isBlocked = true;
                     else if (parseInt(hour) === parseInt(minTime.split(':')[0]) && parseInt(m) <= parseInt(minTime.split(':')[1])) isBlocked = true;
                 }
                 if (!isBlocked && blockedCheck) {
                     isBlocked = blockedCheck(`${hour}:${m}`);
                 }

                 return (
                  <div key={m} onClick={() => !isBlocked && setMinute(m)} className={`h-12 flex items-center justify-center snap-center cursor-pointer transition-all duration-200 ${minute === m ? 'text-white text-2xl font-bold' : isBlocked ? 'text-red-500/50 cursor-not-allowed decoration-slice line-through' : 'text-white/30 text-lg'}`}>{m}</div>
                 );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};

// Glass Duration Picker Component
const GlassDurationPicker = ({ value, onChange, onClose }) => {
  const initH = Math.floor(parseInt(value) / 60);
  const initM = parseInt(value) % 60;
  
  const [hour, setHour] = useState(initH);
  const [minute, setMinute] = useState(initM);
  
  const hourRef = useRef(null);
  const minuteRef = useRef(null);

  const hours = Array.from({ length: 9 }, (_, i) => i);
  const minutes = Array.from({ length: 60 }, (_, i) => i);

  useEffect(() => {
    const timer = setTimeout(() => {
        if (hourRef.current) {
            hourRef.current.scrollTop = hour * 48;
        }
        if (minuteRef.current) {
            minuteRef.current.scrollTop = minute * 48;
        }
    }, 100);
    return () => clearTimeout(timer);
  }, []);

  const handleSave = () => {
    const totalMinutes = (hour * 60) + minute;
    const finalMinutes = totalMinutes === 0 ? 5 : totalMinutes; 
    onChange(finalMinutes.toString());
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="absolute inset-0" onClick={onClose} />
      <div className="relative z-10 w-full max-w-md bg-gray-900/60 backdrop-blur-3xl border-t border-white/20 rounded-t-[2.5rem] p-6 pb-10 shadow-[0_-10px_40px_rgba(0,0,0,0.5)] animate-in slide-in-from-bottom-10 duration-300 ring-1 ring-white/10">
        
        <div className="flex justify-between items-center mb-8">
          <button onClick={onClose} className="text-white/50 hover:text-white transition-colors text-base font-medium">Cancel</button>
          <h3 className="text-white font-semibold text-lg tracking-wide">Select Duration</h3>
          <button onClick={handleSave} className="text-emerald-400 font-bold hover:text-emerald-300 transition-colors text-base shadow-emerald-500/20 drop-shadow-sm">Done</button>
        </div>

        <div className="flex justify-center gap-4 h-56 relative perspective-1000">
          <div className="absolute top-1/2 -translate-y-1/2 w-full h-12 bg-white/10 rounded-xl pointer-events-none border-y border-white/20 shadow-[inset_0_0_20px_rgba(255,255,255,0.05)] backdrop-blur-[1px]" />

          <div ref={hourRef} className="w-24 overflow-y-scroll no-scrollbar py-[calc(7rem-1.5rem)] snap-y snap-mandatory text-center mask-gradient-y">
            {hours.map(h => (
              <div 
                key={h} 
                onClick={() => setHour(h)}
                className={`h-12 flex items-center justify-center snap-center cursor-pointer transition-all duration-300 ${hour === h ? 'text-white text-3xl font-semibold scale-110' : 'text-white/30 text-xl font-medium'}`}
              >
                {h} <span className="text-sm ml-1.5 font-normal opacity-50 tracking-wider">Hr</span>
              </div>
            ))}
          </div>

          <div className="flex items-center text-white/50 pb-1 font-thin text-xl z-10">:</div>

          <div ref={minuteRef} className="w-24 overflow-y-scroll no-scrollbar py-[calc(7rem-1.5rem)] snap-y snap-mandatory text-center mask-gradient-y">
            {minutes.map(m => (
              <div 
                key={m} 
                onClick={() => setMinute(m)}
                className={`h-12 flex items-center justify-center snap-center cursor-pointer transition-all duration-300 ${minute === m ? 'text-white text-3xl font-semibold scale-110' : 'text-white/30 text-xl font-medium'}`}
              >
                {m} <span className="text-sm ml-1.5 font-normal opacity-50 tracking-wider">Min</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

const Header = ({ title, onBack, onMenuClick }) => (
  <div className="flex items-center justify-between px-6 pt-12 pb-4 z-20">
    <div className="flex items-center gap-3">
      {onBack ? (
        <button onClick={onBack} className="p-2.5 rounded-full bg-white/10 backdrop-blur-xl border border-white/20 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.2)] text-white hover:bg-white/20 hover:border-white/30 transition-all active:scale-95 active:bg-white/5">
          <ChevronLeft size={22} />
        </button>
      ) : (
        <button onClick={onMenuClick} className="p-2.5 rounded-full bg-white/10 backdrop-blur-xl border border-white/20 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.2)] text-white hover:bg-white/20 hover:border-white/30 transition-all active:scale-95 active:bg-white/5">
           <Menu size={22} />
        </button>
      )}
      <span className="text-xl font-bold tracking-tight drop-shadow-md text-white/90">{title}</span>
    </div>
    <div className="w-10 h-10 rounded-full bg-white/10 border-2 border-white/20 shadow-lg overflow-hidden backdrop-blur-md">
      <img src={`https://api.dicebear.com/7.x/notionists/svg?seed=Admin`} alt="User" className="w-full h-full object-cover opacity-90" />
    </div>
  </div>
);

const RoomCardBento = ({ room, bookings, onSelect }) => {
  const { status, text, detail } = getStatus(room.id, bookings);
  
  let statusColor = 'bg-emerald-400';
  let badgeStyle = 'bg-white/10 border-white/20 text-white shadow-[inset_0_1px_0_0_rgba(255,255,255,0.1)]';
  let badgeLayout = 'px-4 py-2 rounded-full w-auto backdrop-blur-md border';
  let cardOverlay = 'bg-emerald-950/80 mix-blend-multiply'; 

  if (status === 'busy') {
      statusColor = 'bg-rose-500';
      badgeStyle = 'bg-rose-500/20 border-rose-500/40 text-white shadow-[inset_0_1px_0_0_rgba(255,100,100,0.2)]';
      badgeLayout = 'px-6 py-3 rounded-2xl w-full justify-center backdrop-blur-xl border'; 
      cardOverlay = 'bg-rose-900/40 mix-blend-multiply'; 
  } else if (status === 'soon') {
      statusColor = 'bg-amber-400';
      badgeStyle = 'bg-amber-500/20 border-amber-400/40 text-white shadow-[inset_0_1px_0_0_rgba(255,200,100,0.2)]';
      badgeLayout = 'px-6 py-3 rounded-2xl w-full justify-center backdrop-blur-xl border'; 
      cardOverlay = 'bg-amber-900/40 mix-blend-multiply'; 
  }

  const upcomingBookings = bookings
    .filter(b => b.roomId === room.id && b.end > new Date().getTime())
    .sort((a, b) => a.start - b.start)
    .slice(0, 10); 

  return (
    <div onClick={() => onSelect(room)} className="relative group flex-1 min-h-[300px] sm:min-h-0 shrink-0 rounded-[2.5rem] overflow-hidden cursor-pointer active:scale-[0.98] transition-all duration-500 shadow-2xl ring-1 ring-emerald-900/20 hover:ring-emerald-400/30">
      <div className="absolute inset-0">
          <img src={room.image} alt={room.name} className="w-full h-full object-cover transition-transform duration-1000 group-hover:scale-110" />
          <div className={`absolute inset-0 ${cardOverlay} transition-colors duration-500`} /> 
          <div className="absolute inset-0 bg-black/10" /> 
      </div>
      <div className="relative h-full flex flex-col justify-between p-5">
          <div className="flex justify-between items-start">
              <div className={`${badgeLayout} ${badgeStyle} flex items-center gap-3 transition-all duration-500`}>
                  <div className={`relative flex h-3 w-3`}>
                    <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${statusColor}`}></span>
                    <span className={`relative inline-flex rounded-full h-3 w-3 ${statusColor}`}></span>
                  </div>
                  <span className="text-xs font-bold tracking-widest uppercase drop-shadow-sm flex items-center gap-2">
                      {text}
                      {status === 'soon' && <AlertTriangle size={14} className="animate-pulse" />}
                  </span>
              </div>
          </div>
          <div className="space-y-4">
              <div className="px-2">
                  <h2 className="text-3xl font-bold text-white tracking-tight drop-shadow-lg leading-tight">{room.name}</h2>
                  <div className="flex items-center gap-3 text-white/80 text-sm font-medium mt-2">
                      <span>{room.thName}</span>
                      <span className="w-1 h-1 bg-white/40 rounded-full"></span>
                      <span className="flex items-center gap-1"><Users size={14} className="text-white/60"/> {room.capacity}</span>
                  </div>
              </div>
              <div className={`backdrop-blur-xl border border-white/10 rounded-[1.8rem] p-4 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.05)] ring-1 ring-white/5 transition-colors ${status === 'busy' ? 'bg-rose-950/40' : status === 'soon' ? 'bg-amber-950/40' : 'bg-white/5'}`}>
                  <div className="flex items-center justify-between mb-3 px-1">
                       <span className="text-[10px] text-white/60 uppercase tracking-wider font-bold">Queue</span>
                       <span className="text-[10px] font-medium text-white/80 bg-white/5 px-2.5 py-1 rounded-full backdrop-blur-md border border-white/10 shadow-sm">
                          {upcomingBookings.length} Active
                       </span>
                  </div>
                  <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar snap-x">
                      {upcomingBookings.length === 0 ? (
                          <div className="w-full py-2 text-center text-xs text-white/40 italic font-medium">No upcoming bookings</div>
                      ) : (
                          upcomingBookings.map((b, i) => {
                              const isCurrent = new Date().getTime() >= b.start && new Date().getTime() <= b.end;
                              return (
                                  <div key={i} className={`snap-start flex-shrink-0 min-w-[110px] p-3 rounded-2xl border backdrop-blur-md flex flex-col justify-center transition-all ${isCurrent ? 'bg-gradient-to-br from-white/15 to-white/5 border-white/20 shadow-lg' : 'bg-black/20 border-white/5'}`}>
                                      <div className="flex items-center gap-1.5 mb-1.5">
                                          <div className={`w-1.5 h-1.5 rounded-full ${isCurrent ? 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]' : 'bg-white/40'}`} />
                                          <span className="text-[10px] font-bold text-white/90 tracking-tight">{formatTime(b.start)} - {formatTime(b.end)}</span>
                                      </div>
                                      <div className="text-[11px] text-white font-semibold truncate w-full mb-0.5">{getDisplayName(b.ownerId)}</div>
                                      <div className="text-[9px] text-white/50 truncate w-full">{String(b.owner || '')}</div>
                                  </div>
                              );
                          })
                      )}
                  </div>
              </div>
          </div>
      </div>
    </div>
  );
};

// --- Main App Component ---
export default function App() {
  const [view, setView] = useState('dashboard'); 
  const [selectedRoom, setSelectedRoom] = useState(null);
  const [bookings, setBookings] = useState([]);
  const [logs, setLogs] = useState([]); 
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showMainMenu, setShowMainMenu] = useState(false); 
  
  // Form States
  const [editingBookingId, setEditingBookingId] = useState(null);
  const [bookingDate, setBookingDate] = useState(new Date().toISOString().slice(0, 10));
  const [startTime, setStartTime] = useState('09:00');
  const [endTime, setEndTime] = useState('10:00');
  const [bookingTitle, setBookingTitle] = useState('');
  const [department, setDepartment] = useState(''); 
  const [bookerName, setBookerName] = useState('');
  const [description, setDescription] = useState(''); 
  const [pickerMode, setPickerMode] = useState(null); 
  const [endTimeMode, setEndTimeMode] = useState('specific'); 
  const [duration, setDuration] = useState('60'); 
  const [isBookingStarted, setIsBookingStarted] = useState(false); 
  
  // UI States
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [authAction, setAuthAction] = useState('create');
  const [pendingBookingData, setPendingBookingData] = useState(null);
  const [notification, setNotification] = useState(null);

  // --- Initialize ---
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const roomParam = params.get('room');
    if (roomParam) {
      const targetRoom = ROOMS.find(r => r.id === roomParam);
      if (targetRoom) {
        setSelectedRoom(targetRoom);
        setView('menu');
        window.history.replaceState({}, '', window.location.pathname);
      }
    }
  }, []);

  // --- Firebase Logic ---
  useEffect(() => {
    const initAuth = async () => {
      try {
        if (!isManualConfigValid && typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
           await signInWithCustomToken(auth, __initial_auth_token);
        } else {
           await signInAnonymously(auth);
        }
      } catch (err) {
        console.error("Auth error:", err);
      }
    };
    initAuth();

    const unsubscribeAuth = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
    });

    return () => unsubscribeAuth();
  }, []);

  useEffect(() => {
    if (!user) return;

    // Fetch Bookings
    const q = query(
      collection(db, 'artifacts', appId, 'public', 'data', 'bookings')
    );
    const unsubscribeData = onSnapshot(q, (snapshot) => {
      const loadedBookings = snapshot.docs.map(doc => {
        const data = doc.data();
        return {
          id: doc.id,
          ...data,
          start: data.start?.toMillis ? data.start.toMillis() : Number(data.start),
          end: data.end?.toMillis ? data.end.toMillis() : Number(data.end),
          owner: String(data.owner || ''),
          ownerId: String(data.ownerId || ''),
          title: String(data.title || ''),
          description: String(data.description || '')
        };
      });
      setBookings(loadedBookings);
      setLoading(false);
    }, (error) => {
      console.error("Data fetch error:", error);
      setLoading(false);
    });

    const logQ = query(
        collection(db, 'artifacts', appId, 'public', 'data', 'audit_logs'),
        orderBy('timestamp', 'desc'),
        limit(50)
    );
    const unsubscribeLogs = onSnapshot(logQ, (snapshot) => {
        const loadedLogs = snapshot.docs.map(doc => {
            const data = doc.data();
            return { 
                id: doc.id, 
                ...data,
                timestamp: data.timestamp?.toMillis ? data.timestamp.toMillis() : Number(data.timestamp),
                action: String(data.action || ''),
                details: String(data.details || ''),
                user: String(data.user || '')
            };
        });
        setLogs(loadedLogs);
    });

    return () => {
        unsubscribeData();
        unsubscribeLogs();
    };
  }, [user]);

  const logAction = async (action, details, userName) => {
      try {
          await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'audit_logs'), {
              action,
              details,
              user: userName,
              timestamp: new Date().getTime()
          });
      } catch (e) {
          console.error("Log failed", e);
      }
  };

  // --- Handlers ---
  const handleRoomSelect = (room) => { setSelectedRoom(room); setView('menu'); };

  const initBookingForm = (isEdit = false, booking = null) => {
    const now = new Date();
    if (isEdit && booking) {
      setEditingBookingId(booking.id);
      const startObj = new Date(booking.start);
      const endObj = new Date(booking.end);
      
      const hasStarted = now.getTime() > startObj.getTime();
      setIsBookingStarted(hasStarted);

      setBookingDate(getLocalDateStr(startObj));
      setStartTime(startObj.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }));
      setEndTime(endObj.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }));
      
      setBookingTitle(booking.title);
      setDepartment(booking.owner || '');
      setBookerName(booking.ownerId || ''); 
      setDescription(booking.description || ''); 
      setEndTimeMode('specific');
      setAuthAction('edit');
    } else {
      setEditingBookingId(null);
      setIsBookingStarted(false);
      
      const startObj = new Date(now.getTime() + 30 * 60000); 
      const coeff = 1000 * 60 * 5;
      const roundedStart = new Date(Math.ceil(startObj.getTime() / coeff) * coeff);
      const endObj = new Date(roundedStart.getTime() + 60 * 60000);

      setBookingDate(getLocalDateStr(roundedStart));
      setStartTime(roundedStart.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }));
      setEndTime(endObj.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }));
      
      setBookingTitle('');
      setDepartment('');
      setBookerName('');
      setDescription(''); 
      setEndTimeMode('specific');
      setDuration('60');
      setAuthAction('create');
    }
    setView('booking');
  };

  const handleSaveBooking = async () => {
    if (!department) return showNotif('error', 'กรุณาระบุแผนก');
    if (!bookerName) return showNotif('error', 'กรุณาระบุชื่อผู้จอง');
    if (startTime >= endTime) return showNotif('error', 'เวลาสิ้นสุดต้องหลังเวลาเริ่ม');

    const startDateTime = new Date(`${bookingDate}T${startTime}`);
    const endDateTime = new Date(`${bookingDate}T${endTime}`);
    const startTs = startDateTime.getTime();
    const endTs = endDateTime.getTime();
    
    const now = new Date().getTime();

    if (!isBookingStarted && startTs < now) {
        return showNotif('error', 'ไม่สามารถจองเวลาย้อนหลังได้');
    }
    if (isBookingStarted && endTs < now) {
        return showNotif('error', 'เวลาสิ้นสุดต้องไม่เป็นอดีต');
    }
    
    if (checkOverlap(startTs, endTs)) return showNotif('error', 'ช่วงเวลานี้มีการจองแล้ว');

    const bookingData = {
      roomId: selectedRoom.id,
      title: bookingTitle || 'Meeting',
      start: startTs,
      end: endTs,
      owner: department,
      ownerId: bookerName,
      description: description
    };

    try {
      if (editingBookingId) {
        await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'bookings', editingBookingId));
        await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'bookings'), bookingData);
        logAction('update', `แก้ไข: ${bookingTitle}`, bookerName);
        showNotif('success', 'แก้ไขเรียบร้อย');
      } else {
        await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'bookings'), bookingData);
        logAction('create', `จอง: ${selectedRoom.name} - ${bookingTitle}`, bookerName);
        showNotif('success', 'จองสำเร็จ');
      }
      resetAndClose();
    } catch (e) {
      console.error(e);
      showNotif('error', 'บันทึกข้อมูลล้มเหลว: ' + e.message);
    }
  };

  const handleDeleteBooking = async (id) => {
    try {
      const target = bookings.find(b => b.id === id);
      const detailStr = target ? `${target.title} (${formatDateShort(target.start)})` : id;
      await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'bookings', id));
      logAction('delete', `ลบ: ${detailStr}`, bookerName);
      showNotif('success', 'ยกเลิกการจองแล้ว');
      resetAndClose();
    } catch (e) {
      showNotif('error', 'ลบข้อมูลล้มเหลว');
    }
  };

  const handleAuthSubmit = () => {
    const name = bookerName.trim().toLowerCase();
    
    if (authAction === 'viewLogs') {
         if (name === 'godmode') {
            setView('logs');
            setShowMainMenu(false);
            setShowAuthModal(false);
            setBookerName(''); // Clear security
        } else {
            showNotif('error', 'Access Denied: Incorrect Code');
        }
        return;
    }

    if (!name) return showNotif('error', 'กรุณาระบุชื่อผู้จอง');

    if (authAction === 'create') {
        handleSaveBooking();
    } else if (authAction === 'edit' || authAction === 'delete') {
        if (name === 'godmode' || pendingBookingData.ownerId === bookerName) {
            if (name === 'godmode') showNotif('success', 'God Mode Activated');
            
            if (authAction === 'edit') {
                setShowAuthModal(false);
                initBookingForm(true, pendingBookingData);
            } else {
                handleDeleteBooking(pendingBookingData.id);
            }
        } else {
            showNotif('error', 'คุณไม่ใช่เจ้าของการจองนี้');
        }
    }
  };

  const resetAndClose = () => {
    setShowAuthModal(false);
    setBookerName('');
    setBookingTitle('');
    setDepartment('');
    setDescription('');
    setEditingBookingId(null);
    setPendingBookingData(null);
    setIsBookingStarted(false);
    setView('dashboard');
  };

  const showNotif = (type, message) => {
    setNotification({ type, message });
    setTimeout(() => setNotification(null), 3000);
  };

  const handleTimeChange = (newTime) => {
    if (pickerMode === 'start') {
        // Prevent selecting overlapping time for start
        const sTs = new Date(`${bookingDate}T${newTime}`).getTime();
        
        if (isTimeBlocked(newTime, bookingDate, selectedRoom.id, bookings, editingBookingId, isBookingStarted)) {
             showNotif('error', 'เวลานี้มีการจองแล้ว');
             return;
        }

        setStartTime(newTime);
        if (endTimeMode === 'duration') {
            const [h, m] = newTime.split(':').map(Number);
            const startMins = h * 60 + m;
            const endMins = startMins + parseInt(duration);
            const endH = Math.floor(endMins / 60) % 24;
            const endM = endMins % 60;
            const newEndTime = `${endH.toString().padStart(2,'0')}:${endM.toString().padStart(2,'0')}`;
            
             const eTs = new Date(`${bookingDate}T${newEndTime}`).getTime();
             if (checkOverlap(sTs, eTs)) {
                  showNotif('error', 'ช่วงเวลาใหม่ชนกับคิวอื่น');
             }
            setEndTime(newEndTime);
        } else if (newTime >= endTime) {
             const [h, m] = newTime.split(':').map(Number);
             const nextH = (h + 1).toString().padStart(2, '0');
             setEndTime(`${nextH}:${m.toString().padStart(2, '0')}`);
        }
    } else if (pickerMode === 'end') {
        const sTs = new Date(`${bookingDate}T${startTime}`).getTime();
        const eTs = new Date(`${bookingDate}T${newTime}`).getTime();
        
        // Prevent selecting end time before start time
        if (eTs <= sTs) {
             showNotif('error', 'เวลาสิ้นสุดต้องหลังเวลาเริ่ม');
             return;
        }

        if (checkOverlap(sTs, eTs)) {
            showNotif('error', 'ช่วงเวลานี้ชนกับคิวอื่น');
            return;
        }
        
        if (isBookingStarted) {
             const now = new Date().getTime();
             if (eTs < now) {
                 showNotif('error', 'เวลาสิ้นสุดต้องไม่เป็นอดีต');
                 return;
             }
        }
        
        setEndTime(newTime);
    }
  };
  
  const handleDurationPickerChange = (totalMinsStr) => {
      const newDur = totalMinsStr;
      const [h, m] = startTime.split(':').map(Number);
      const startMins = h * 60 + m;
      const endMins = startMins + parseInt(newDur);
      const endH = Math.floor(endMins / 60) % 24;
      const endM = endMins % 60;
      const newEndTime = `${endH.toString().padStart(2,'0')}:${endM.toString().padStart(2,'0')}`;

      const sTs = new Date(`${bookingDate}T${startTime}`).getTime();
      const eTs = new Date(`${bookingDate}T${newEndTime}`).getTime();

      if (checkOverlap(sTs, eTs)) {
          showNotif('error', 'ระยะเวลาที่เลือกชนกับคิวอื่น');
          return;
      }
      
      if (isBookingStarted) {
          const now = new Date().getTime();
          if (eTs < now) {
              showNotif('error', 'เวลาสิ้นสุดต้องไม่เป็นอดีต');
              return;
          }
      }

      setDuration(newDur);
      setEndTime(newEndTime);
  };

  const handleEndTimeModeToggle = (mode) => {
      setEndTimeMode(mode);
      if (mode === 'duration') {
          handleDurationPickerChange(duration); // Recalc immediately
      }
  };

  // --- Sub-View Render Helpers ---
  const ChevronRight = ({className}) => <svg className={className} width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>;

  const renderMainMenuOverlay = () => (
      <div className="fixed inset-0 z-[60] bg-black/60 backdrop-blur-sm flex flex-col animate-in fade-in duration-200" style={{fontFamily: "-apple-system, BlinkMacSystemFont, 'Sukhumvit Set', sans-serif"}}>
          <div className="flex-1" onClick={() => setShowMainMenu(false)} />
          <div className="bg-gray-900/80 backdrop-blur-3xl border-t border-white/20 rounded-t-[2.5rem] p-6 pb-12 shadow-[0_-20px_60px_rgba(0,0,0,0.7)] animate-in slide-in-from-bottom-10 duration-300 ring-1 ring-white/10">
              <div className="flex justify-center mb-8">
                  <div className="w-12 h-1.5 bg-white/20 rounded-full" />
              </div>
              <div className="space-y-4">
                  <button onClick={() => { setAuthAction('viewLogs'); setShowAuthModal(true); }} className="w-full p-5 bg-gradient-to-br from-white/10 to-white/5 hover:from-blue-600/30 hover:to-blue-900/10 rounded-3xl flex items-center gap-5 border border-white/10 shadow-lg active:scale-[0.98] transition-all duration-300 group relative overflow-hidden">
                      <div className="absolute inset-0 bg-blue-500/0 group-hover:bg-blue-500/5 transition-colors duration-500" />
                      <div className="p-4 bg-blue-500/20 text-blue-400 rounded-2xl group-hover:bg-blue-500 group-hover:text-white transition-all shadow-[inset_0_1px_0_0_rgba(255,255,255,0.2)] relative z-10">
                          <FileText size={26} />
                      </div>
                      <div className="text-left relative z-10">
                          <span className="block text-white font-bold text-xl tracking-tight group-hover:text-blue-100 transition-colors mb-0.5">Activity Log</span>
                          <span className="text-white/40 text-sm font-medium group-hover:text-blue-200/60 transition-colors">ประวัติการแก้ไขระบบ</span>
                      </div>
                      <div className="ml-auto p-2 rounded-full bg-white/5 group-hover:bg-blue-500/20 text-white/20 group-hover:text-blue-300 transition-all relative z-10">
                          <ChevronRight size={20} className="w-5 h-5" />
                      </div>
                  </button>
                  <button onClick={() => { setView('history'); setShowMainMenu(false); }} className="w-full p-5 bg-gradient-to-br from-white/10 to-white/5 hover:from-purple-600/30 hover:to-purple-900/10 rounded-3xl flex items-center gap-5 border border-white/10 shadow-lg active:scale-[0.98] transition-all duration-300 group relative overflow-hidden">
                      <div className="absolute inset-0 bg-purple-500/0 group-hover:bg-purple-500/5 transition-colors duration-500" />
                      <div className="p-4 bg-purple-500/20 text-purple-400 rounded-2xl group-hover:bg-purple-500 group-hover:text-white transition-all shadow-[inset_0_1px_0_0_rgba(255,255,255,0.2)] relative z-10">
                          <History size={26} />
                      </div>
                      <div className="text-left relative z-10">
                          <span className="block text-white font-bold text-xl tracking-tight group-hover:text-purple-100 transition-colors mb-0.5">Booking History</span>
                          <span className="text-white/40 text-sm font-medium group-hover:text-purple-200/60 transition-colors">ประวัติการจองย้อนหลัง</span>
                      </div>
                      <div className="ml-auto p-2 rounded-full bg-white/5 group-hover:bg-purple-500/20 text-white/20 group-hover:text-purple-300 transition-all relative z-10">
                          <ChevronRight size={20} className="w-5 h-5" />
                      </div>
                  </button>
              </div>
              <button onClick={() => setShowMainMenu(false)} className="w-full mt-8 py-4 text-white/40 font-bold hover:text-white transition-colors text-base tracking-wide">Close Menu</button>
          </div>
      </div>
  );

  const renderLogsView = () => (
      <div className="h-full flex flex-col bg-gray-950 text-white" style={{fontFamily: "-apple-system, BlinkMacSystemFont, 'Sukhumvit Set', sans-serif"}}>
          <Header title="Activity Log" onBack={() => setView('dashboard')} />
          <div className="flex-1 overflow-y-auto px-6 pb-6 space-y-4">
              {logs.length === 0 ? (
                  <div className="text-center text-white/30 py-10 font-medium">ยังไม่มีประวัติการใช้งาน</div>
              ) : (
                  logs.map((log) => (
                      <div key={log.id} className="bg-white/5 border border-white/10 p-5 rounded-[1.5rem] shadow-sm backdrop-blur-md">
                          <div className="flex justify-between items-start mb-3">
                              <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full uppercase tracking-wider shadow-sm border border-white/5 ${
                                  log.action === 'create' ? 'bg-emerald-500/20 text-emerald-300' : 
                                  log.action === 'delete' ? 'bg-red-500/20 text-red-300' : 
                                  'bg-blue-500/20 text-blue-300'
                              }`}>
                                  {log.action}
                              </span>
                              <span className="text-[10px] text-white/40 font-medium">{new Date(log.timestamp).toLocaleString('en-GB')}</span>
                          </div>
                          <p className="text-sm text-white/90 mb-3 font-medium leading-relaxed">{log.details}</p>
                          <div className="flex items-center gap-2 text-xs text-white/40 font-medium pt-3 border-t border-white/5">
                              <User size={12} /> by {getDisplayName(log.user)}
                          </div>
                      </div>
                  ))
              )}
          </div>
      </div>
  );

  const renderHistoryView = () => {
      const pastBookings = bookings.filter(b => b.end < new Date().getTime()).sort((a,b) => b.start - a.start);
      return (
        <div className="h-full flex flex-col bg-gray-950 text-white" style={{fontFamily: "-apple-system, BlinkMacSystemFont, 'Sukhumvit Set', sans-serif"}}>
            <Header title="Booking History" onBack={() => setView('dashboard')} />
            <div className="flex-1 overflow-y-auto px-6 pb-6 space-y-4">
                <div className="flex items-center gap-2 mb-4 px-1">
                    <History size={16} className="text-purple-400" />
                    <span className="text-xs font-bold text-purple-200 uppercase tracking-widest">Past Bookings ({pastBookings.length})</span>
                </div>
                {pastBookings.length === 0 ? (
                    <div className="text-center text-white/30 py-10 font-medium">ยังไม่มีประวัติการจองที่ผ่านมา</div>
                ) : (
                    pastBookings.map((b) => (
                        <div key={b.id} className="bg-gradient-to-br from-white/10 to-white/5 border border-white/10 p-5 rounded-[1.5rem] flex flex-col gap-3 opacity-90 hover:opacity-100 transition-opacity shadow-lg backdrop-blur-md">
                            <div className="flex justify-between items-center border-b border-white/10 pb-2 mb-1">
                                <div className="text-emerald-400 font-bold text-sm tracking-tight">
                                    {new Date(b.start).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                                </div>
                                <span className="text-[10px] text-white/50 bg-white/10 px-2 py-0.5 rounded-full border border-white/5">{b.roomId === 'big' ? 'Grand Room' : 'Focus Room'}</span>
                            </div>
                            
                            <div>
                                <div className="text-white font-bold text-lg leading-snug tracking-tight">{b.title}</div>
                                {b.description && <div className="text-xs text-white/60 mt-1.5 line-clamp-2 leading-relaxed font-light">"{b.description}"</div>}
                            </div>
                            
                            <div className="flex justify-between items-end mt-1 pt-3 border-t border-white/5">
                                <div className="text-xs text-emerald-100/70 flex items-center gap-1.5 font-medium bg-emerald-900/30 px-2 py-1 rounded-lg">
                                    <Clock size={12} /> {formatTime(b.start)} - {formatTime(b.end)}
                                </div>
                                <div className="text-right">
                                    <div className="text-xs font-bold text-white flex items-center justify-end gap-1 mb-0.5"><User size={10} className="text-white/60"/> {getDisplayName(b.ownerId)}</div>
                                    <div className="text-[10px] text-white/40">{b.owner}</div>
                                </div>
                            </div>
                        </div>
                    ))
                )}
            </div>
        </div>
      );
  };

  const renderDashboard = () => (
    <div className="h-full flex flex-col bg-gray-950 text-white" style={{fontFamily: "-apple-system, BlinkMacSystemFont, 'Sukhumvit Set', sans-serif"}}>
      <Header title="Lab-D Meeting Room" onMenuClick={() => setShowMainMenu(true)} />
      <div className="flex-1 px-5 pb-5 flex flex-col gap-4 overflow-y-auto no-scrollbar">
        <div className="flex items-center justify-between px-2 py-1">
             <div className="text-sm font-medium text-emerald-100/60">
                {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
             </div>
             <div className="flex items-center gap-1.5 text-[10px] font-bold text-emerald-400 uppercase tracking-widest bg-emerald-500/10 px-2 py-1 rounded-full border border-emerald-500/20 shadow-[0_0_10px_rgba(52,211,153,0.3)]">
                 <Zap size={12} fill="currentColor" /> {loading ? 'Connecting...' : 'Live Status'}
             </div>
        </div>
        {loading ? (
          <div className="flex-1 flex items-center justify-center text-emerald-500/50">
            <Loader2 className="animate-spin" size={40} />
          </div>
        ) : (
          ROOMS.map(room => (
              <RoomCardBento key={room.id} room={room} bookings={bookings} onSelect={handleRoomSelect} />
          ))
        )}
      </div>
    </div>
  );

  const renderRoomMenu = () => {
    const roomBookings = bookings.filter(b => 
        b.roomId === selectedRoom.id && 
        b.end > new Date().getTime() 
    ).sort((a,b) => a.start - b.start);
    let lastDate = '';

    return (
        <div className="fixed inset-0 z-50 flex items-end justify-center" style={{fontFamily: "-apple-system, BlinkMacSystemFont, 'Sukhumvit Set', sans-serif"}}>
            <div className="absolute inset-0 z-0">
                <img src={selectedRoom?.image} className="w-full h-full object-cover" alt="Room Background" />
                <div className="absolute inset-0 bg-emerald-950/60 backdrop-blur-md" />
            </div>
            
            <div className="absolute inset-0 z-10" onClick={() => setView('dashboard')} />
            
            <div className="relative z-20 w-full h-[90vh] p-4 sm:p-6 animate-in slide-in-from-bottom-20 duration-500 flex flex-col">
                <div className="bg-emerald-900/40 backdrop-blur-3xl rounded-[2.5rem] p-6 shadow-[0_0_80px_rgba(0,0,0,0.6)] border border-white/20 ring-1 ring-white/10 flex-1 flex flex-col overflow-hidden relative">
                    {/* Glossy Highlight Top */}
                    <div className="absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-white/40 to-transparent opacity-70"></div>
                    
                    <div className="flex justify-between items-center mb-8 shrink-0">
                        <div className="text-white">
                            <h2 className="text-3xl font-bold tracking-tight drop-shadow-xl">{selectedRoom.name}</h2>
                            <p className="text-emerald-100/70 font-medium flex items-center gap-1.5 text-sm mt-1">
                                <MapPin size={14}/> {selectedRoom.thName}
                            </p>
                        </div>
                        <button onClick={() => setView('dashboard')} className="p-2.5 bg-white/10 hover:bg-white/20 backdrop-blur-md rounded-full transition-all border border-white/10 active:scale-90 shadow-lg">
                            <XCircle size={26} className="text-white/90" />
                        </button>
                    </div>
                    
                    <button 
                        onClick={() => initBookingForm(false)} 
                        className="w-full p-5 mb-8 bg-gradient-to-b from-white to-gray-100 text-emerald-950 rounded-3xl flex items-center justify-between shadow-[0_10px_40px_-10px_rgba(255,255,255,0.4)] active:scale-[0.98] transition-all border border-white group hover:shadow-[0_0_50px_-10px_rgba(255,255,255,0.5)] shrink-0 relative overflow-hidden"
                    >
                        <div className="absolute inset-0 bg-white/50 opacity-0 group-active:opacity-100 transition-opacity" />
                        <div className="flex items-center gap-5 relative z-10">
                            <div className="p-3 bg-emerald-100 rounded-2xl shadow-inner"><Plus size={28} className="text-emerald-900"/></div>
                            <div className="text-left">
                                <span className="block font-bold text-xl tracking-tight">Book This Room</span>
                                <span className="text-sm text-emerald-800 font-medium opacity-80">Reserve a slot now</span>
                            </div>
                        </div>
                        <ArrowRight size={24} className="text-emerald-500 group-hover:text-emerald-900 transition-colors relative z-10"/>
                    </button>

                    <div className="flex items-center gap-2 mb-4 px-1 shrink-0">
                        <Calendar size={18} className="text-emerald-400" />
                        <span className="text-sm font-bold text-emerald-100 uppercase tracking-widest">Upcoming Queue ({roomBookings.length})</span>
                    </div>

                    <div className="flex-1 overflow-y-auto pr-1 space-y-3 pb-4">
                        {roomBookings.length === 0 ? (
                            <div className="h-40 flex flex-col items-center justify-center border border-dashed border-white/10 rounded-3xl bg-white/5 text-white/30 gap-2">
                                <Calendar size={32} className="opacity-50" />
                                <span className="text-sm font-medium">No bookings yet</span>
                                <span className="text-xs">Be the first to book!</span>
                            </div>
                        ) : (
                            roomBookings.map(b => {
                                const dateStr = new Date(b.start).toLocaleDateString('en-US', {weekday: 'short', day: 'numeric', month: 'short'});
                                const showHeader = dateStr !== lastDate;
                                if(showHeader) lastDate = dateStr;

                                const now = new Date().getTime();
                                const isCurrent = now >= b.start && now <= b.end;
                                const isSoon = !isCurrent && (b.start > now && b.start - now <= 10 * 60000);

                                let containerClass = "relative bg-white/5 hover:bg-white/10 backdrop-blur-md p-5 rounded-[1.5rem] shadow-sm border border-white/10 flex justify-between items-center transition-all group active:scale-[0.99] active:bg-white/15";
                                let dotClass = "bg-white/40";
                                let timeClass = "text-emerald-300 font-bold text-xl tracking-tight";
                                
                                if (isCurrent) {
                                    containerClass = "relative bg-rose-500/20 hover:bg-rose-500/30 backdrop-blur-md p-5 rounded-[1.5rem] shadow-lg border border-rose-500/40 flex justify-between items-center transition-all group active:scale-[0.99]";
                                    dotClass = "bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.8)]";
                                    timeClass = "text-rose-300 font-bold text-xl tracking-tight";
                                } else if (isSoon) {
                                    containerClass = "relative bg-amber-500/20 hover:bg-amber-500/30 backdrop-blur-md p-5 rounded-[1.5rem] shadow-lg border border-amber-500/40 flex justify-between items-center transition-all group active:scale-[0.99]";
                                    dotClass = "bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.8)]";
                                    timeClass = "text-amber-300 font-bold text-xl tracking-tight";
                                }

                                return (
                                    <React.Fragment key={b.id}>
                                        {showHeader && (
                                            <div className="flex items-center gap-4 py-3 mt-1">
                                                <div className="h-[1px] flex-1 bg-gradient-to-r from-transparent via-white/10 to-transparent"></div>
                                                <span className="text-[10px] font-bold text-emerald-200/80 uppercase tracking-[0.2em] backdrop-blur-md px-3 py-1 rounded-full border border-white/5 bg-white/5 shadow-sm">{dateStr}</span>
                                                <div className="h-[1px] flex-1 bg-gradient-to-r from-transparent via-white/10 to-transparent"></div>
                                            </div>
                                        )}
                                        <div className={containerClass}>
                                            <div className="flex-1 min-w-0 pr-4">
                                                <div className="flex items-center gap-2.5 mb-1.5">
                                                    <span className={timeClass}>{formatTime(b.start)} <span className="text-white/30 text-sm font-light mx-1">to</span> {formatTime(b.end)}</span>
                                                    {(isCurrent || isSoon) && (
                                                        <span className={`text-[9px] px-2 py-0.5 rounded-full border font-bold tracking-wider ${isCurrent ? 'bg-rose-500/20 text-rose-300 border-rose-500/20' : 'bg-amber-500/20 text-amber-300 border-amber-500/20'}`}>
                                                            {isCurrent ? 'BUSY' : 'SOON'}
                                                        </span>
                                                    )}
                                                </div>
                                                <div className="font-bold text-white text-lg truncate mb-1">{b.title}</div>
                                                <div className="text-xs text-emerald-100/60 flex items-center gap-1.5">
                                                    <div className={`flex items-center gap-1 ${isCurrent ? 'bg-rose-500/10' : isSoon ? 'bg-amber-500/10' : 'bg-white/10'} px-1.5 py-0.5 rounded text-[10px] border border-white/5`}>
                                                        <User size={10} /> {getDisplayName(b.ownerId)}
                                                    </div>
                                                    <span className="text-white/20">•</span> {b.owner}
                                                </div>
                                            </div>
                                            <div className="flex flex-col gap-2 shrink-0">
                                                <button onClick={() => { setPendingBookingData(b); setAuthAction('edit'); setShowAuthModal(true); }} className="p-2.5 rounded-xl bg-white/5 hover:bg-emerald-500/20 text-white/40 hover:text-emerald-400 border border-white/5 transition-all shadow-sm"><Edit2 size={18} /></button>
                                                <button onClick={() => { setPendingBookingData(b); setAuthAction('delete'); setShowAuthModal(true); }} className="p-2.5 rounded-xl bg-white/5 hover:bg-red-500/20 text-white/40 hover:text-red-400 border border-white/5 transition-all shadow-sm"><Trash2 size={18} /></button>
                                            </div>
                                        </div>
                                    </React.Fragment>
                                );
                            })
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
  };

  const renderBookingView = () => {
    const isTitleValid = bookingTitle.trim().length > 0;
    const isDeptValid = department.trim().length > 0;
    const isFormValid = isTitleValid && isDeptValid;

    const checkAvailability = (timeStr) => {
        return isTimeBlocked(timeStr, bookingDate, selectedRoom.id, bookings, editingBookingId, isBookingStarted);
    };

    return (
        <div className="h-full relative flex flex-col" style={{fontFamily: "-apple-system, BlinkMacSystemFont, 'Sukhumvit Set', sans-serif"}}>
        <div className="absolute inset-0 z-0">
            <img src={selectedRoom?.image} className="w-full h-full object-cover" />
            <div className="absolute inset-0 bg-emerald-950/80 backdrop-blur-xl" /> 
        </div>
        <Header title={editingBookingId ? 'Edit Booking' : 'New Booking'} onBack={() => setView('menu')} />
        <div className="p-6 flex-1 flex flex-col gap-6 relative z-10 overflow-y-auto pb-10">
            <div className="bg-emerald-900/20 backdrop-blur-xl p-6 rounded-[2rem] shadow-[0_8px_32px_0_rgba(0,0,0,0.3)] border border-white/10 ring-1 ring-white/5 space-y-6 relative overflow-hidden">
             <div className="absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-white/20 to-transparent"></div>
            <div>
                <label className="text-xs font-bold text-emerald-400 uppercase tracking-widest mb-3 block drop-shadow-sm ml-1">Meeting Title <span className="text-red-400">*</span></label>
                <input 
                    type="text" 
                    placeholder="e.g. Project Kickoff" 
                    className={`w-full text-xl font-bold bg-white/5 border py-4 px-5 rounded-2xl focus:outline-none focus:bg-white/10 focus:border-emerald-400/50 transition-all placeholder:text-white/20 text-white shadow-inner ${!isTitleValid && bookingTitle !== '' ? 'border-red-500/50' : 'border-white/10'}`}
                    value={bookingTitle} 
                    onChange={(e) => setBookingTitle(e.target.value)} 
                    autoFocus={!editingBookingId} 
                />
            </div>
            <div>
                <label className="text-xs font-bold text-emerald-400 uppercase tracking-widest mb-3 block drop-shadow-sm ml-1">Department <span className="text-red-400">*</span></label>
                <input 
                    type="text" 
                    placeholder="e.g. Marketing, HR" 
                    className={`w-full text-xl font-bold bg-white/5 border py-4 px-5 rounded-2xl focus:outline-none focus:bg-white/10 focus:border-emerald-400/50 transition-all placeholder:text-white/20 text-white shadow-inner ${!isDeptValid && department !== '' ? 'border-red-500/50' : 'border-white/10'}`}
                    value={department} 
                    onChange={(e) => setDepartment(e.target.value)} 
                />
            </div>
            <div>
                <label className="text-xs font-bold text-emerald-400 uppercase tracking-widest mb-3 block drop-shadow-sm flex items-center gap-2 ml-1"><AlignLeft size={14} /> Description (Optional)</label>
                <textarea 
                    rows="3"
                    placeholder="Agenda or details..." 
                    className="w-full text-lg font-medium bg-white/5 border border-white/10 py-4 px-5 rounded-2xl focus:outline-none focus:bg-white/10 focus:border-emerald-400/50 focus:ring-1 focus:ring-emerald-400/50 transition-all placeholder:text-white/20 text-white resize-none shadow-inner" 
                    value={description} 
                    onChange={(e) => setDescription(e.target.value)} 
                />
            </div>
            </div>
            <div className="bg-emerald-900/20 backdrop-blur-xl p-6 rounded-[2rem] shadow-[0_8px_32px_0_rgba(0,0,0,0.3)] border border-white/10 ring-1 ring-white/5 space-y-6 relative overflow-hidden">
                <div className="absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-white/20 to-transparent"></div>
                <div>
                    <label className="text-xs text-emerald-400 font-bold mb-3 block uppercase tracking-widest drop-shadow-sm ml-1">Date</label>
                    <input 
                        type="date" 
                        min={getLocalDateStr()} 
                        onClick={(e) => e.target.showPicker && e.target.showPicker()} 
                        className="w-full bg-white/5 border border-white/10 p-4 px-5 rounded-2xl font-bold text-lg text-white outline-none focus:bg-white/10 focus:border-emerald-400/50 focus:ring-1 focus:ring-emerald-400/50 transition-all shadow-inner [color-scheme:dark]" 
                        value={bookingDate} 
                        onChange={(e) => setBookingDate(e.target.value)} 
                        disabled={isBookingStarted}
                    />
                </div>
                <div className="flex gap-4 items-start">
                    <div className="flex-1">
                        <div className="flex justify-between items-center mb-3 h-7 px-1">
                            <label className="text-xs text-emerald-400 font-bold uppercase tracking-widest drop-shadow-sm">Start</label>
                        </div>
                        <button 
                            disabled={isBookingStarted}
                            onClick={() => !isBookingStarted && setPickerMode('start')}
                            className={`w-full bg-white/5 border border-white/10 p-4 rounded-2xl font-bold text-center text-xl outline-none focus:bg-white/10 focus:border-emerald-400/50 focus:ring-1 focus:ring-emerald-400/50 transition-all text-white hover:bg-white/10 flex items-center justify-center gap-2 shadow-inner ${isBookingStarted ? 'opacity-50 cursor-not-allowed bg-black/40' : ''}`}
                        >
                            {isBookingStarted && <Lock size={16} className="text-white/50" />}
                            {startTime}
                        </button>
                    </div>
                    <div className="flex flex-col justify-center h-full pt-10 opacity-30">
                        <ArrowRight size={24} className="text-white" />
                    </div>
                    <div className="flex-1 flex flex-col">
                        <div className="flex justify-between items-center mb-3 h-7">
                             <label className="text-xs text-emerald-400 font-bold uppercase tracking-widest drop-shadow-sm ml-1">End</label>
                             <div className="flex bg-white/10 rounded-lg p-0.5 border border-white/10 backdrop-blur-md shadow-inner">
                                 <button onClick={() => handleEndTimeModeToggle('specific')} className={`p-1.5 rounded-md transition-all ${endTimeMode === 'specific' ? 'bg-emerald-500 text-white shadow-lg' : 'text-white/40 hover:text-white'}`}>
                                     <Clock size={14} />
                                 </button>
                                 <button onClick={() => handleEndTimeModeToggle('duration')} className={`p-1.5 rounded-md transition-all ${endTimeMode === 'duration' ? 'bg-emerald-500 text-white shadow-lg' : 'text-white/40 hover:text-white'}`}>
                                     <Timer size={14} />
                                 </button>
                             </div>
                        </div>
                        {endTimeMode === 'specific' ? (
                            <button 
                                onClick={() => setPickerMode('end')}
                                className="w-full bg-white/5 border border-white/10 p-4 rounded-2xl font-bold text-center text-xl outline-none focus:bg-white/10 focus:border-emerald-400/50 focus:ring-1 focus:ring-emerald-400/50 transition-all text-white hover:bg-white/10 shadow-inner"
                            >
                                {endTime}
                            </button>
                        ) : (
                            <button 
                                onClick={() => setPickerMode('duration')}
                                className="w-full bg-white/5 border border-white/10 p-4 rounded-2xl font-bold text-center text-xl outline-none focus:bg-white/10 focus:border-emerald-400/50 focus:ring-1 focus:ring-emerald-400/50 transition-all text-white hover:bg-white/10 shadow-inner"
                            >
                                {Math.floor(parseInt(duration) / 60)} <span className="text-sm text-white/50 font-normal">Hr</span> {parseInt(duration) % 60} <span className="text-sm text-white/50 font-normal">Min</span>
                            </button>
                        )}
                        {endTimeMode === 'duration' && (
                             <div className="text-center text-[10px] text-white/40 mt-2 font-medium tracking-wide">Until {endTime}</div>
                        )}
                    </div>
                </div>
            </div>
            <div className="mt-auto pt-4">
                <button 
                    disabled={!isFormValid}
                    onClick={() => { if(editingBookingId) handleSaveBooking(); else { setAuthAction('create'); setShowAuthModal(true); }}} 
                    className={`w-full font-bold text-lg py-5 rounded-3xl shadow-[0_10px_40px_-10px_rgba(0,0,0,0.5)] transition-all border 
                        ${isFormValid 
                            ? 'bg-gradient-to-b from-white to-gray-200 text-emerald-950 border-white hover:shadow-[0_0_50px_-10px_rgba(255,255,255,0.4)] active:scale-[0.98]' 
                            : 'bg-white/5 text-white/20 border-white/5 cursor-not-allowed'
                        }`}
                >
                    {editingBookingId ? 'Save Changes' : 'Confirm Booking'}
                </button>
                {!isFormValid && (
                    <div className="flex items-center justify-center gap-2 mt-4 text-red-300 bg-red-500/10 py-3 rounded-2xl border border-red-500/20 animate-in fade-in slide-in-from-bottom-2 backdrop-blur-md">
                        <AlertCircle size={18} />
                        <span className="text-xs font-bold tracking-wide">Please complete all required fields</span>
                    </div>
                )}
            </div>
        </div>
        </div>
    );
  };

  const renderAuthModal = () => (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-md z-[60] flex items-center justify-center p-6">
      <div className="bg-emerald-950/40 backdrop-blur-2xl w-full max-w-xs rounded-[2.5rem] p-8 shadow-[0_0_50px_rgba(0,0,0,0.5)] animate-in zoom-in duration-300 border border-white/10 ring-1 ring-white/10">
        <div className="text-center mb-8">
            <div className={`w-16 h-16 mx-auto rounded-full flex items-center justify-center mb-6 shadow-[0_0_30px_rgba(52,211,153,0.15)] border border-white/10 ${authAction === 'delete' ? 'bg-red-500/10 text-red-400' : authAction === 'viewLogs' ? 'bg-blue-500/10 text-blue-400' : 'bg-white/5 text-emerald-400'}`}>
                {authAction === 'delete' ? <Trash2 size={28} /> : authAction === 'viewLogs' ? <Lock size={28} /> : <User size={28} />}
            </div>
            <h3 className="text-2xl font-bold text-white tracking-tight mb-2">
                {authAction === 'delete' ? 'Confirm Delete' : authAction === 'viewLogs' ? 'Security Check' : 'Booking Confirmation'}
            </h3>
            <p className="text-sm text-emerald-100/60 font-medium">
                {authAction === 'delete' ? 'ใส่ชื่อผู้จองเพื่อยืนยันการลบ' : authAction === 'viewLogs' ? 'กรุณากรอกรหัสผ่าน (Code)' : 'ลงชื่อผู้ทำการจอง'}
            </p>
        </div>
        <input 
            type={authAction === 'viewLogs' ? 'password' : 'text'}
            className="w-full bg-white/5 border border-white/10 rounded-2xl p-4 text-center text-xl font-bold mb-8 outline-none focus:bg-white/10 focus:border-emerald-400/50 focus:ring-1 focus:ring-emerald-400/50 text-white transition-all placeholder:text-white/10 placeholder:font-normal shadow-inner" 
            placeholder={authAction === 'viewLogs' ? 'Enter Code' : 'Your Name'}
            value={bookerName} 
            onChange={(e) => setBookerName(e.target.value)} 
            autoFocus 
        />
        <div className="flex gap-3">
            <button onClick={() => setShowAuthModal(false)} className="flex-1 py-4 text-white/50 hover:bg-white/5 font-bold text-sm rounded-2xl transition-colors active:scale-95 border border-transparent hover:border-white/5">
                Cancel
            </button>
            <button 
                onClick={handleAuthSubmit} 
                className={`flex-1 py-4 text-white rounded-2xl font-bold text-sm shadow-[0_0_20px_rgba(0,0,0,0.4)] backdrop-blur-md transition-all active:scale-95 border border-white/10 ${authAction === 'delete' ? 'bg-red-500 hover:bg-red-400 shadow-red-500/20' : authAction === 'viewLogs' ? 'bg-blue-500 hover:bg-blue-400 shadow-blue-500/20' : 'bg-emerald-500 hover:bg-emerald-400 text-black shadow-emerald-500/20'}`}
            >
                Confirm
            </button>
        </div>
      </div>
    </div>
  );

  const renderNotification = () => (
    <div className={`fixed top-6 left-1/2 -translate-x-1/2 z-[70] px-6 py-3 rounded-full shadow-2xl backdrop-blur-xl border border-white/10 flex items-center gap-3 animate-in slide-in-from-top-4 fade-in duration-300 ${notification.type === 'success' ? 'bg-emerald-900/80 text-emerald-100 border-emerald-500/30' : 'bg-red-900/80 text-red-100 border-red-500/30'}`}>
        {notification.type === 'success' ? <CheckCircle size={18} className="text-emerald-400" /> : <XCircle size={18} className="text-red-400" />}
        <span className="font-medium text-sm">{notification.message}</span>
    </div>
  );

  return (
    <div className="bg-gray-950 h-screen w-full overflow-hidden relative text-white selection:bg-emerald-500/30 selection:text-emerald-200" style={{fontFamily: "-apple-system, BlinkMacSystemFont, 'Sukhumvit Set', 'Thonburi', sans-serif"}}>
      <style>{`
        .no-scrollbar::-webkit-scrollbar { display: none; }
        .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
        .perspective-1000 { perspective: 1000px; }
        .mask-gradient-y { -webkit-mask-image: linear-gradient(to bottom, transparent, black 20%, black 80%, transparent); mask-image: linear-gradient(to bottom, transparent, black 20%, black 80%, transparent); }
      `}</style>
      <div className="max-w-md mx-auto h-full bg-black shadow-2xl relative flex flex-col">
        {view === 'dashboard' && renderDashboard()}
        {view === 'booking' && renderBookingView()}
        {view === 'menu' && renderRoomMenu()}
        {view === 'logs' && renderLogsView()}
        {view === 'history' && renderHistoryView()}
        {showMainMenu && renderMainMenuOverlay()}
        {showAuthModal && renderAuthModal()}
        {notification && renderNotification()}
        
        {pickerMode === 'duration' ? (
             <GlassDurationPicker 
                value={duration}
                onChange={handleDurationPickerChange}
                onClose={() => setPickerMode(null)}
             />
        ) : pickerMode && (
            <GlassTimePicker 
                value={pickerMode === 'start' ? startTime : endTime}
                onChange={handleTimeChange}
                onClose={() => setPickerMode(null)}
                title={pickerMode === 'start' ? 'Start Time' : 'End Time'}
                blockedCheck={pickerMode === 'start' ? (t) => isTimeBlocked(t, bookingDate, selectedRoom.id, bookings, editingBookingId, isBookingStarted) : null}
                minTime={pickerMode === 'start' && !isBookingStarted && bookingDate === getLocalDateStr() ? new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : (pickerMode === 'end' ? startTime : null)}
            />
        )}
      </div>
    </div>
  );
}
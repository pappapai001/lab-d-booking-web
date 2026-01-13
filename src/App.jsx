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
  const date = new Date(timestamp);
  return date.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });
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

const getCurrentTimeStr = () => new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });

const getDisplayName = (name) => {
    if (!name) return '';
    const safeName = typeof name === 'object' ? 'User' : String(name);
    return safeName.toLowerCase() === 'godmode' ? 'Admin' : safeName;
};

const isTimeBlocked = (timeStr, dateStr, roomId, bookings, currentBookingId, isStarted) => {
    const checkDate = new Date(`${dateStr}T${timeStr}`);
    const checkTime = checkDate.getTime();
    const now = new Date().getTime();
    const safeBookings = Array.isArray(bookings) ? bookings : [];

    if (!isStarted && checkTime < now - 60000) return true; 

    return safeBookings.some(b => {
        if (b.id === currentBookingId) return false; 
        if (b.roomId !== roomId) return false;
        return checkTime >= b.start && checkTime < b.end;
    });
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
      return { status: 'busy', text: 'BUSY', detail: `Occupied until ${formatTime(currentBooking.end)}` };
  }
  
  const nextBooking = safeBookings
    .filter(b => b.roomId === roomId && b.start > now)
    .sort((a, b) => a.start - b.start)[0];

  if (nextBooking) {
      const diffMins = (nextBooking.start - now) / (1000 * 60);
      if (diffMins <= 10) {
          return { status: 'soon', text: 'SOON', detail: `Starts in ${Math.ceil(diffMins)} min` };
      }
      const isToday = new Date(nextBooking.start).getDate() === new Date().getDate();
      const timeStr = formatTime(nextBooking.start);
      return { status: 'free', text: 'AVAILABLE', detail: `Free until ${isToday ? timeStr : formatDateShort(nextBooking.start)}` };
  }
  
  return { status: 'free', text: 'AVAILABLE', detail: 'Available' };
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
        if (hourRef.current) hourRef.current.scrollTop = parseInt(hour, 10) * 48;
        if (minuteRef.current) minuteRef.current.scrollTop = Math.round(parseInt(minute, 10) / 5) * 48;
    }, 100);
    return () => clearTimeout(timer);
  }, []);

  const handleSave = () => {
    if (blockedCheck && blockedCheck(`${hour}:${minute}`)) return; 
    onChange(`${hour}:${minute}`);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-end justify-center bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="absolute inset-0" onClick={onClose} />
      <div className="relative z-10 w-full max-w-md bg-gray-900/90 backdrop-blur-3xl border-t border-white/20 rounded-t-[2.5rem] p-6 pb-12 shadow-2xl animate-in slide-in-from-bottom-10 duration-300 ring-1 ring-white/10">
        <div className="flex justify-between items-center mb-8 px-2">
          <button onClick={onClose} className="text-white/50 hover:text-white transition-colors text-base font-medium">Cancel</button>
          <h3 className="text-white font-bold text-lg">{title}</h3>
          <button onClick={handleSave} className="text-emerald-400 font-bold hover:text-emerald-300 transition-colors text-base">Done</button>
        </div>
        <div className="flex justify-center gap-4 h-48 relative overflow-hidden">
          <div className="absolute top-1/2 -translate-y-1/2 w-full h-12 bg-white/10 rounded-xl pointer-events-none border-y border-white/10" />
          <div ref={hourRef} className="w-20 overflow-y-scroll no-scrollbar py-[calc(6rem-1.5rem)] snap-y snap-mandatory text-center">
            {hours.map(h => {
                let isBlocked = false;
                if (minTime) if (parseInt(h) < parseInt(minTime.split(':')[0])) isBlocked = true;
                if (blockedCheck && !isBlocked) isBlocked = blockedCheck(`${h}:00`) && blockedCheck(`${h}:30`);
                return <div key={h} onClick={() => !isBlocked && setHour(h)} className={`h-12 flex items-center justify-center snap-center cursor-pointer transition-all duration-300 ${hour === h ? 'text-white text-3xl font-bold scale-110' : isBlocked ? 'text-white/10 decoration-slice line-through' : 'text-white/30 text-xl'}`}>{h}</div>;
            })}
          </div>
          <div className="flex items-center text-white/50 pb-1 font-bold text-xl">:</div>
          <div ref={minuteRef} className="w-20 overflow-y-scroll no-scrollbar py-[calc(6rem-1.5rem)] snap-y snap-mandatory text-center">
            {minutes.map(m => {
                 let isBlocked = false;
                 if (minTime) {
                     if (parseInt(hour) < parseInt(minTime.split(':')[0])) isBlocked = true;
                     else if (parseInt(hour) === parseInt(minTime.split(':')[0]) && parseInt(m) <= parseInt(minTime.split(':')[1])) isBlocked = true;
                 }
                 if (!isBlocked && blockedCheck) isBlocked = blockedCheck(`${hour}:${m}`);
                 return <div key={m} onClick={() => !isBlocked && setMinute(m)} className={`h-12 flex items-center justify-center snap-center cursor-pointer transition-all duration-300 ${minute === m ? 'text-white text-3xl font-bold scale-110' : isBlocked ? 'text-red-500/40 cursor-not-allowed decoration-slice line-through' : 'text-white/30 text-xl'}`}>{m}</div>;
            })}
          </div>
        </div>
      </div>
    </div>
  );
};

const GlassDurationPicker = ({ value, onChange, onClose }) => {
  const initVal = parseInt(value) || 60;
  const [hour, setHour] = useState(Math.floor(initVal / 60));
  const [minute, setMinute] = useState(initVal % 60);
  const hourRef = useRef(null);
  const minuteRef = useRef(null);

  useEffect(() => {
    const timer = setTimeout(() => {
        if (hourRef.current) hourRef.current.scrollTop = hour * 48;
        if (minuteRef.current) minuteRef.current.scrollTop = minute * 48;
    }, 100);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div className="fixed inset-0 z-[200] flex items-end justify-center bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="absolute inset-0" onClick={onClose} />
      <div className="relative z-10 w-full max-w-md bg-gray-900/90 backdrop-blur-3xl border-t border-white/20 rounded-t-[2.5rem] p-6 pb-12 shadow-2xl animate-in slide-in-from-bottom-10 duration-300 ring-1 ring-white/10">
        <div className="flex justify-between items-center mb-8 px-2">
          <button onClick={onClose} className="text-white/50 hover:text-white transition-colors text-base font-medium">Cancel</button>
          <h3 className="text-white font-bold text-lg">Select Duration</h3>
          <button onClick={() => { onChange(((hour * 60) + minute || 5).toString()); onClose(); }} className="text-emerald-400 font-bold hover:text-emerald-300 transition-colors text-base">Done</button>
        </div>
        <div className="flex justify-center gap-4 h-48 relative overflow-hidden">
          <div className="absolute top-1/2 -translate-y-1/2 w-full h-12 bg-white/10 rounded-xl pointer-events-none border-y border-white/10" />
          <div ref={hourRef} className="w-24 overflow-y-scroll no-scrollbar py-[calc(6rem-1.5rem)] snap-y snap-mandatory text-center">
            {Array.from({ length: 9 }, (_, i) => i).map(h => (
              <div key={h} onClick={() => setHour(h)} className={`h-12 flex items-center justify-center snap-center cursor-pointer transition-all duration-300 ${hour === h ? 'text-white text-3xl font-bold scale-110' : 'text-white/30 text-xl'}`}>{h} <span className="text-sm ml-1 opacity-50">Hr</span></div>
            ))}
          </div>
          <div className="flex items-center text-white/50 pb-1 font-thin text-xl">:</div>
          <div ref={minuteRef} className="w-24 overflow-y-scroll no-scrollbar py-[calc(6rem-1.5rem)] snap-y snap-mandatory text-center">
            {Array.from({ length: 60 }, (_, i) => i).map(m => (
              <div key={m} onClick={() => setMinute(m)} className={`h-12 flex items-center justify-center snap-center cursor-pointer transition-all duration-300 ${minute === m ? 'text-white text-3xl font-bold scale-110' : 'text-white/30 text-xl'}`}>{m} <span className="text-sm ml-1 opacity-50">Min</span></div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

const Header = ({ title, onBack, onMenuClick }) => (
  <div className="flex items-center justify-between px-6 pt-12 pb-4 z-20 shrink-0">
    <div className="flex items-center gap-3">
      {onBack ? (
        <button onClick={onBack} className="p-2.5 rounded-full bg-white/10 backdrop-blur-xl border border-white/20 text-white active:scale-90 shadow-sm"><ChevronLeft size={22} /></button>
      ) : (
        <button onClick={onMenuClick} className="p-2.5 rounded-full bg-white/10 backdrop-blur-xl border border-white/20 text-white active:scale-90 shadow-sm"><Menu size={22} /></button>
      )}
      <span className="text-xl font-bold tracking-tight text-white/90 drop-shadow-md">{title}</span>
    </div>
    <div className="w-10 h-10 rounded-full bg-white/10 border-2 border-white/20 overflow-hidden backdrop-blur-md shadow-lg"><img src={`https://api.dicebear.com/7.x/notionists/svg?seed=Admin`} alt="User" className="w-full h-full object-cover" /></div>
  </div>
);

const RoomCardBento = ({ room, bookings, onSelect }) => {
  const { status, text } = getStatus(room.id, bookings);
  let statusColor = status === 'busy' ? 'bg-rose-500' : status === 'soon' ? 'bg-amber-400' : 'bg-emerald-400';
  let cardOverlay = status === 'busy' ? 'bg-rose-900/40 mix-blend-multiply' : status === 'soon' ? 'bg-amber-900/40 mix-blend-multiply' : 'bg-emerald-950/80 mix-blend-multiply';
  const upcomingBookings = bookings.filter(b => b.roomId === room.id && b.end > new Date().getTime()).sort((a, b) => a.start - b.start).slice(0, 10); 

  return (
    <div onClick={() => onSelect(room)} className="relative group min-h-[320px] shrink-0 rounded-[2.5rem] overflow-hidden cursor-pointer active:scale-[0.98] transition-all duration-500 shadow-2xl ring-1 ring-white/10">
      <div className="absolute inset-0"><img src={room.image} alt={room.name} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-1000" /><div className={`absolute inset-0 ${cardOverlay} transition-colors duration-500`} /><div className="absolute inset-0 bg-black/15" /></div>
      <div className="relative h-full flex flex-col justify-between p-5">
          <div className="flex justify-between items-start"><div className={`px-4 py-2 rounded-full backdrop-blur-xl border border-white/20 flex items-center gap-3 transition-all duration-500 shadow-xl ${status === 'busy' ? 'bg-rose-600/80' : 'bg-white/10'}`}><div className={`relative flex h-3 w-3`}><span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${statusColor}`}></span><span className={`relative inline-flex rounded-full h-3 w-3 ${statusColor}`}></span></div><span className="text-xs font-bold tracking-widest uppercase">{text}</span></div></div>
          <div className="space-y-4">
              <div className="px-2"><h2 className="text-3xl font-bold text-white tracking-tight drop-shadow-lg">{room.name}</h2><div className="flex items-center gap-3 text-white/90 text-sm font-medium mt-1"><span>{room.thName}</span><span className="w-1 h-1 bg-white/60 rounded-full"></span><span className="flex items-center gap-1.5"><Users size={14}/> {room.capacity}</span></div></div>
              <div className={`backdrop-blur-2xl border border-white/10 rounded-[1.8rem] p-4 shadow-xl transition-colors ${status === 'busy' ? 'bg-rose-950/50' : status === 'soon' ? 'bg-amber-950/50' : 'bg-white/5'}`}><div className="flex items-center justify-between mb-3 px-1"><span className="text-[10px] text-white/60 uppercase font-black tracking-widest">Upcoming</span><span className="text-[10px] font-bold text-white/90 bg-black/30 px-2 py-1 rounded-full border border-white/10">{upcomingBookings.length} Slots</span></div><div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar snap-x">
                      {upcomingBookings.length === 0 ? <div className="w-full py-2 text-center text-xs text-white/40 italic">No bookings</div> : upcomingBookings.map((b, i) => (
                          <div key={i} className={`snap-start flex-shrink-0 min-w-[110px] p-3 rounded-2xl border backdrop-blur-md flex flex-col justify-center transition-all ${new Date().getTime() >= b.start && new Date().getTime() <= b.end ? 'bg-gradient-to-br from-white/30 to-white/10 border-white/40 shadow-xl' : 'bg-black/40 border-white/5'}`}>
                              <div className="flex items-center gap-1.5 mb-1"><div className={`w-1.5 h-1.5 rounded-full ${new Date().getTime() >= b.start && new Date().getTime() <= b.end ? 'bg-white shadow-[0_0_8px_white]' : 'bg-white/30'}`} /><span className="text-[10px] font-black text-white/90">{formatTime(b.start)} - {formatTime(b.end)}</span></div>
                              <div className="text-[10px] text-white font-bold truncate mb-0.5">{getDisplayName(b.ownerId)}</div>
                              <div className="text-[9px] text-white/50 font-medium truncate">{formatDateShort(b.start)}</div>
                          </div>
                      ))}
              </div></div>
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
  const [editingBookingId, setEditingBookingId] = useState(null);
  const [bookingDate, setBookingDate] = useState(getLocalDateStr());
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
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [authAction, setAuthAction] = useState('create');
  const [pendingBookingData, setPendingBookingData] = useState(null);
  const [notification, setNotification] = useState(null);

  // --- Auth & Data Initializer ---
  useEffect(() => {
    const initAuth = async () => {
      try {
        if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
            try {
                await signInWithCustomToken(auth, __initial_auth_token);
            } catch (e) {
                console.warn("Auth token mismatch, falling back");
                await signInAnonymously(auth);
            }
        } else {
            await signInAnonymously(auth);
        }
      } catch (err) { console.error("Auth error:", err); }
    };
    initAuth();
    const unsub = onAuthStateChanged(auth, setUser);
    return unsub;
  }, []);

  useEffect(() => {
    if (!user) return;
    const unsubData = onSnapshot(query(collection(db, 'artifacts', appId, 'public', 'data', 'bookings')), (snap) => {
      setBookings(snap.docs.map(d => {
          const data = d.data();
          return { id: d.id, ...data, title: String(data.title || ''), owner: String(data.owner || ''), ownerId: String(data.ownerId || ''), description: String(data.description || '') };
      }));
      setLoading(false);
    });
    const unsubLogs = onSnapshot(query(collection(db, 'artifacts', appId, 'public', 'data', 'audit_logs'), orderBy('timestamp', 'desc'), limit(50)), (snap) => {
      setLogs(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
    return () => { unsubData(); unsubLogs(); };
  }, [user]);

  const logAction = async (action, details, userName) => {
      try { await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'audit_logs'), { action, details, user: String(userName), timestamp: new Date().getTime() }); } catch (e) { console.error("Log failed", e); }
  };

  const showNotif = (type, message) => {
    setNotification({ type, message });
    setTimeout(() => setNotification(null), 3000);
  };

  const handleRoomSelect = (room) => { setSelectedRoom(room); setView('menu'); };

  const checkOverlap = (startTs, endTs) => {
      return bookings.some(b => b.id !== editingBookingId && b.roomId === selectedRoom.id && (startTs < b.end && endTs > b.start));
  };

  const findNextAvailableSlot = (initialStart, durationMins, roomBookings) => {
    let currentStart = new Date(initialStart);
    let currentEnd = new Date(currentStart.getTime() + durationMins * 60000);
    const sorted = [...roomBookings].sort((a, b) => a.start - b.start);
    let found = false; let attempts = 0;
    while (!found && attempts < 20) {
        const conflict = sorted.find(b => currentStart.getTime() < b.end && currentEnd.getTime() > b.start);
        if (conflict) {
            const next = new Date(conflict.end);
            currentStart = new Date(Math.ceil(next.getTime() / (1000 * 60 * 5)) * (1000 * 60 * 5));
            currentEnd = new Date(currentStart.getTime() + durationMins * 60000);
            attempts++;
        } else found = true;
    }
    return { start: currentStart, end: currentEnd };
  };

  const initBookingForm = (isEdit = false, booking = null) => {
    const now = new Date();
    if (isEdit && booking) {
      setEditingBookingId(booking.id);
      setIsBookingStarted(now.getTime() > booking.start);
      setBookingDate(getLocalDateStr(new Date(booking.start)));
      setStartTime(new Date(booking.start).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }));
      setEndTime(new Date(booking.end).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }));
      setBookingTitle(String(booking.title || '')); setDepartment(String(booking.owner || '')); setBookerName(String(booking.ownerId || '')); setDescription(String(booking.description || '')); setEndTimeMode('specific'); setAuthAction('edit');
    } else {
      const roundedStart = new Date(Math.ceil((now.getTime() + 30 * 60000) / (1000 * 60 * 5)) * (1000 * 60 * 5));
      const { start: validStart, end: validEnd } = findNextAvailableSlot(roundedStart, 60, bookings.filter(b => b.roomId === selectedRoom.id));
      setEditingBookingId(null); setIsBookingStarted(false); setBookingDate(getLocalDateStr(validStart)); setStartTime(validStart.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })); setEndTime(validEnd.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }));
      setBookingTitle(''); setDepartment(''); setBookerName(''); setDescription(''); setEndTimeMode('specific'); setDuration('60'); setAuthAction('create');
    }
    setView('booking');
  };

  const handleSaveBooking = async () => {
    if (!department || !bookerName) return showNotif('error', 'Please fill required fields');
    const sTs = new Date(`${bookingDate}T${startTime}`).getTime();
    const eTs = new Date(`${bookingDate}T${endTime}`).getTime();
    if (sTs >= eTs) return showNotif('error', 'End must be after Start');
    if (!isBookingStarted && sTs < new Date().getTime() - 60000) return showNotif('error', 'Cannot book past time');
    if (checkOverlap(sTs, eTs)) return showNotif('error', 'This slot is already taken');

    const data = { roomId: selectedRoom.id, title: bookingTitle || 'Meeting', start: sTs, end: eTs, owner: department, ownerId: bookerName, description: description || '' };
    try {
      if (editingBookingId) {
          await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'bookings', editingBookingId));
          await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'bookings'), data);
          logAction('update', `Edit: ${bookingTitle}`, bookerName);
      } else {
          await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'bookings'), data);
          logAction('create', `Book: ${selectedRoom.name} - ${bookingTitle}`, bookerName);
      }
      showNotif('success', 'Confirmed!'); 
      setShowAuthModal(false);
      setView('dashboard');
    } catch (e) { showNotif('error', 'Save failed'); }
  };

  const handleAuthSubmit = () => {
    const name = bookerName.trim().toLowerCase();
    if (authAction === 'viewLogs') {
        if (name === 'godmode') { setView('logs'); setShowMainMenu(false); setShowAuthModal(false); setBookerName(''); }
        else showNotif('error', 'Access Denied');
        return;
    }
    if (!name) return showNotif('error', 'Enter your name');
    if (authAction === 'create') handleSaveBooking();
    else if (name === 'godmode' || pendingBookingData.ownerId === bookerName) {
        if (authAction === 'edit') { setShowAuthModal(false); initBookingForm(true, pendingBookingData); }
        else { 
            deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'bookings', pendingBookingData.id)); 
            logAction('delete', `Delete: ${pendingBookingData.title}`, bookerName); 
            showNotif('success', 'Deleted'); 
            setShowAuthModal(false);
            setView('dashboard');
        }
    } else showNotif('error', 'Not the owner');
  };

  const handleTimeChange = (newTime) => {
    if (pickerMode === 'start') {
        if (isTimeBlocked(newTime, bookingDate, selectedRoom.id, bookings, editingBookingId, isBookingStarted)) return showNotif('error', 'Slot busy');
        setStartTime(newTime);
        const end = new Date(new Date(`${bookingDate}T${newTime}`).getTime() + (endTimeMode === 'duration' ? parseInt(duration) : 60) * 60000);
        setEndTime(end.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }));
    } else if (pickerMode === 'end') {
        const sTs = new Date(`${bookingDate}T${startTime}`).getTime();
        const eTs = new Date(`${bookingDate}T${newTime}`).getTime();
        if (eTs <= sTs || checkOverlap(sTs, eTs)) return showNotif('error', 'Invalid slot');
        setEndTime(newTime);
    }
  };

  const handleDurationChange = (val) => {
    const end = new Date(new Date(`${bookingDate}T${startTime}`).getTime() + parseInt(val) * 60000);
    if (checkOverlap(new Date(`${bookingDate}T${startTime}`).getTime(), end.getTime())) return showNotif('error', 'Duration overlaps');
    setDuration(val); setEndTime(end.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }));
  };

  const handleEndTimeModeToggle = (mode) => {
    setEndTimeMode(mode);
    if (mode === 'duration') handleDurationChange(duration);
  };

  // --- Sub-View Renders ---

  const renderNotification = () => {
    if (!notification) return null;
    return (
        <div className={`fixed top-8 left-1/2 -translate-x-1/2 z-[300] px-6 py-3 rounded-full shadow-2xl backdrop-blur-xl border border-white/10 flex items-center gap-3 animate-in slide-in-from-top-4 duration-300 ${notification.type === 'success' ? 'bg-emerald-900/80 text-emerald-100' : 'bg-rose-900/80 text-rose-100'}`}>
            {notification.type === 'success' ? <CheckCircle size={20} className="text-emerald-400" /> : <XCircle size={20} className="text-rose-400" />}
            <span className="font-bold text-sm tracking-wide">{notification.message}</span>
        </div>
    );
  };

  const renderDashboard = () => (
    <div className="h-full flex flex-col bg-gray-950 text-white overflow-hidden" style={{fontFamily: "-apple-system, BlinkMacSystemFont, 'Sukhumvit Set', sans-serif"}}>
      <Header title="Lab-D Meeting Room" onMenuClick={() => setShowMainMenu(true)} />
      <div className="flex-1 px-5 pb-5 flex flex-col gap-5 overflow-y-auto no-scrollbar pt-2">
        <div className="flex items-center justify-between px-2 shrink-0">
             <div className="text-sm font-medium text-emerald-100/60">{new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}</div>
             <div className="flex items-center gap-1.5 text-[10px] font-bold text-emerald-400 uppercase tracking-widest bg-emerald-500/10 px-2.5 py-1.5 rounded-full border border-emerald-500/20"><Zap size={12} fill="currentColor" /> Live</div>
        </div>
        {loading ? <div className="flex-1 flex items-center justify-center"><Loader2 className="animate-spin text-emerald-500" size={40} /></div> : ROOMS.map(room => <RoomCardBento key={room.id} room={room} bookings={bookings} onSelect={handleRoomSelect} />)}
      </div>
    </div>
  );

  const renderBookingView = () => {
    const isFormValid = bookingTitle.trim().length > 0 && department.trim().length > 0;
    return (
        <div className="h-[100dvh] relative flex flex-col bg-black overflow-hidden" style={{fontFamily: "-apple-system, BlinkMacSystemFont, 'Sukhumvit Set', sans-serif"}}>
            <div className="absolute inset-0 z-0"><img src={selectedRoom?.image} className="w-full h-full object-cover" /><div className="absolute inset-0 bg-emerald-950/80 backdrop-blur-xl" /></div>
            <Header title={editingBookingId ? 'Edit Booking' : 'New Booking'} onBack={() => setView('menu')} />
            <div className="flex-1 overflow-y-auto px-6 pt-2 pb-24 relative z-10 no-scrollbar"><div className="flex flex-col gap-6">
                    <div className="bg-white/5 backdrop-blur-3xl p-6 rounded-[2rem] border border-white/10 shadow-2xl space-y-6 relative overflow-hidden"><div className="absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-white/20 to-transparent"></div>
                        <div><label className="text-[10px] font-bold text-emerald-400 uppercase tracking-widest mb-3 block opacity-80">Meeting Title <span className="text-red-400 font-black">*</span></label><input type="text" placeholder="e.g. Project Kickoff" className="w-full text-xl font-bold bg-black/30 border border-white/10 py-4 px-5 rounded-2xl focus:outline-none focus:border-emerald-500/50 text-white" value={bookingTitle} onChange={(e) => setBookingTitle(e.target.value)} /></div>
                        <div><label className="text-[10px] font-bold text-emerald-400 uppercase tracking-widest mb-3 block opacity-80">Department <span className="text-red-400 font-black">*</span></label><input type="text" placeholder="e.g. Marketing, HR" className="w-full text-xl font-bold bg-black/30 border border-white/10 py-4 px-5 rounded-2xl focus:outline-none focus:border-emerald-500/50 text-white" value={department} onChange={(e) => setDepartment(e.target.value)} /></div>
                        <div><label className="text-[10px] font-bold text-emerald-400 uppercase tracking-widest mb-3 block opacity-80 flex items-center gap-2 ml-1"><AlignLeft size={14} /> Description (Optional)</label><textarea rows="3" placeholder="Agenda..." className="w-full text-lg font-medium bg-black/30 border border-white/10 py-4 px-5 rounded-2xl focus:outline-none focus:border-emerald-500/50 text-white resize-none" value={description} onChange={(e) => setDescription(e.target.value)} /></div>
                    </div>
                    <div className="bg-white/5 backdrop-blur-3xl p-6 rounded-[2rem] border border-white/10 shadow-2xl space-y-6 relative overflow-hidden"><div className="absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-white/20 to-transparent"></div>
                        <div><label className="text-[10px] text-emerald-400 font-bold mb-3 block uppercase tracking-widest opacity-80">Date</label><input type="date" min={getLocalDateStr()} onClick={(e) => e.target.showPicker && e.target.showPicker()} className="w-full bg-black/30 border border-white/10 p-4 px-5 rounded-2xl font-bold text-lg text-white [color-scheme:dark]" value={bookingDate} onChange={(e) => setBookingDate(e.target.value)} disabled={isBookingStarted} /></div>
                        <div className="flex gap-4 items-start"><div className="flex-1"><label className="text-[10px] text-emerald-400 font-bold mb-3 block uppercase tracking-widest opacity-80">Start</label><button disabled={isBookingStarted} onClick={() => setPickerMode('start')} className={`w-full bg-black/30 border border-white/10 p-4 rounded-2xl font-bold text-center text-xl text-white flex items-center justify-center gap-2 ${isBookingStarted ? 'opacity-40' : 'active:scale-95'}`}>{isBookingStarted && <Lock size={16} />} {startTime}</button></div><div className="pt-10 opacity-20"><ArrowRight size={20} className="text-white" /></div><div className="flex-1 flex flex-col"><div className="flex justify-between items-center mb-3"><label className="text-[10px] text-emerald-400 font-bold uppercase tracking-widest opacity-80">End</label><div className="flex bg-white/10 rounded-lg p-0.5 border border-white/10"><button onClick={() => handleEndTimeModeToggle('specific')} className={`p-1.5 rounded-md transition-all ${endTimeMode === 'specific' ? 'bg-emerald-500 text-black shadow-lg' : 'text-white/40'}`}><Clock size={12} /></button><button onClick={() => handleEndTimeModeToggle('duration')} className={`p-1.5 rounded-md transition-all ${endTimeMode === 'duration' ? 'bg-emerald-500 text-black shadow-lg' : 'text-white/40'}`}><Timer size={12} /></button></div></div>
                                {endTimeMode === 'specific' ? <button onClick={() => setPickerMode('end')} className="w-full bg-black/30 border border-white/10 p-4 rounded-2xl font-bold text-center text-xl text-white active:scale-95">{endTime}</button> : <button onClick={() => setPickerMode('duration')} className="w-full bg-black/30 border border-white/10 p-4 rounded-2xl font-bold text-center text-lg text-white active:scale-95">{Math.floor(parseInt(duration) / 60)}Hr {parseInt(duration) % 60}Min</button>}
                            </div></div>{endTimeMode === 'duration' && <div className="text-center text-[10px] text-white/30 font-bold tracking-widest uppercase">Until {endTime}</div>}
                    </div>
                    <div className="pt-2"><button disabled={!isFormValid} onClick={() => { if(editingBookingId) handleSaveBooking(); else { setAuthAction('create'); setShowAuthModal(true); }}} className={`w-full font-bold text-lg py-5 rounded-3xl transition-all border ${isFormValid ? 'bg-gradient-to-b from-white to-gray-200 text-emerald-950 border-white active:scale-95' : 'bg-white/5 text-white/20 border-white/5'}`}>{editingBookingId ? 'Save Changes' : 'Confirm Booking'}</button>{!isFormValid && <div className="flex items-center justify-center gap-2 mt-4 text-rose-400 font-bold"><AlertCircle size={16} /><span className="text-[10px] font-black uppercase">Required fields missing</span></div>}</div>
                </div></div>
        </div>
    );
  };

  const renderLogsView = () => (
      <div className="h-full flex flex-col bg-gray-950 text-white" style={{fontFamily: "-apple-system, BlinkMacSystemFont, 'Sukhumvit Set', sans-serif"}}><Header title="Activity Log" onBack={() => setView('dashboard')} />
          <div className="flex-1 overflow-y-auto px-6 pb-12 space-y-4 pt-2 no-scrollbar">{logs.length === 0 ? <div className="text-center text-white/30 py-10 font-medium">No history</div> : logs.map((log) => (
              <div key={log.id} className="bg-white/5 border border-white/10 p-5 rounded-[1.5rem]"><div className="flex justify-between items-start mb-3"><span className={`text-[10px] font-bold px-2.5 py-1 rounded-full uppercase ${log.action === 'create' ? 'bg-emerald-500/20 text-emerald-300' : log.action === 'delete' ? 'bg-red-500/20 text-red-300' : 'bg-blue-500/20 text-blue-300'}`}>{log.action}</span><span className="text-[10px] text-white/40">{new Date(log.timestamp).toLocaleString()}</span></div><p className="text-sm text-white/90 mb-3">{log.details}</p><div className="flex items-center gap-2 text-xs text-white/40 border-t border-white/5 pt-3"><User size={12} /> by {getDisplayName(log.user)}</div></div>))}
          </div>
      </div>
  );

  const renderHistoryView = () => {
      const pastBookings = bookings.filter(b => b.end < new Date().getTime()).sort((a,b) => b.start - a.start);
      return (
        <div className="h-full flex flex-col bg-gray-950 text-white" style={{fontFamily: "-apple-system, BlinkMacSystemFont, 'Sukhumvit Set', sans-serif"}}><Header title="History" onBack={() => setView('dashboard')} />
            <div className="flex-1 overflow-y-auto px-6 pb-12 space-y-4 pt-2 no-scrollbar">{pastBookings.length === 0 ? <div className="text-center text-white/30 py-10">No past bookings</div> : pastBookings.map((b) => (
                <div key={b.id} className="bg-white/5 border border-white/10 p-5 rounded-[1.5rem] flex flex-col gap-3backdrop-blur-md opacity-90"><div className="flex justify-between items-center border-b border-white/10 pb-2 mb-1"><div className="text-emerald-400 font-bold text-sm">{new Date(b.start).toLocaleDateString()}</div><span className="text-[10px] text-white/30 uppercase">{b.roomId === 'big' ? 'Grand Room' : 'Focus Room'}</span></div><div><div className="text-white font-bold text-lg">{getDisplayName(b.title)}</div>{b.description && <div className="text-xs text-white/50 mt-1">"{getDisplayName(b.description)}"</div>}</div><div className="flex justify-between items-end mt-1 pt-3 border-t border-white/5"><div className="text-xs text-emerald-100/70 flex items-center gap-1.5"><Clock size={12} /> {formatTime(b.start)} - {formatTime(b.end)}</div><div className="text-right font-bold text-xs"><User size={10} className="inline mr-1 opacity-50" />{getDisplayName(b.ownerId)}<div className="text-[10px] text-white/30 font-normal">{getDisplayName(b.owner)}</div></div></div></div>))}
            </div>
        </div>
      );
  };

  const renderMainMenuOverlay = () => (
    <div className="fixed inset-0 z-[160] bg-black/60 backdrop-blur-sm flex flex-col animate-in fade-in duration-200" style={{fontFamily: "-apple-system, BlinkMacSystemFont, 'Sukhumvit Set', sans-serif"}}>
        <div className="flex-1" onClick={() => setShowMainMenu(false)} />
        <div className="bg-gray-900/90 backdrop-blur-3xl border-t border-white/20 rounded-t-[2.5rem] p-6 pb-12 shadow-[0_-20px_60px_rgba(0,0,0,0.7)] animate-in slide-in-from-bottom-10 duration-300 ring-1 ring-white/10">
            <div className="flex justify-center mb-8"><div className="w-12 h-1.5 bg-white/20 rounded-full" /></div>
            <div className="space-y-4">
                <button onClick={() => { setAuthAction('viewLogs'); setShowAuthModal(true); }} className="w-full p-5 bg-gradient-to-br from-white/10 to-white/5 rounded-3xl flex items-center gap-5 border border-white/10 shadow-lg active:scale-95 transition-all"><div className="p-4 bg-blue-500/20 text-blue-400 rounded-2xl group-hover:bg-blue-500 group-hover:text-white transition-all"><FileText size={26} /></div><div className="text-left"><span className="block text-white font-bold text-xl mb-0.5">Activity Log</span><span className="text-white/40 text-sm">ประวัติการแก้ไขระบบ</span></div><ChevronRight size={20} className="ml-auto text-white/20"/></button>
                <button onClick={() => { setView('history'); setShowMainMenu(false); }} className="w-full p-5 bg-gradient-to-br from-white/10 to-white/5 rounded-3xl flex items-center gap-5 border border-white/10 shadow-lg active:scale-95 transition-all"><div className="p-4 bg-purple-500/20 text-purple-400 rounded-2xl group-hover:bg-purple-500 group-hover:text-white transition-all"><History size={26} /></div><div className="text-left"><span className="block text-white font-bold text-xl mb-0.5">History</span><span className="text-white/40 text-sm">รายงานการใช้งานย้อนหลัง</span></div><ChevronRight size={20} className="ml-auto text-white/20"/></button>
            </div>
            <button onClick={() => setShowMainMenu(false)} className="w-full mt-8 py-4 text-white/40 font-bold text-base tracking-wide">Close Menu</button>
        </div>
    </div>
  );

  const renderAuthModal = () => (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-md z-[200] flex items-center justify-center p-6">
      <div className="bg-gray-900/90 backdrop-blur-3xl w-full max-w-xs rounded-[2.5rem] p-8 border border-white/10 ring-1 ring-white/10 shadow-2xl animate-in zoom-in-95 duration-200">
        <div className="text-center mb-8"><div className={`w-16 h-16 mx-auto rounded-full flex items-center justify-center mb-6 shadow-2xl border border-white/10 ${authAction === 'delete' ? 'bg-red-500/10 text-red-400' : authAction === 'viewLogs' ? 'bg-blue-500/10 text-blue-400' : 'bg-white/5 text-emerald-400'}`}>{authAction === 'delete' ? <Trash2 size={28} /> : authAction === 'viewLogs' ? <Lock size={28} /> : <User size={28} />}</div><h3 className="text-2xl font-bold text-white mb-2">{authAction === 'delete' ? 'Confirm Delete' : authAction === 'viewLogs' ? 'Security' : 'Identify'}</h3><p className="text-sm text-white/50">{authAction === 'viewLogs' ? 'Enter Passcode' : 'Please identify yourself'}</p></div>
        <input type={authAction === 'viewLogs' ? 'password' : 'text'} className="w-full bg-black/30 border border-white/10 rounded-2xl p-4 text-center text-xl font-bold mb-8 outline-none focus:border-emerald-500/50 text-white transition-all shadow-inner" placeholder={authAction === 'viewLogs' ? '••••' : 'Your Name'} value={bookerName} onChange={(e) => setBookerName(e.target.value)} autoFocus />
        <div className="flex gap-3"><button onClick={() => { setShowAuthModal(false); setBookerName(''); }} className="flex-1 py-4 text-white/50 hover:bg-white/5 font-bold text-sm rounded-2xl transition-colors">Cancel</button><button onClick={handleAuthSubmit} className={`flex-1 py-4 text-white rounded-2xl font-bold text-sm shadow-xl active:scale-95 ${authAction === 'delete' ? 'bg-red-500' : 'bg-emerald-500 text-black'}`}>Confirm</button></div>
      </div>
    </div>
  );

  const ChevronRight = ({className}) => <svg className={className} width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>;

  return (
    <div className="bg-black h-screen w-full overflow-hidden relative text-white" style={{fontFamily: "-apple-system, BlinkMacSystemFont, 'Sukhumvit Set', 'Thonburi', sans-serif"}}>
      <style>{`.no-scrollbar::-webkit-scrollbar { display: none; }.no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }.mask-gradient-y { -webkit-mask-image: linear-gradient(to bottom, transparent, black 15%, black 85%, transparent); mask-image: linear-gradient(to bottom, transparent, black 15%, black 85%, transparent); }`}</style>
      <div className="max-w-md mx-auto h-full bg-gray-950 shadow-2xl relative flex flex-col">
        {view === 'dashboard' && renderDashboard()}
        {view === 'booking' && renderBookingView()}
        {view === 'menu' && (
            <div className="fixed inset-0 z-[80] flex items-end justify-center"><div className="absolute inset-0" onClick={() => setView('dashboard')}><img src={selectedRoom?.image} className="w-full h-full object-cover" alt="bg" /><div className="absolute inset-0 bg-emerald-950/70 backdrop-blur-md" /></div>
            <div className="relative z-20 w-full p-6 animate-in slide-in-from-bottom-20 duration-500"><div className="bg-gray-900/40 backdrop-blur-3xl rounded-[2.5rem] p-8 border border-white/10 shadow-2xl ring-1 ring-white/5 relative overflow-hidden"><div className="absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-white/20 to-transparent"></div>
                <div className="flex justify-between items-center mb-8"><div className="pr-4 shrink-0"><h2 className="text-3xl font-bold text-white tracking-tight leading-tight">{selectedRoom.name}</h2><p className="text-emerald-200/60 font-medium text-sm flex items-center gap-1.5 mt-1"><MapPin size={14}/> {selectedRoom.thName}</p></div><button onClick={() => setView('dashboard')} className="p-2.5 bg-white/10 rounded-full border border-white/5 active:scale-90 shadow-sm"><XCircle size={26}/></button></div>
                <button onClick={() => initBookingForm(false)} className="w-full p-5 bg-gradient-to-b from-white to-gray-100 text-emerald-950 rounded-3xl flex items-center justify-between shadow-2xl active:scale-95 group"><div className="flex items-center gap-5"><div className="p-3 bg-emerald-100 rounded-2xl shadow-inner group-hover:scale-105 transition-transform"><Plus size={26} /></div><div className="text-left"><span className="block font-black text-xl tracking-tight text-emerald-950">Book This Room</span><span className="text-xs text-emerald-800 font-bold opacity-70 uppercase tracking-widest">Reserve a new slot</span></div></div><ArrowRight size={24} className="text-emerald-500" /></button>
                <div className="flex items-center gap-2 mt-8 mb-2 px-1"><Calendar size={18} className="text-emerald-400" /><span className="text-[10px] font-black text-emerald-200 uppercase tracking-widest opacity-80">Full Schedule</span></div>
                <div className="max-h-[30dvh] overflow-y-auto no-scrollbar space-y-3 pb-2">{bookings.filter(b => b.roomId === selectedRoom.id && b.end > new Date().getTime()).sort((a,b) => a.start - b.start).map(b => {
                    const now = new Date().getTime(); const isBusy = now >= b.start && now <= b.end; const isSoon = !isBusy && (b.start > now && b.start - now <= 10 * 60000);
                    return <div key={b.id} className={`p-5 rounded-3xl border transition-all ${isBusy ? 'bg-rose-500/20 border-rose-500/30 shadow-lg' : isSoon ? 'bg-amber-500/20 border-amber-500/30 shadow-lg' : 'bg-black/20 border-white/5'}`}><div className="flex justify-between items-start"><div className="flex-1 min-w-0 pr-4"><div className={`text-xs font-black mb-1.5 flex items-center gap-2 ${isBusy ? 'text-rose-300' : isSoon ? 'text-amber-300' : 'text-emerald-300'}`}>{formatTime(b.start)} - {formatTime(b.end)}{(isBusy || isSoon) && <div className={`w-1.5 h-1.5 rounded-full animate-pulse ${isBusy ? 'bg-rose-400' : 'bg-amber-400'}`} />}</div><div className="text-white font-bold text-lg truncate mb-1">{getDisplayName(b.title)}</div><div className="text-[10px] text-white/40 font-medium uppercase tracking-widest">by {getDisplayName(b.ownerId)}</div></div><button onClick={() => { setPendingBookingData(b); setAuthAction('edit'); setShowAuthModal(true); }} className="p-3 bg-white/10 rounded-2xl text-white/50 active:scale-90 border border-white/5 transition-all shadow-sm"><Edit2 size={16}/></button></div></div>;
                })}</div>
            </div></div></div>
        )}
        {view === 'logs' && renderLogsView()}
        {view === 'history' && renderHistoryView()}
        {showMainMenu && renderMainMenuOverlay()}
        {showAuthModal && renderAuthModal()}
        {notification && renderNotification()}
        {pickerMode === 'duration' ? <GlassDurationPicker value={duration} onChange={handleDurationChange} onClose={() => setPickerMode(null)} /> : pickerMode && <GlassTimePicker value={pickerMode === 'start' ? startTime : endTime} onChange={handleTimeChange} onClose={() => setPickerMode(null)} title={pickerMode === 'start' ? 'Start Time' : 'End Time'} blockedCheck={pickerMode === 'start' ? (t) => isTimeBlocked(t, bookingDate, selectedRoom.id, bookings, editingBookingId, isBookingStarted) : null} minTime={pickerMode === 'start' && !isBookingStarted && bookingDate === getLocalDateStr() ? getCurrentTimeStr() : (pickerMode === 'end' ? startTime : null)} />}
      </div>
    </div>
  );
}
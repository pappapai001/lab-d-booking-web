import React, { useState, useEffect } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, onAuthStateChanged } from 'firebase/auth';
import { 
  getFirestore, 
  collection, 
  addDoc, 
  deleteDoc, 
  onSnapshot, 
  query, 
  doc,
  orderBy 
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
  AlignLeft // Added Icon for Description
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

const firebaseConfig = typeof __firebase_config !== 'undefined' ? JSON.parse(__firebase_config) : manualConfig;
const rawAppId = typeof __app_id !== 'undefined' ? __app_id : 'lab-d-meeting-app';
const appId = rawAppId.replace(/\//g, '_').replace(/\./g, '-');

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
    name: 'Grand Conference', 
    thName: 'ห้องประชุมใหญ่',
    capacity: '20', 
    image: 'https://images.unsplash.com/photo-1497366811353-6870744d04b2?auto=format&fit=crop&w=800&q=80',
    color: 'bg-emerald-600', 
    icon: '🏢' 
  },
  { 
    id: 'small', 
    name: 'Focus Studio', 
    thName: 'ห้องประชุมเล็ก',
    capacity: '6', 
    image: 'https://images.unsplash.com/photo-1497215728101-856f4ea42174?auto=format&fit=crop&w=800&q=80',
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

const getStatus = (roomId, bookings) => {
  const now = new Date().getTime();
  const safeBookings = Array.isArray(bookings) ? bookings : [];
  
  const currentBooking = safeBookings.find(b => 
    b.roomId === roomId && 
    b.start <= now && 
    b.end > now
  );
  
  if (currentBooking) return { status: 'busy', text: 'BUSY', color: 'bg-rose-500/90 text-white', detail: `Occupied until ${formatTime(currentBooking.end)}` };
  
  const nextBooking = safeBookings
    .filter(b => b.roomId === roomId && b.start > now)
    .sort((a, b) => a.start - b.start)[0];

  if (nextBooking) {
      const isToday = new Date(nextBooking.start).getDate() === new Date().getDate();
      const timeStr = formatTime(nextBooking.start);
      return { status: 'free', text: 'AVAILABLE', color: 'bg-emerald-500/90 text-white', detail: `Free until ${isToday ? timeStr : formatDateShort(nextBooking.start)}` };
  }
  
  return { status: 'free', text: 'AVAILABLE', color: 'bg-emerald-500/90 text-white', detail: 'Available' };
};

// --- Components ---

const Header = ({ title, onBack }) => (
  <div className="flex items-center justify-between px-6 pt-12 pb-4 z-20">
    <div className="flex items-center gap-3">
      {onBack ? (
        <button onClick={onBack} className="p-2.5 rounded-full bg-emerald-900/40 backdrop-blur-xl border border-emerald-500/20 shadow-sm text-emerald-100 hover:bg-emerald-800/50 hover:border-emerald-400/50 hover:shadow-[0_0_15px_rgba(52,211,153,0.3)] transition-all active:scale-90">
          <ChevronLeft size={22} />
        </button>
      ) : (
        <div className="p-2.5 rounded-full bg-emerald-950/80 backdrop-blur-xl text-emerald-400 shadow-lg border border-emerald-500/20">
           <LayoutGrid size={22} />
        </div>
      )}
      <span className="text-xl font-bold tracking-tight drop-shadow-md text-emerald-50">{title}</span>
    </div>
    <div className="w-10 h-10 rounded-full bg-emerald-900/20 border-2 border-emerald-500/20 shadow-sm overflow-hidden backdrop-blur-sm">
      <img src={`https://api.dicebear.com/7.x/notionists/svg?seed=Admin`} alt="User" className="w-full h-full object-cover" />
    </div>
  </div>
);

const RoomCardBento = ({ room, bookings, onSelect }) => {
  const { status, text, color, detail } = getStatus(room.id, bookings);
  const isBusy = status === 'busy';
  const safeBookings = Array.isArray(bookings) ? bookings : [];
  
  const upcomingBookings = safeBookings
    .filter(b => b.roomId === room.id && b.end > new Date().getTime())
    .sort((a, b) => a.start - b.start)
    .slice(0, 10); 

  return (
    <div 
      onClick={() => onSelect(room)}
      className="relative group flex-1 rounded-[2.5rem] overflow-hidden cursor-pointer active:scale-[0.98] transition-all duration-500 shadow-sm hover:shadow-[0_20px_50px_rgba(0,0,0,0.5)] ring-1 ring-emerald-900/20 hover:ring-emerald-400/30"
    >
      <div className="absolute inset-0">
          <img src={room.image} alt={room.name} className="w-full h-full object-cover transition-transform duration-1000 group-hover:scale-110" />
          <div className="absolute inset-0 bg-gradient-to-t from-emerald-950/90 via-emerald-900/40 to-emerald-900/10 mix-blend-multiply" />
          <div className="absolute inset-0 bg-black/20" /> 
      </div>

      <div className="absolute inset-0 bg-emerald-500/0 active:bg-emerald-500/20 transition-colors duration-200 pointer-events-none" />

      <div className="relative h-full flex flex-col justify-between p-6">
          <div className="flex justify-between items-start">
              <div className={`px-4 py-2 rounded-full backdrop-blur-2xl bg-black/20 border border-white/10 flex items-center gap-2 shadow-lg`}>
                  <span className="relative flex h-2 w-2">
                    <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${isBusy ? 'bg-rose-400' : 'bg-emerald-400'}`}></span>
                    <span className={`relative inline-flex rounded-full h-2 w-2 ${isBusy ? 'bg-rose-500' : 'bg-emerald-500'}`}></span>
                  </span>
                  <span className="text-[10px] font-bold tracking-widest uppercase text-white drop-shadow-md">{text}</span>
              </div>
          </div>

          <div className="space-y-4">
              <div className="px-2">
                  <h2 className="text-3xl font-bold text-white tracking-tight drop-shadow-xl">{room.name}</h2>
                  <div className="flex items-center gap-3 text-emerald-100/90 text-sm font-medium mt-1">
                      <span>{room.thName}</span>
                      <span className="w-1 h-1 bg-emerald-400/60 rounded-full"></span>
                      <span className="flex items-center gap-1"><Users size={12} /> {room.capacity}</span>
                  </div>
              </div>

              <div className="bg-emerald-950/30 backdrop-blur-xl border border-white/10 rounded-[1.5rem] p-3 shadow-[0_8px_32px_0_rgba(0,0,0,0.3)] ring-1 ring-white/5 group-active:border-emerald-400/30 transition-colors">
                  <div className="flex items-center justify-between mb-3 px-1">
                       <span className="text-[10px] text-emerald-100/70 uppercase tracking-wider font-bold">Upcoming Queue</span>
                       <span className="text-[10px] font-medium text-emerald-200 bg-emerald-900/40 px-2 py-0.5 rounded-full backdrop-blur-sm border border-emerald-500/20">
                          {upcomingBookings.length} Slots
                       </span>
                  </div>
                  
                  <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar snap-x">
                      {upcomingBookings.length === 0 ? (
                          <div className="w-full py-2 text-center text-xs text-emerald-200/50 italic font-medium">
                              No upcoming bookings
                          </div>
                      ) : (
                          upcomingBookings.map((b, i) => {
                              const isCurrent = new Date().getTime() >= b.start && new Date().getTime() <= b.end;
                              return (
                                  <div key={i} className={`snap-start flex-shrink-0 min-w-[100px] p-2.5 rounded-2xl border backdrop-blur-md flex flex-col justify-center transition-all
                                      ${isCurrent 
                                          ? 'bg-gradient-to-br from-emerald-500/30 to-emerald-900/10 border-emerald-400/50 shadow-[0_0_15px_rgba(52,211,153,0.2)]' 
                                          : 'bg-emerald-900/20 border-white/5 hover:bg-emerald-800/30'
                                      }`}
                                  >
                                      <div className="flex items-center gap-1.5 mb-1">
                                          <div className={`w-1.5 h-1.5 rounded-full ${isCurrent ? 'bg-emerald-400' : 'bg-emerald-200/40'}`} />
                                          <span className="text-[10px] font-bold text-emerald-50 tracking-tight">
                                              {formatTime(b.start)} - {formatTime(b.end)}
                                          </span>
                                      </div>
                                      <div className="text-[10px] text-emerald-50 font-semibold truncate w-full pl-3 mb-0.5">
                                          {String(b.ownerId || '')}
                                      </div>
                                      <div className="text-[9px] text-emerald-400/70 truncate w-full pl-3 mb-0.5">
                                          {String(b.owner || '')}
                                      </div>
                                      <div className="text-[9px] text-emerald-200/40 font-semibold pl-3 uppercase tracking-wide">
                                          {formatDateShort(b.start)}
                                      </div>
                                  </div>
                              );
                          })
                      )}
                      <div className="snap-start flex-shrink-0 w-8 flex items-center justify-center rounded-xl bg-emerald-900/20 border border-white/10 text-emerald-200/40">
                          <Plus size={14} />
                      </div>
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
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  
  // Form States
  const [editingBookingId, setEditingBookingId] = useState(null);
  const [bookingDate, setBookingDate] = useState(new Date().toISOString().slice(0, 10));
  const [startTime, setStartTime] = useState('09:00');
  const [endTime, setEndTime] = useState('10:00');
  const [bookingTitle, setBookingTitle] = useState('');
  const [department, setDepartment] = useState(''); 
  const [bookerName, setBookerName] = useState('');
  const [description, setDescription] = useState(''); // NEW: Description State
  
  // UI States
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [authAction, setAuthAction] = useState('create');
  const [pendingBookingData, setPendingBookingData] = useState(null);
  const [notification, setNotification] = useState(null);

  // --- Initialize Deep Linking Logic ---
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
        await signInAnonymously(auth);
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
          description: String(data.description || '')
        };
      });
      setBookings(loadedBookings);
      setLoading(false);
    }, (error) => {
      console.error("Data fetch error:", error);
      setLoading(false);
    });

    return () => unsubscribeData();
  }, [user]);

  // --- Handlers ---
  const handleRoomSelect = (room) => { setSelectedRoom(room); setView('menu'); };

  const initBookingForm = (isEdit = false, booking = null) => {
    if (isEdit && booking) {
      setEditingBookingId(booking.id);
      const startObj = new Date(booking.start);
      const endObj = new Date(booking.end);
      setBookingDate(startObj.toISOString().slice(0, 10));
      setStartTime(startObj.toTimeString().slice(0, 5));
      setEndTime(endObj.toTimeString().slice(0, 5));
      setBookingTitle(booking.title);
      setDepartment(booking.owner || '');
      setBookerName(booking.ownerId || ''); 
      setDescription(booking.description || ''); // Load Description
      setAuthAction('edit');
    } else {
      setEditingBookingId(null);
      setBookingDate(new Date().toISOString().slice(0, 10));
      setStartTime('09:00');
      setEndTime('10:00');
      setBookingTitle('');
      setDepartment('');
      setBookerName('');
      setDescription(''); // Clear Description
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
    
    // VALIDATION: Prevent Past Bookings
    const now = new Date().getTime();
    if (startTs < now) {
        return showNotif('error', 'ไม่สามารถจองเวลาย้อนหลังได้');
    }
    
    // Validate Overlap
    const isOverlap = bookings.some(b => {
      if (editingBookingId && b.id === editingBookingId) return false;
      if (b.roomId !== selectedRoom.id) return false;
      return (startTs < b.end && endTs > b.start);
    });

    if (isOverlap) return showNotif('error', 'ช่วงเวลานี้มีการจองแล้ว');

    const bookingData = {
      roomId: selectedRoom.id,
      title: bookingTitle || 'Meeting',
      start: startTs,
      end: endTs,
      owner: department,
      ownerId: bookerName,
      description: description // Save Description
    };

    try {
      if (editingBookingId) {
        await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'bookings', editingBookingId));
        await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'bookings'), bookingData);
        showNotif('success', 'แก้ไขเรียบร้อย');
      } else {
        await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'bookings'), bookingData);
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
      await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'bookings', id));
      showNotif('success', 'ยกเลิกการจองแล้ว');
      resetAndClose();
    } catch (e) {
      showNotif('error', 'ลบข้อมูลล้มเหลว');
    }
  };

  const handleAuthSubmit = () => {
    if (!bookerName.trim()) return showNotif('error', 'กรุณาระบุชื่อผู้จอง');

    if (authAction === 'create') {
        handleSaveBooking();
    } else if (authAction === 'edit' || authAction === 'delete') {
        if (pendingBookingData.ownerId === bookerName || bookerName.toLowerCase() === 'admin') {
            if (authAction === 'edit') {
                setShowAuthModal(false);
                initBookingForm(true, pendingBookingData);
            } else {
                handleDeleteBooking(pendingBookingData.id);
            }
        } else {
            showNotif('error', 'คุณไม่ใช่เจ้าของการจองนี้ (ชื่อไม่ตรงกัน)');
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
    setView('dashboard');
  };

  const showNotif = (type, message) => {
    setNotification({ type, message });
    setTimeout(() => setNotification(null), 3000);
  };

  // --- Sub-View Render Helpers ---

  const renderDashboard = () => (
    <div className="h-full flex flex-col bg-gray-950 text-white">
      <Header title="Lab-D Meeting Room" />
      <div className="flex-1 px-5 pb-5 flex flex-col gap-4 overflow-hidden">
        <div className="flex items-center justify-between px-2 py-1">
             <div className="text-sm font-medium text-emerald-200/60">
                {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
             </div>
             <div className="flex items-center gap-1 text-xs font-bold text-emerald-400 uppercase tracking-widest drop-shadow-[0_0_8px_rgba(52,211,153,0.5)]">
                 <Zap size={12} fill="currentColor" /> {loading ? 'Connecting...' : 'Live Status'}
             </div>
        </div>
        {loading ? (
          <div className="flex-1 flex items-center justify-center text-emerald-500/50">
            <Loader2 className="animate-spin" size={32} />
          </div>
        ) : (
          ROOMS.map(room => (
              <RoomCardBento key={room.id} room={room} bookings={bookings} onSelect={handleRoomSelect} />
          ))
        )}
      </div>
    </div>
  );

  const renderRoomMenu = () => (
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      <div className="absolute inset-0 z-0">
          <img src={selectedRoom?.image} className="w-full h-full object-cover" alt="Room Background" />
          <div className="absolute inset-0 bg-emerald-950/60 backdrop-blur-md" />
      </div>
      <div className="absolute inset-0 z-10" onClick={() => setView('dashboard')} />
      
      <div className="relative z-20 w-full p-6 animate-in slide-in-from-bottom-20 duration-500">
        <div className="bg-emerald-900/20 backdrop-blur-3xl rounded-[2.5rem] p-8 shadow-[0_8px_32px_0_rgba(0,0,0,0.5)] border border-white/10 ring-1 ring-white/5">
            <div className="flex justify-between items-center mb-8">
                <div className="text-white">
                    <h2 className="text-3xl font-bold tracking-tight drop-shadow-lg">{selectedRoom.name}</h2>
                    <p className="text-emerald-200/60 font-medium flex items-center gap-1 mt-1 drop-shadow-sm">
                        <MapPin size={14}/> {selectedRoom.thName}
                    </p>
                </div>
                <button onClick={() => setView('dashboard')} className="p-2.5 bg-white/5 hover:bg-white/10 backdrop-blur-md rounded-full transition-all border border-white/5 hover:border-emerald-400/40 hover:shadow-[0_0_15px_rgba(52,211,153,0.2)] active:scale-90 group">
                    <XCircle size={24} className="text-emerald-100/60 group-hover:text-emerald-50" />
                </button>
            </div>
            
            <div className="space-y-4">
                <button 
                    onClick={() => setView('schedule')} 
                    className="w-full p-5 bg-black/20 hover:bg-black/40 backdrop-blur-lg rounded-2xl flex items-center justify-between shadow-lg active:scale-[0.98] active:bg-emerald-900/30 active:border-emerald-400/50 transition-all border border-white/10 group"
                >
                    <div className="flex items-center gap-4">
                        <div className="p-3 bg-white/5 text-emerald-100 rounded-xl shadow-inner border border-white/5 group-active:text-emerald-400 group-active:border-emerald-400/30">
                            <Calendar size={24}/>
                        </div>
                        <div className="text-left">
                            <span className="block font-bold text-white text-lg tracking-wide group-active:text-emerald-300">Weekly Schedule</span>
                            <span className="text-xs text-white/40 font-medium group-active:text-emerald-400/60">View calendar</span>
                        </div>
                    </div>
                    <ArrowRight size={20} className="text-white/30 group-hover:text-white transition-colors group-active:text-emerald-400"/>
                </button>
                
                <button 
                    onClick={() => initBookingForm(false)} 
                    className="w-full p-5 bg-emerald-50 text-emerald-950 rounded-2xl flex items-center justify-between shadow-[0_0_20px_rgba(255,255,255,0.1)] active:scale-[0.98] active:bg-emerald-400 active:shadow-[0_0_30px_rgba(52,211,153,0.4)] transition-all border border-white/20 group hover:shadow-[0_0_30px_rgba(52,211,153,0.2)]"
                >
                    <div className="flex items-center gap-4">
                        <div className="p-3 bg-emerald-200/50 rounded-xl group-active:bg-white/20 group-active:text-white">
                            <Plus size={24} className="text-emerald-900 group-active:text-white"/>
                        </div>
                        <div className="text-left">
                            <span className="block font-bold text-lg group-active:text-white">Book This Room</span>
                            <span className="text-xs text-emerald-800 font-medium group-active:text-white/80">Reserve a slot</span>
                        </div>
                    </div>
                    <ArrowRight size={20} className="text-emerald-700/50 group-hover:text-emerald-900 transition-colors group-active:text-white"/>
                </button>
            </div>
        </div>
      </div>
    </div>
  );

  const renderBookingView = () => (
    <div className="h-full relative flex flex-col">
       <div className="absolute inset-0 z-0">
         <img src={selectedRoom?.image} className="w-full h-full object-cover" />
         <div className="absolute inset-0 bg-emerald-950/80 backdrop-blur-xl" /> 
       </div>
      <Header title={editingBookingId ? 'Edit Booking' : 'New Booking'} onBack={() => setView(editingBookingId ? 'schedule' : 'menu')} />
      <div className="p-6 flex-1 flex flex-col gap-6 relative z-10 overflow-y-auto">
        <div className="bg-emerald-900/20 backdrop-blur-xl p-6 rounded-[2rem] shadow-[0_8px_32px_0_rgba(0,0,0,0.3)] border border-white/10 ring-1 ring-white/5 space-y-6">
           <div>
               <label className="text-xs font-bold text-emerald-400 uppercase tracking-widest mb-3 block drop-shadow-sm">Meeting Title</label>
               <input 
                 type="text" 
                 placeholder="e.g. Project Kickoff" 
                 className="w-full text-xl font-bold bg-black/20 border border-white/10 py-4 px-4 rounded-2xl focus:outline-none focus:bg-black/40 focus:border-emerald-400/50 focus:ring-1 focus:ring-emerald-400/50 transition-all placeholder:text-white/20 text-white" 
                 value={bookingTitle} 
                 onChange={(e) => setBookingTitle(e.target.value)} 
                 autoFocus={!editingBookingId} 
               />
           </div>
           <div>
               <label className="text-xs font-bold text-emerald-400 uppercase tracking-widest mb-3 block drop-shadow-sm">Department</label>
               <input 
                 type="text" 
                 placeholder="e.g. Marketing, HR" 
                 className="w-full text-xl font-bold bg-black/20 border border-white/10 py-4 px-4 rounded-2xl focus:outline-none focus:bg-black/40 focus:border-emerald-400/50 focus:ring-1 focus:ring-emerald-400/50 transition-all placeholder:text-white/20 text-white" 
                 value={department} 
                 onChange={(e) => setDepartment(e.target.value)} 
               />
           </div>
           <div>
               <label className="text-xs font-bold text-emerald-400 uppercase tracking-widest mb-3 block drop-shadow-sm flex items-center gap-2"><AlignLeft size={14} /> Description (Optional)</label>
               <textarea 
                 rows="3"
                 placeholder="Agenda or details..." 
                 className="w-full text-lg font-medium bg-black/20 border border-white/10 py-4 px-4 rounded-2xl focus:outline-none focus:bg-black/40 focus:border-emerald-400/50 focus:ring-1 focus:ring-emerald-400/50 transition-all placeholder:text-white/20 text-white resize-none" 
                 value={description} 
                 onChange={(e) => setDescription(e.target.value)} 
               />
           </div>
        </div>
        <div className="bg-emerald-900/20 backdrop-blur-xl p-6 rounded-[2rem] shadow-[0_8px_32px_0_rgba(0,0,0,0.3)] border border-white/10 ring-1 ring-white/5 space-y-6">
            <div>
                 <label className="text-xs text-emerald-400 font-bold mb-3 block uppercase tracking-widest drop-shadow-sm">Date</label>
                 <input 
                    type="date" 
                    className="w-full bg-black/20 border border-white/10 p-4 rounded-2xl font-semibold text-white outline-none focus:bg-black/40 focus:border-emerald-400/50 focus:ring-1 focus:ring-emerald-400/50 transition-all [color-scheme:dark]" 
                    value={bookingDate} 
                    onChange={(e) => setBookingDate(e.target.value)} 
                />
            </div>
            <div className="flex gap-4 items-center">
                <div className="flex-1">
                    <label className="text-xs text-emerald-400 font-bold mb-3 block uppercase tracking-widest drop-shadow-sm">Start</label>
                    <input type="time" className="w-full bg-black/20 border border-white/10 p-4 rounded-2xl font-bold text-center text-lg outline-none focus:bg-black/40 focus:border-emerald-400/50 focus:ring-1 focus:ring-emerald-400/50 transition-all text-white [color-scheme:dark]" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
                </div>
                <ArrowRight size={20} className="text-white/20 mt-6"/>
                <div className="flex-1">
                    <label className="text-xs text-emerald-400 font-bold mb-3 block uppercase tracking-widest drop-shadow-sm">End</label>
                    <input type="time" className="w-full bg-black/20 border border-white/10 p-4 rounded-2xl font-bold text-center text-lg outline-none focus:bg-black/40 focus:border-emerald-400/50 focus:ring-1 focus:ring-emerald-400/50 transition-all text-white [color-scheme:dark]" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
                </div>
            </div>
        </div>
        <button onClick={() => { if(editingBookingId) handleSaveBooking(); else { setAuthAction('create'); setShowAuthModal(true); }}} className="mt-auto w-full bg-emerald-50 text-emerald-950 font-bold py-5 rounded-2xl shadow-[0_0_30px_rgba(255,255,255,0.1)] active:scale-[0.98] transition-all border border-white/20 hover:bg-emerald-100 active:bg-emerald-400 active:text-white active:shadow-[0_0_30px_rgba(52,211,153,0.5)]">
          {editingBookingId ? 'Save Changes' : 'Confirm Booking'}
        </button>
      </div>
    </div>
  );

  const renderScheduleView = () => {
    const weekDays = Array.from({length:5}, (_, i) => {
        const d = new Date();
        d.setDate(d.getDate() - d.getDay() + 1 + i);
        return d;
    });

    return (
      <div className="h-full relative flex flex-col">
        <div className="absolute inset-0 z-0">
            <img src={selectedRoom?.image} className="w-full h-full object-cover" />
            <div className="absolute inset-0 bg-emerald-950/80 backdrop-blur-xl" /> 
        </div>
        <Header title="Schedule" onBack={() => setView('menu')} />
        <div className="flex-1 overflow-y-auto px-6 pb-6 space-y-6 relative z-10">
            {weekDays.map((day, idx) => {
                const dayBookings = bookings.filter(b => {
                    const d = new Date(b.start);
                    return b.roomId === selectedRoom.id && d.getDate() === day.getDate() && d.getMonth() === day.getMonth();
                }).sort((a,b) => a.start - b.start);
                const isToday = day.getDate() === new Date().getDate();

                return (
                    <div key={idx} className="animate-in slide-in-from-bottom-4 duration-500" style={{animationDelay: `${idx * 50}ms`}}>
                        <h3 className={`font-bold mb-3 text-lg ${isToday ? 'text-emerald-400 drop-shadow-[0_0_10px_rgba(52,211,153,0.5)]' : 'text-white/40'}`}>{day.toLocaleDateString('en-US', { weekday: 'long', day: 'numeric' })}</h3>
                        {dayBookings.length === 0 ? (
                            <div className="p-4 rounded-2xl border border-dashed border-white/10 bg-white/5 backdrop-blur-sm text-white/30 text-sm text-center font-medium">No bookings</div>
                        ) : (
                            <div className="space-y-3">
                                {dayBookings.map(b => (
                                    <div key={b.id} onClick={() => { setPendingBookingData(b); setAuthAction('edit'); setShowAuthModal(true); }} className="bg-white/5 hover:bg-white/10 backdrop-blur-md p-4 rounded-2xl shadow-sm border border-white/10 flex justify-between items-center active:scale-[0.98] transition-all cursor-pointer group active:bg-emerald-900/40 active:border-emerald-400/50">
                                        <div>
                                            <div className="font-bold text-white text-lg group-active:text-emerald-300">{b.title}</div>
                                            <div className="text-xs text-emerald-200/60 font-semibold mt-1 flex items-center gap-1 group-active:text-emerald-400/60">
                                                <Clock size={12}/> {formatTime(b.start)} - {formatTime(b.end)} 
                                                <span className="mx-1">•</span> 
                                                <Users size={12}/> {b.ownerId} <span className="text-white/40 font-normal">({b.owner})</span>
                                            </div>
                                            {b.description && (
                                                <div className="text-xs text-white/50 mt-2 pl-2 border-l-2 border-emerald-500/30 font-light italic">
                                                    "{b.description}"
                                                </div>
                                            )}
                                        </div>
                                        <div className="w-8 h-8 rounded-full bg-white/5 flex items-center justify-center text-white/40 group-hover:text-emerald-400 transition-colors group-active:text-emerald-400 group-active:bg-emerald-400/20">
                                             <Edit2 size={14} />
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                );
            })}
        </div>
      </div>
    );
  };

  const renderAuthModal = () => (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-md z-[60] flex items-center justify-center p-6">
      <div className="bg-emerald-950/40 backdrop-blur-2xl w-full max-w-xs rounded-[2.5rem] p-8 shadow-[0_0_50px_rgba(0,0,0,0.5)] animate-in zoom-in duration-300 border border-white/10 ring-1 ring-white/10">
        <div className="text-center mb-8">
            <div className="w-14 h-14 mx-auto bg-white/5 rounded-full flex items-center justify-center mb-4 text-emerald-400 shadow-[0_0_20px_rgba(52,211,153,0.2)]">
                <User size={24} /> 
            </div>
            <h3 className="text-2xl font-bold text-white tracking-tight">Booking Confirmation</h3>
            <p className="text-sm text-emerald-200/50 font-medium">ลงชื่อผู้ทำการจอง</p>
        </div>
        <input 
            type="text" 
            className="w-full bg-white/5 border border-white/10 rounded-2xl p-4 text-center text-xl font-bold mb-8 outline-none focus:bg-white/10 focus:border-emerald-400/50 focus:ring-1 focus:ring-emerald-400/50 text-white transition-all placeholder:text-white/10 placeholder:font-normal" 
            placeholder="Your Name"
            value={bookerName} 
            onChange={(e) => setBookerName(e.target.value)} 
            autoFocus 
        />
        <div className="flex gap-3">
            {authAction === 'edit' && (
                <button onClick={() => { setAuthAction('delete'); handleAuthSubmit(); }} className="flex-1 py-4 bg-red-500/10 hover:bg-red-500/20 text-red-400 rounded-2xl font-bold text-sm backdrop-blur-sm transition-colors border border-red-500/20 active:scale-95">
                    Delete
                </button>
            )}
            <button onClick={() => setShowAuthModal(false)} className="flex-1 py-4 text-white/50 hover:bg-white/5 font-bold text-sm rounded-2xl transition-colors active:scale-95">
                Cancel
            </button>
            <button onClick={handleAuthSubmit} className="flex-1 py-4 bg-emerald-500 hover:bg-emerald-400 text-black rounded-2xl font-bold text-sm shadow-[0_0_20px_rgba(52,211,153,0.4)] backdrop-blur-md transition-all active:scale-95">
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
    <div className="bg-gray-950 h-screen w-full font-sans overflow-hidden relative text-white selection:bg-emerald-500/30 selection:text-emerald-200">
      <style>{`
        .no-scrollbar::-webkit-scrollbar { display: none; }
        .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
      `}</style>
      <div className="max-w-md mx-auto h-full bg-black shadow-2xl relative flex flex-col">
        {view === 'dashboard' && renderDashboard()}
        {view === 'booking' && renderBookingView()}
        {view === 'schedule' && renderScheduleView()}
        {view === 'menu' && renderRoomMenu()}
        {showAuthModal && renderAuthModal()}
        {notification && renderNotification()}
      </div>
    </div>
  );
}
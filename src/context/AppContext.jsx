import React, { createContext, useState, useEffect, useContext, useRef } from 'react';
import { WifiOff } from 'lucide-react';
import { api } from '../utils/api';
import { createSocket } from '../utils/socket';
import { flushQueue } from '../utils/offlineQueue';
import { translations } from '../utils/translations';

const AppContext = createContext();

export function AppProvider({ children }) {
  const [token, setToken] = useState(() => {
    try { return localStorage.getItem('halo_token') || null; } catch (_) { return null; }
  });
  const [user, setUser] = useState(() => {
    try { return JSON.parse(localStorage.getItem('halo_user') || 'null'); } catch (_) { return null; }
  });
  const [loading, setLoading] = useState(true);
  const [language, setLanguage] = useState('en'); // 'en' or 'hi'
  const wasOfflineRef = useRef(false);
  const [isOffline, setIsOffline] = useState(typeof navigator !== 'undefined' ? !navigator.onLine : false);
  
  // Real-time synced state with localStorage fallbacks for instant reloading
  const [patients, setPatients] = useState(() => {
    try {
      const saved = localStorage.getItem('halo_patients');
      return saved ? JSON.parse(saved) : [];
    } catch (_) { return []; }
  });
  const [beds, setBeds] = useState(() => {
    try {
      const saved = localStorage.getItem('halo_beds');
      return saved ? JSON.parse(saved) : [];
    } catch (_) { return []; }
  });
  const [ambulanceRequests, setAmbulanceRequests] = useState(() => {
    try {
      const saved = localStorage.getItem('halo_ambulance_requests');
      return saved ? JSON.parse(saved) : [];
    } catch (_) { return []; }
  });
  const [bloodBank, setBloodBank] = useState(() => {
    try {
      const saved = localStorage.getItem('halo_blood_bank');
      return saved ? JSON.parse(saved) : [];
    } catch (_) { return []; }
  });
  const [inventory, setInventory] = useState(() => {
    try {
      const saved = localStorage.getItem('halo_inventory');
      return saved ? JSON.parse(saved) : [];
    } catch (_) { return []; }
  });
  const [surgeries, setSurgeries] = useState(() => {
    try {
      const saved = localStorage.getItem('halo_surgeries');
      return saved ? JSON.parse(saved) : [];
    } catch (_) { return []; }
  });
  const [doctorNotifications, setDoctorNotifications] = useState([]);
  const [patientEpisode, setPatientEpisode] = useState(null);
  const [patientProfile, setPatientProfile] = useState(null);
  const [departments, setDepartments] = useState([]);
  const [patientDocuments, setPatientDocuments] = useState([]);
  const [ambulanceVehicles, setAmbulanceVehicles] = useState(() => {
    try {
      const saved = localStorage.getItem('halo_ambulance_vehicles');
      return saved ? JSON.parse(saved) : [];
    } catch (_) { return []; }
  });
  const [doctors, setDoctors] = useState(() => {
    try {
      const saved = localStorage.getItem('halo_doctors');
      return saved ? JSON.parse(saved) : [];
    } catch (_) { return []; }
  });
  const [donorsList, setDonorsList] = useState(() => {
    try {
      const saved = localStorage.getItem('halo_donors_list');
      return saved ? JSON.parse(saved) : [];
    } catch (_) { return []; }
  });
  
  // Toast Notification System (Strictly capped at maximum 3 visible toasts everywhere)
  const [toasts, setToasts] = useState([]);
  const lastToastTimeRef = useRef({});

  const removeToast = (id) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  };

  const addToast = (message, type = 'info') => {
    if (!message) return;
    const now = Date.now();

    // Deduplicate identical message triggers within 1.5 seconds
    if (lastToastTimeRef.current[message] && (now - lastToastTimeRef.current[message] < 1500)) {
      return;
    }
    lastToastTimeRef.current[message] = now;

    const id = now + Math.random();
    setToasts(prev => {
      // Remove any previous toast with exact same message
      const filtered = prev.filter(t => t.message !== message);
      const updated = [...filtered, { id, message, type }];
      return updated.slice(-3); // Strictly enforce maximum 3 toasts
    });

    setTimeout(() => {
      removeToast(id);
    }, 2500); // 2.5s auto-dismiss
  };

  // Translation helper
  const t = (key) => {
    return translations[language][key] || key;
  };

  // Load user based on active pathname or saved credentials.
  // The Admin web app is intentionally open — /admin paths get an automatic
  // session with no login. Doctor/Patient PWAs restore their real JWT session,
  // or silently refresh it via the httpOnly cookie after long gaps in usage.
  useEffect(() => {
    let cancelled = false;

    async function bootSession() {
      const path = window.location.pathname;

      // Remember which PWA this device uses so an installed app that wakes up
      // on "/" (iOS ignores manifest start_url) can be sent to its own portal.
      if (path.startsWith('/doctor')) localStorage.setItem('halo_last_role', 'DOCTOR');
      else if (path.startsWith('/patient')) localStorage.setItem('halo_last_role', 'PATIENT');

      if (path.startsWith('/admin')) {
        const adminUser = { id: 'admin', role: 'ADMIN', name: 'Sarah Jenkins (Admin)' };
        const adminToken = 'mock-admin-token';
        setToken(adminToken);
        setUser(adminUser);
        try {
          localStorage.setItem('halo_token', adminToken);
          localStorage.setItem('halo_user', JSON.stringify(adminUser));
        } catch (_) {}
        setLoading(false);
        return;
      }

      try {
        const savedToken = localStorage.getItem('halo_token');
        const savedUser = localStorage.getItem('halo_user');
        if (savedToken && savedUser) {
          setToken(savedToken);
          setUser(JSON.parse(savedUser));
        } else {
          const session = await api.refreshSession();
          if (!cancelled && session && session.token) {
            setToken(session.token);
            setUser(session.user);
            try {
              localStorage.setItem('halo_token', session.token);
              localStorage.setItem('halo_user', JSON.stringify(session.user));
            } catch (_) {}
          } else if (!cancelled) {
            setToken(null);
            setUser(null);
          }
        }
      } catch (_) {
        if (!cancelled) {
          setToken(null);
          setUser(null);
        }
      }
      if (!cancelled) setLoading(false);
    }

    bootSession();
    return () => { cancelled = true; };
  }, []);

  // Track online/offline state and replay queued mutations on reconnect
  useEffect(() => {
    const goOnline = async () => {
      setIsOffline(false);
      try {
        const flushed = await flushQueue((endpoint, options) =>
          api.post(endpoint, options.body)
        );
        if (flushed > 0) addToast(`${flushed} offline change(s) synced successfully`, 'success');
      } catch (_) {}
    };
    const goOffline = () => setIsOffline(true);

    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    if (!navigator.onLine) goOffline();
    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
    };
  }, []);

  const login = async (role, credentials) => {
    setLoading(true);
    try {
      if (role === 'ADMIN') {
        // Admin web app is open — no authentication required
        const adminUser = { id: 'admin', role: 'ADMIN', name: 'Sarah Jenkins (Admin)' };
        const adminToken = 'mock-admin-token';
        setToken(adminToken);
        setUser(adminUser);
        try {
          localStorage.setItem('halo_token', adminToken);
          localStorage.setItem('halo_user', JSON.stringify(adminUser));
        } catch (_) {}
        addToast('Signed in as Admin', 'success');
        setLoading(false);
        return adminUser;
      }

      // Doctor/Patient authenticate through the backend API
      const res = await api.post('/auth/login', {
        role,
        phone: credentials.phone,
        id: credentials.id
      });

      // Remember this device's PWA role (used by the standalone boot redirect)
      if (role === 'DOCTOR' || role === 'PATIENT') {
        try { localStorage.setItem('halo_last_role', role); } catch (_) {}
      }

      setToken(res.token);
      setUser(res.user);

      try {
        localStorage.setItem('halo_token', res.token);
        localStorage.setItem('halo_user', JSON.stringify(res.user));
      } catch (_) {}

      addToast(`Signed in successfully`, 'success');
      setLoading(false);
      return res.user;
    } catch (err) {
      setLoading(false);
      addToast(err.response?.data?.message || err.message || 'Login failed', 'error');
      throw err;
    }
  };

  const logout = async () => {
    setToken(null);
    setUser(null);
    setPatientEpisode(null);
    setPatientProfile(null);
    setDoctorNotifications([]);

    try {
      localStorage.removeItem('halo_token');
      localStorage.removeItem('halo_user');
    } catch (_) {}

    // Clear the httpOnly refresh cookie server-side (best effort)
    try { await api.post('/auth/logout'); } catch (_) {}
  };

  const exitApp = () => {
    const isStandalone = (typeof window !== 'undefined') && (
      window.navigator.standalone || 
      window.matchMedia('(display-mode: standalone)').matches
    );

    if (isStandalone) {
      window.close();
      setTimeout(() => {
        window.location.href = 'about:blank';
      }, 300);
    } else {
      window.location.href = '/';
    }
  };

  // Load hospital departments list once on mount
  useEffect(() => {
    async function loadDepartments() {
      try {
        const depts = await api.get('/departments');
        setDepartments(depts);
      } catch (err) {
        console.error('Failed to load departments:', err);
      }
    }
    loadDepartments();
  }, []);

  // Poll server state with background awareness and smart state diffing
  useEffect(() => {
    if (!token || !user) return;

    const fetchData = async () => {
      // Don't poll if the browser tab/app is backgrounded or hidden
      if (typeof document !== 'undefined' && document.hidden) return;

      try {
        const dcs = await api.get('/doctors');
        setDoctors(prev => (JSON.stringify(prev) !== JSON.stringify(dcs) ? dcs : prev));
        try { localStorage.setItem('halo_doctors', JSON.stringify(dcs)); } catch (_) {}

        if (user.role === 'ADMIN') {
          const [pts, bd, amb, bb, inv, surg, veh, dnr] = await Promise.all([
            api.get('/patients'),
            api.get('/beds'),
            api.get('/ambulance'),
            api.get('/bloodbank'),
            api.get('/inventory'),
            api.get('/surgeries'),
            api.get('/ambulance/vehicles'),
            api.get('/bloodbank/donors-list')
          ]);
          setPatients(prev => (JSON.stringify(prev) !== JSON.stringify(pts) ? pts : prev));
          setBeds(prev => (JSON.stringify(prev) !== JSON.stringify(bd) ? bd : prev));
          setAmbulanceRequests(prev => (JSON.stringify(prev) !== JSON.stringify(amb) ? amb : prev));
          setBloodBank(prev => (JSON.stringify(prev) !== JSON.stringify(bb) ? bb : prev));
          setInventory(prev => (JSON.stringify(prev) !== JSON.stringify(inv) ? inv : prev));
          setSurgeries(prev => (JSON.stringify(prev) !== JSON.stringify(surg) ? surg : prev));
          setAmbulanceVehicles(prev => (JSON.stringify(prev) !== JSON.stringify(veh) ? veh : prev));
          setDonorsList(prev => (JSON.stringify(prev) !== JSON.stringify(dnr) ? dnr : prev));

          try {
            localStorage.setItem('halo_patients', JSON.stringify(pts));
            localStorage.setItem('halo_beds', JSON.stringify(bd));
            localStorage.setItem('halo_ambulance_requests', JSON.stringify(amb));
            localStorage.setItem('halo_blood_bank', JSON.stringify(bb));
            localStorage.setItem('halo_inventory', JSON.stringify(inv));
            localStorage.setItem('halo_surgeries', JSON.stringify(surg));
            localStorage.setItem('halo_ambulance_vehicles', JSON.stringify(veh));
            localStorage.setItem('halo_donors_list', JSON.stringify(dnr));
          } catch (_) {}
        } else if (user.role === 'DOCTOR') {
          const [notes, surg, amb, pts] = await Promise.all([
            api.get(`/notifications/${user.id}`),
            api.get('/surgeries'),
            api.get('/ambulance'),
            api.get('/patients')
          ]);
          
          // Check if there are new unread notifications to alert the doctor
          const newUnread = notes.filter(n => n.status === 'UNREAD');
          if (newUnread.length > doctorNotifications.filter(n => n.status === 'UNREAD').length) {
            const latest = newUnread[0];
            addToast(`[ALERT] ${latest.title}: ${latest.message}`, 'error');
          }

          setDoctorNotifications(prev => (JSON.stringify(prev) !== JSON.stringify(notes) ? notes : prev));
          setSurgeries(prev => (JSON.stringify(prev) !== JSON.stringify(surg) ? surg : prev));
          setAmbulanceRequests(prev => (JSON.stringify(prev) !== JSON.stringify(amb) ? amb : prev));
          setPatients(prev => (JSON.stringify(prev) !== JSON.stringify(pts) ? pts : prev));
        } else if (user.role === 'PATIENT' && user.patientId) {
          const [eps, profile, docs] = await Promise.all([
            api.get(`/episodes?patientId=${user.patientId}`),
            api.get(`/patients/${user.patientId}`),
            api.get(`/patients/${user.patientId}/documents`)
          ]);
          setPatientProfile(prev => (JSON.stringify(prev) !== JSON.stringify(profile) ? profile : prev));
          setPatientDocuments(prev => (JSON.stringify(prev) !== JSON.stringify(docs || []) ? (docs || []) : prev));
          const active = eps.find(e => e.status === 'ACTIVE');
          
          // If patient was outpatient but is now assigned a bed, show toast!
          if (active && patientEpisode) {
            if (active.bedAssignment?.bedId && !patientEpisode.bedAssignment?.bedId) {
              addToast(`Hospital Bed Assigned: ${active.bedAssignment.bedId}. Proceed to ward.`, 'success');
            }
            if (active.requiresAttention && !patientEpisode.requiresAttention) {
              addToast(`Consultant requesting immediate contact. 'Call Doctor' active.`, 'info');
            }
          }

          const targetEp = active || eps[eps.length - 1] || null;
          setPatientEpisode(prev => (JSON.stringify(prev) !== JSON.stringify(targetEp) ? targetEp : prev));
        }

        // Connection successful. If we were offline, alert of restoration.
        if (wasOfflineRef.current) {
          wasOfflineRef.current = false;
          addToast('Connection restored successfully!', 'success');
        }
      } catch (err) {
        console.error('Polling sync error:', err.message);
        if (!wasOfflineRef.current) {
          wasOfflineRef.current = true;
          addToast('Connection lost. Please check your internet connection.', 'error');
        }
      }
    };

    // Initial fetch
    fetchData();

    // Adaptive 8-second polling interval (fallback — real-time sync arrives via socket)
    const interval = setInterval(fetchData, 8000);
    return () => clearInterval(interval);
  }, [token, user, patientEpisode?.episodeId]);

  // Force refresh — fetches all role-relevant data immediately
  const refreshData = async () => {
    if (!token || !user) return;
    try {
      if (user.role === 'ADMIN') {
        setBeds(await api.get('/beds'));
        setPatients(await api.get('/patients'));
        setAmbulanceRequests(await api.get('/ambulance'));
        setInventory(await api.get('/inventory'));
        setAmbulanceVehicles(await api.get('/ambulance/vehicles'));
        setDoctors(await api.get('/doctors'));
        setBloodBank(await api.get('/bloodbank'));
        setSurgeries(await api.get('/surgeries'));
        setDonorsList(await api.get('/bloodbank/donors-list'));
      } else if (user.role === 'DOCTOR') {
        setDoctorNotifications(await api.get(`/notifications/${user.id}`));
        setDoctors(await api.get('/doctors'));
      } else if (user.role === 'PATIENT' && user.patientId) {
        const [eps, docs, dcs] = await Promise.all([
          api.get(`/episodes?patientId=${user.patientId}`),
          api.get(`/patients/${user.patientId}/documents`),
          api.get('/doctors')
        ]);
        setPatientEpisode(eps.find(e => e.status === 'ACTIVE') || eps[eps.length - 1] || null);
        setPatientDocuments(docs || []);
        setDoctors(dcs || []);
      }
    } catch (_) {}
  };

  // Real-time sync: server broadcasts 'sync' after every successful mutation
  // (from any device, any role) -> debounced instant refetch. Polling stays as fallback.
  const syncDebounceRef = useRef(null);
  useEffect(() => {
    if (!token) return;
    const socket = createSocket(token);
    socket.on('sync', () => {
      clearTimeout(syncDebounceRef.current);
      syncDebounceRef.current = setTimeout(() => refreshDataRef.current?.(), 50);
    });
    return () => {
      clearTimeout(syncDebounceRef.current);
      socket.disconnect();
    };
  }, [token]);

  // Stable ref so the socket handler always calls the latest refreshData
  const refreshDataRef = useRef(refreshData);
  refreshDataRef.current = refreshData;

  return (
    <AppContext.Provider value={{
      user,
      token,
      loading,
      language,
      setLanguage,
      t,
      login,
      logout,
      exitApp,
      addToast,
      toasts,
      wasOfflineRef,
      
      // Synced states & setters for optimistic instant UI updates
      patients,
      setPatients,
      beds,
      setBeds,
      ambulanceRequests,
      setAmbulanceRequests,
      bloodBank,
      setBloodBank,
      inventory,
      setInventory,
      surgeries,
      setSurgeries,
      doctorNotifications,
      setDoctorNotifications,
      patientEpisode,
      setPatientEpisode,
      patientProfile,
      setPatientProfile,
      departments,
      patientDocuments,
      ambulanceVehicles,
      setAmbulanceVehicles,
      doctors,
      setDoctors,
      donorsList,
      setDonorsList,
      
      // Force refresh trigger helper
      refreshData
    }}>
      {children}

      {/* Offline Banner — shown when the device has no connectivity */}
      {isOffline && (
        <div className="fixed top-0 left-0 right-0 z-[100] flex items-center justify-center gap-2 bg-[#0a0a0c] text-white/90 text-[11px] font-semibold uppercase tracking-wider py-1.5 px-4 border-b border-white/10">
          <WifiOff size={12} className="shrink-0" />
          <span>Offline — showing cached data</span>
        </div>
      )}

      {/* Toast Alert Render Container (Strict max 3 visible toasts) */}
      <div className="fixed bottom-6 right-6 z-[9999] flex flex-col gap-2.5 max-w-sm pointer-events-none">
        {toasts.slice(-3).map(toast => (
          <div
            key={toast.id}
            className={`p-3.5 px-4 rounded-xl shadow-lg border text-xs font-semibold tracking-tight pointer-events-auto flex items-center justify-between gap-3 transition-all duration-200 ${
              toast.type === 'success' 
                ? 'bg-[#edf7f2] border-[#22c55e]/40 text-[#166534]' 
                : toast.type === 'error'
                ? 'bg-[#fef2f2] border-[#ef4444]/40 text-[#991b1b]'
                : toast.type === 'warning'
                ? 'bg-[#fffbe0] border-[#eab308]/40 text-[#854d0e]'
                : 'bg-white border-[#e5e5e5] text-[#1c1c1c]'
            }`}
          >
            <div className="flex items-center gap-2.5 min-w-0">
              {toast.type === 'error' && <span className="w-2 h-2 rounded-full bg-[#ef4444] shrink-0" />}
              {toast.type === 'success' && <span className="w-2 h-2 rounded-full bg-[#22c55e] shrink-0" />}
              {toast.type === 'warning' && <span className="w-2 h-2 rounded-full bg-[#eab308] shrink-0" />}
              {toast.type === 'info' && <span className="w-2 h-2 rounded-full bg-[#0066cc] shrink-0" />}
              <span className="truncate">{toast.message}</span>
            </div>
            <button
              onClick={() => removeToast(toast.id)}
              className="text-xs opacity-50 hover:opacity-100 shrink-0 cursor-pointer p-0.5 ml-1 border-none bg-transparent"
              title="Dismiss"
            >
              ✕
            </button>
          </div>
        ))}
      </div>
    </AppContext.Provider>
  );
}

export function useApp() {
  return useContext(AppContext);
}

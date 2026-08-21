import React, { createContext, useState, useEffect, useContext, useRef } from 'react';
import { api } from '../utils/api';
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
  
  // Toast Notification System
  const [toasts, setToasts] = useState([]);

  const addToast = (message, type = 'info') => {
    const id = Date.now();
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 4000);
  };

  // Translation helper
  const t = (key) => {
    return translations[language][key] || key;
  };

  // Load user based on active pathname or saved credentials
  useEffect(() => {
    const path = window.location.pathname;
    if (path.startsWith('/admin')) {
      // Admin bypass
      const adminUser = { id: 'admin', role: 'ADMIN', name: 'Sarah Jenkins (Admin)' };
      const adminToken = 'mock-admin-token';
      setUser(adminUser);
      setToken(adminToken);
      try {
        localStorage.setItem('halo_token', adminToken);
        localStorage.setItem('halo_user', JSON.stringify(adminUser));
      } catch (_) {}
    } else {
      // Load saved token/user for Doctor and Patient PWA on boot
      try {
        const savedToken = localStorage.getItem('halo_token');
        const savedUser = localStorage.getItem('halo_user');
        if (savedToken && savedUser) {
          setToken(savedToken);
          setUser(JSON.parse(savedUser));
        } else {
          setToken(null);
          setUser(null);
        }
      } catch (_) {
        setToken(null);
        setUser(null);
      }
    }
    setLoading(false);
  }, [window.location.pathname]);

  const login = async (role, credentials) => {
    setLoading(true);
    try {
      if (role === 'ADMIN') {
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
      } else {
        // Authenticate with backend API
        const res = await api.post('/auth/login', {
          role,
          phone: credentials.phone,
          id: credentials.id
        });
        
        setToken(res.token);
        setUser(res.user);
        
        try {
          localStorage.setItem('halo_token', res.token);
          localStorage.setItem('halo_user', JSON.stringify(res.user));
        } catch (_) {}
        
        addToast(`Signed in successfully`, 'success');
        setLoading(false);
        return res.user;
      }
    } catch (err) {
      setLoading(false);
      addToast(err.response?.data?.message || err.message || 'Login failed', 'error');
      throw err;
    }
  };

  const logout = () => {
    setToken(null);
    setUser(null);
    setPatientEpisode(null);
    setPatientProfile(null);
    setDoctorNotifications([]);
    
    try {
      localStorage.removeItem('halo_token');
      localStorage.removeItem('halo_user');
    } catch (_) {}
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

    // Adaptive 8-second polling interval (prevents network congestion when multiple devices are active)
    const interval = setInterval(fetchData, 8000);
    return () => clearInterval(interval);
  }, [token, user, patientEpisode?.episodeId]);

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
      
      // Synced states
      patients,
      beds,
      ambulanceRequests,
      bloodBank,
      inventory,
      surgeries,
      doctorNotifications,
      patientEpisode,
      patientProfile,
      departments,
      patientDocuments,
      ambulanceVehicles,
      doctors,
      donorsList,
      
      // Force refresh trigger helper
      refreshData: async () => {
        // manually trigger a sync
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
      }
    }}>
      {children}
      
      {/* Toast Alert Render Container */}
      <div className="fixed bottom-6 right-6 z-50 flex flex-col gap-3 max-w-sm pointer-events-none">
        {toasts.map(toast => (
          <div
            key={toast.id}
            className={`p-4 rounded-xl shadow-xl border text-xs font-semibold tracking-tight pointer-events-auto flex items-center gap-3 transition-all duration-300 transform translate-y-0 opacity-100 ${
              toast.type === 'success' 
                ? 'bg-[#edf7f2] border-[#22c55e] text-[#166534]' 
                : toast.type === 'error'
                ? 'bg-[#fef2f2] border-[#ef4444] text-[#991b1b]'
                : 'bg-white border-[#e5e5e5] text-[#1c1c1c]'
            }`}
          >
            {toast.type === 'error' && <span className="w-2.5 h-2.5 rounded-full bg-[#ef4444] shrink-0" />}
            {toast.type === 'success' && <span className="w-2.5 h-2.5 rounded-full bg-[#22c55e] shrink-0" />}
            <span>{toast.message}</span>
          </div>
        ))}
      </div>
    </AppContext.Provider>
  );
}

export function useApp() {
  return useContext(AppContext);
}

import React, { useState, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { api, getFileUrl } from '../utils/api';
import QRScanner from '../components/QRScanner';
import PrescriptionDigitizer from '../components/PrescriptionDigitizer';
import ServerConfigModal from '../components/ServerConfigModal';
import { 
  Stethoscope, Calendar, Inbox, Search, LogOut, Sparkles, 
  AlertCircle, ShieldAlert, PhoneCall, PlusCircle, CheckCircle, FileText,
  Smartphone, Download, Users, Server
} from 'lucide-react';

export default function DoctorDashboard() {
  const { 
    user, login, logout, exitApp, t, doctorNotifications, surgeries, 
    ambulanceRequests, addToast, refreshData, patients, doctors
  } = useApp();

  const [activeTab, setActiveTabState] = useState(() => {
    return localStorage.getItem('halo_doctor_active_tab') || 'schedule';
  });
  const setActiveTab = (tab) => {
    setActiveTabState(tab);
    localStorage.setItem('halo_doctor_active_tab', tab);
  };

  // Local state for credentials login form
  const [loginForm, setLoginForm] = useState({ phone: '', id: '' });
  const [loggingIn, setLoggingIn] = useState(false);

  const handleLoginSubmit = async (e) => {
    e.preventDefault();
    if (!loginForm.phone || !loginForm.id) return;
    setLoggingIn(true);
    try {
      const phoneFormatted = loginForm.phone.startsWith('+') ? loginForm.phone : `+91${loginForm.phone.trim()}`;
      await login('DOCTOR', { ...loginForm, phone: phoneFormatted });
    } catch (_) {
      // Error is already toasted by AppContext
    } finally {
      setLoggingIn(false);
    }
  };

  // Native PWA Installation & Standalone State
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [isStandalone, setIsStandalone] = useState(false);
  const [devBypass, setDevBypass] = useState(false);

  useEffect(() => {
    const standaloneMode = 
      window.matchMedia('(display-mode: standalone)').matches || 
      window.navigator.standalone === true ||
      document.referrer.includes('android-app://');
    
    setIsStandalone(standaloneMode);

    const handleBeforeInstall = (e) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstall);
    return () => window.removeEventListener('beforeinstallprompt', handleBeforeInstall);
  }, []);

  const handleInstallApp = async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === 'accepted') {
        addToast('Installing Doctor PWA natively...', 'success');
      }
      setDeferredPrompt(null);
    } else {
      addToast(
        "To install natively on iOS: Tap Safari Share button (⬆️), then tap 'Add to Home Screen' (➕). On Android: Tap Chrome menu (⋮) -> 'Install App'.",
        "info"
      );
    }
  };

  // Local storage session tracker for active/scanned patients
  const [activePatientIds, setActivePatientIds] = useState(() => {
    try {
      const saved = localStorage.getItem('halo_doctor_active_patients');
      return saved ? JSON.parse(saved) : [];
    } catch (_) {
      return [];
    }
  });

  useEffect(() => {
    localStorage.setItem('halo_doctor_active_patients', JSON.stringify(activePatientIds));
  }, [activePatientIds]);

  const handleRemoveActivePatient = (patientId, e) => {
    e.stopPropagation();
    setActivePatientIds(prev => prev.filter(id => id !== patientId));
    addToast('Patient removed from active dashboard.', 'info');
  };

  const [selectedPatient, setSelectedPatient] = useState(null);
  const [activeEpisode, setActiveEpisode] = useState(null);
  const [showDigitizer, setShowDigitizer] = useState(false);
  const [selectedFile, setSelectedFile] = useState(null);
  const [downloadingDocId, setDownloadingDocId] = useState(null);
  const [showServerModal, setShowServerModal] = useState(false);

  // New consultation details
  const [consForm, setConsForm] = useState({ notes: '', diagnosis: '' });
  const [addingCons, setAddingCons] = useState(false);

  // Dynamic manifest registration for standalone Doctor PWA mode
  useEffect(() => {
    let link = document.querySelector('link[rel="manifest"]');
    if (!link) {
      link = document.createElement('link');
      link.rel = 'manifest';
      document.head.appendChild(link);
    }
    link.href = '/manifest-doctor.json';

    let appleTitle = document.querySelector('meta[name="apple-mobile-web-app-title"]');
    if (appleTitle) {
      appleTitle.setAttribute('content', 'HALO Doctor');
    }
  }, []);

  // Test request state
  const [testName, setTestName] = useState('');

  // Chat message details
  const [chatMessage, setChatMessage] = useState('');

  const [timelineLogs, setTimelineLogs] = useState([]);
  const [patientDocuments, setPatientDocuments] = useState([]);

  // Manual Prescription Form State
  const [rxForm, setRxForm] = useState({
    medicine: '',
    dosage: '',
    frequency: '1-0-1',
    duration: '5 days',
    instructions: '',
    notes: ''
  });

  // Document Upload Form State
  const [docForm, setDocForm] = useState({ title: '', type: 'LAB_REPORT' });
  const [uploadingDoc, setUploadingDoc] = useState(false);

  // Load patient active episode, documents, and timeline if selected
  useEffect(() => {
    if (!selectedPatient) {
      setActiveEpisode(null);
      setTimelineLogs([]);
      setPatientDocuments([]);
      return;
    }
    async function loadEpisodeAndTimeline() {
      try {
        const eps = await api.get(`/episodes?patientId=${selectedPatient.patientId}`);
        const active = eps.find(e => e.status === 'ACTIVE');
        setActiveEpisode(active || null);

        const logs = await api.get(`/dashboard/audit?patientId=${selectedPatient.patientId}`);
        setTimelineLogs(logs || []);

        const docs = await api.get(`/patients/${selectedPatient.patientId}/documents`);
        setPatientDocuments(docs || []);
      } catch (_) {}
    }
    loadEpisodeAndTimeline();
  }, [selectedPatient, activeTab]);

  const handlePatientFound = async (patient) => {
    if (patient && patient.patientId) {
      if (!activePatientIds.includes(patient.patientId)) {
        setActivePatientIds(prev => [...prev, patient.patientId]);
      }
      setSelectedPatient(patient);
      setActiveTab('patientView');

      // Assign scanning doctor & registered phone number to patient's active treatment episode
      try {
        const eps = await api.get(`/episodes?patientId=${patient.patientId}`);
        const active = eps.find(e => e.status === 'ACTIVE');
        const docId = user?.id || user?._id;
        const currentDoctor = (doctors || []).find(d => d.doctorId === docId) || user;
        const phone = currentDoctor?.phone || user?.phone || '';

        if (active && docId) {
          const updated = await api.put(`/episodes/${active.episodeId}`, {
            doctorId: docId,
            doctorName: currentDoctor?.name || user?.name || '',
            doctorPhone: phone
          });
          setActiveEpisode(updated);
          addToast(`Patient assigned to you`, 'success');
        }
      } catch (err) {
        addToast(err.message || 'Failed to assign this patient to you.', 'error');
      }
    }
  };

  const handleToggleAttention = async (requiresAttention) => {
    let epToUpdate = activeEpisode;

    // Create treatment episode if patient has no active episode yet
    if (!epToUpdate && selectedPatient) {
      try {
        const docId = user?.id || user?._id;
        epToUpdate = await api.post('/episodes', {
          patientId: selectedPatient.patientId,
          doctorId: docId
        });
        setActiveEpisode(epToUpdate);
      } catch (err) {
        addToast(err.message || 'Failed to initialize treatment episode for patient.', 'error');
        return;
      }
    }

    if (!epToUpdate) return;

    try {
      const docId = user?.id || user?._id;
      const currentDoctor = (doctors || []).find(d => d.doctorId === docId) || user;
      const phone = currentDoctor?.phone || user?.phone || '';
      const doctorName = currentDoctor?.name || user?.name || '';

      const updated = await api.put(`/episodes/${epToUpdate.episodeId}`, {
        requiresAttention,
        doctorId: docId,
        doctorName,
        doctorPhone: phone
      });

      setActiveEpisode(updated);
      addToast(
        requiresAttention 
          ? `Attention line active! Direct call enabled for Dr. ${doctorName}.` 
          : "Attention line disabled.",
        requiresAttention ? "success" : "info"
      );
      refreshData();
    } catch (err) {
      addToast(err.message, 'error');
    }
  };

  const handleNotificationStatus = async (notificationId, status) => {
    try {
      await api.put(`/notifications/${notificationId}/status`, { status });
      refreshData();
    } catch (err) {
      addToast(err.message, 'error');
    }
  };

  const handleAddConsultation = async (e) => {
    e.preventDefault();
    if (!consForm.notes || !consForm.diagnosis || !activeEpisode) return;
    setAddingCons(true);
    try {
      const updated = await api.put(`/episodes/${activeEpisode.episodeId}`, {
        consultation: {
          notes: consForm.notes,
          diagnosis: consForm.diagnosis
        }
      });
      setActiveEpisode(updated);
      setConsForm({ notes: '', diagnosis: '' });
      addToast('Clinical assessment and diagnosis logged!', 'success');
      refreshData();
    } catch (err) {
      addToast(err.message, 'error');
    } finally {
      setAddingCons(false);
    }
  };

  const handleAddTest = async (e) => {
    e.preventDefault();
    if (!testName.trim() || !activeEpisode) return;
    try {
      const updated = await api.put(`/episodes/${activeEpisode.episodeId}`, {
        testName: testName.trim()
      });
      setActiveEpisode(updated);
      setTestName('');
      addToast('Lab investigation test request queued.', 'success');
    } catch (err) {
      addToast(err.message, 'error');
    }
  };

  const handleSendChatMessage = async (e) => {
    e.preventDefault();
    if (!chatMessage.trim() || !activeEpisode) return;
    try {
      const updated = await api.put(`/episodes/${activeEpisode.episodeId}`, {
        message: {
          sender: 'DOCTOR',
          text: chatMessage.trim()
        }
      });
      setActiveEpisode(updated);
      setChatMessage('');
      refreshData();
    } catch (err) {
      addToast(err.message, 'error');
    }
  };

  const handleDischargePatient = async () => {
    if (!activeEpisode) return;
    if (!window.confirm("Confirm Patient Discharge? This releases hospital bed and archives episode.")) return;
    try {
      await api.post(`/episodes/${activeEpisode.episodeId}/discharge`, {
        summary: "Discharged in stable condition. Recovered completely. Prescribed follow-up medicines."
      });
      addToast("Patient successfully discharged. Episode completed.", "success");
      
      const eps = await api.get(`/episodes?patientId=${selectedPatient.patientId}`);
      setActiveEpisode(eps.find(e => e.status === 'ACTIVE') || null);
      refreshData();
    } catch (err) {
      addToast(err.message, 'error');
    }
  };
  const activeAmbulances = ambulanceRequests.filter(a => a.status !== 'Completed');
  const visiblePatients = (patients || []).filter(pt => activePatientIds.includes(pt.patientId));

  // Enforce native app execution
  if (!isStandalone && !devBypass) {
    return (
      <div className="pwa-container min-h-screen bg-canvas-parchment flex flex-col justify-center items-center p-6 font-sans">
        <div className="w-full max-w-sm bg-canvas border border-hairline p-8 flex flex-col apple-product-shadow text-center space-y-5" style={{ borderRadius: '24px' }}>
          <div className="w-14 h-14 bg-primary/10 rounded-full flex items-center justify-center text-primary mx-auto">
            <Smartphone size={28} />
          </div>
          <h2 className="text-xl font-bold text-ink">Native App Required</h2>
          <p className="text-xs text-ink-muted-48 leading-relaxed">
            This clinical application is restricted to native standalone execution to ensure secure, sandboxed camera and device API access. It cannot be run inside standard browser tabs.
          </p>
          
          <div className="bg-canvas-parchment border border-hairline p-4 rounded-2xl text-left text-xs text-ink-muted-85 space-y-3">
            <strong className="block text-ink text-xs font-semibold">📲 Installation Instructions:</strong>
            <div>
              <span className="font-bold text-ink">On Android (Chrome)</span>: Tap the browser menu (⋮) and select <span className="text-primary font-bold">"Install App"</span>.
            </div>
            <div>
              <span className="font-bold text-ink">On iOS (Safari)</span>: Tap the Share icon (⬆️) and select <span className="text-primary font-bold">"Add to Home Screen"</span>.
            </div>
          </div>

          <div className="pt-2 text-[10px] text-ink-muted-48">
            Once installed, launch the app from your home screen.
          </div>

          {/* Dev / Test Bypass Link */}
          <button 
            onClick={() => setDevBypass(true)}
            className="text-[10px] text-primary hover:underline cursor-pointer pt-2"
          >
            Continue in Browser (Dev / Testing Mode)
          </button>
          
          <button
            type="button"
            onClick={() => setShowServerModal(true)}
            className="text-[10px] text-ink-muted-48 hover:text-ink flex items-center justify-center gap-1 cursor-pointer pt-1"
          >
            <Server size={11} /> Server Host Settings
          </button>
        </div>
      </div>
    );
  }

  if (!user || user.role !== 'DOCTOR') {
    return (
      <div className="pwa-container min-h-screen bg-canvas-parchment flex flex-col justify-center items-center p-6 font-sans">
        <div className="w-full max-w-sm bg-canvas border border-hairline p-8 flex flex-col apple-product-shadow" style={{ borderRadius: '24px' }}>
          <div className="flex flex-col items-center text-center space-y-2 mb-6">
            <div className="w-14 h-14 bg-primary/10 rounded-full flex items-center justify-center text-primary">
              <Stethoscope size={28} />
            </div>
            <h2 className="text-xl font-bold text-ink">Clinical Access Portal</h2>
            <p className="text-xs text-ink-muted-48">Sign in with your registered mobile number & unique Doctor ID.</p>
          </div>

          <form onSubmit={handleLoginSubmit} className="space-y-4">
            <div className="space-y-1">
              <label className="text-[10px] text-ink-muted-48 uppercase font-bold tracking-widest block">Registered Mobile</label>
              <div className="flex items-center bg-canvas-parchment border border-hairline focus-within:border-hairline-strong transition-all overflow-hidden" style={{ borderRadius: '30px' }}>
                <div className="bg-canvas-card border-r border-hairline px-3.5 py-3 text-xs text-ink-muted-48 font-bold flex items-center shrink-0">
                  +91
                </div>
                <input 
                  type="tel" 
                  placeholder="9999988888" 
                  value={loginForm.phone}
                  onChange={e => setLoginForm(prev => ({ ...prev, phone: e.target.value }))}
                  className="w-full px-3 py-3 text-xs bg-transparent focus:outline-none transition-all shadow-none border-none"
                  required
                />
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-[10px] text-ink-muted-48 uppercase font-bold tracking-widest block">Unique Doctor ID</label>
              <input 
                type="text" 
                placeholder="HALO-DOC-XX-XXXX" 
                value={loginForm.id}
                onChange={e => setLoginForm(prev => ({ ...prev, id: e.target.value }))}
                className="w-full px-4 py-3 text-xs bg-canvas-parchment border border-hairline focus:border-hairline-strong rounded-full focus:outline-none transition-all shadow-none font-mono uppercase"
                style={{ borderRadius: '30px' }}
                required
              />
            </div>

            <button
              type="submit"
              disabled={loggingIn}
              className="w-full bg-primary hover:bg-primary-focus text-canvas text-xs font-semibold py-3.5 rounded-full uppercase tracking-wider transition-colors cursor-pointer disabled:opacity-50 mt-2 shadow-none"
              style={{ borderRadius: '30px' }}
            >
              {loggingIn ? 'Authenticating...' : 'Secure Sign In'}
            </button>
          </form>
          
          <div className="text-center mt-6">
            <button
              type="button"
              onClick={() => setShowServerModal(true)}
              className="text-[10px] text-primary hover:underline inline-flex items-center gap-1 cursor-pointer mb-2 font-medium"
            >
              <Server size={12} /> Configure Server Host IP
            </button>
            <span className="text-[9px] text-ink-muted-48 uppercase tracking-wider block font-sans">SECURE BIOMETRIC • CLINICAL GATEWAY</span>
          </div>
        </div>
        <ServerConfigModal 
          isOpen={showServerModal} 
          onClose={() => setShowServerModal(false)} 
          addToast={addToast} 
        />
      </div>
    );
  }

  return (
    <div className="pwa-container min-h-screen bg-canvas-parchment flex flex-col justify-between relative shadow-none font-sans">
      
      {/* Top Mobile Header (frosted sub-nav style with iOS safe area top inset) */}
      <header className="bg-canvas border-b border-hairline shrink-0 flex justify-between items-center px-4 frosted-glass sticky top-0 z-20 pwa-header">
        <div className="flex items-center gap-2">
          <Stethoscope className="text-primary" size={18} />
          <span className="font-sans text-ink text-sm font-semibold tracking-tight uppercase">Dr. Feed • HALO</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setShowServerModal(true)}
            className="p-1.5 rounded-full text-ink-muted-48 hover:text-primary hover:bg-canvas-parchment cursor-pointer transition-colors"
            title="Configure Server Host"
          >
            <Server size={15} />
          </button>
          <span className="text-[11px] bg-canvas-parchment border border-hairline text-ink px-2.5 py-1 rounded-full truncate max-w-[80px] font-semibold">
            {user?.name}
          </span>
          <button 
            onClick={logout} 
            className="text-[10px] uppercase font-bold text-ink hover:text-primary transition-colors cursor-pointer border border-hairline hover:border-primary px-2.5 py-1 rounded-full"
            title="Logout of credentials"
          >
            Logout
          </button>
          <button 
            onClick={exitApp} 
            className="text-[10px] uppercase font-bold text-white bg-[#cf2d56] hover:bg-[#b02244] transition-colors cursor-pointer px-2.5 py-1 rounded-full"
            title="Exit standalone application"
          >
            Exit
          </button>
        </div>
      </header>

      {/* Main Core View Area */}
      <main className="flex-grow overflow-y-auto p-4 pb-20">

        {/* Native PWA Installation Banner (Hidden if already running as standalone native app) */}
        {!isStandalone && (
          <div className="bg-primary/10 border border-primary/20 p-3.5 rounded-[16px] mb-4 flex items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-2.5 text-ink">
              <Smartphone size={20} className="text-primary shrink-0" />
              <div>
                <strong className="block font-semibold text-ink">Install Doctor Native App</strong>
                <span className="text-[10px] text-ink-muted-48">Run standalone on phone without browser bars</span>
              </div>
            </div>
            <button
              onClick={handleInstallApp}
              className="bg-primary text-canvas font-bold px-3.5 py-1.5 rounded-full uppercase tracking-wider text-[10px] cursor-pointer hover:bg-primary-focus shrink-0 shadow-sm flex items-center gap-1.5"
            >
              <Download size={12} /> Install
            </button>
          </div>
        )}
        
        {/* ==================== 1. CLINICAL SCHEDULE TAB ==================== */}
        {activeTab === 'schedule' && (
          <div className="space-y-6">
            <div>
              <h1 className="text-2xl font-semibold text-ink leading-tight tracking-tight">Today's Schedule</h1>
              <p className="text-xs text-ink-muted-48 uppercase mt-1">Coordination Feed & Rounds</p>
            </div>

            {/* Assigned Patients Section — Top 3 recent only */}
            <div className="space-y-3">
              <h3 className="text-[10px] text-ink-muted-48 tracking-widest uppercase mb-1 font-bold">Active Patient Boards</h3>
              {visiblePatients.length === 0 ? (
                <div className="text-xs italic text-ink-muted-48 p-5 bg-canvas border border-hairline rounded-[18px] text-center">
                  <p>No active patients assigned.</p>
                </div>
              ) : (
                <div className="space-y-2.5">
                  <div className="grid grid-cols-1 gap-2.5">
                    {visiblePatients.slice(0, 3).map(pt => (
                      <div
                        key={pt.patientId}
                        onClick={() => handlePatientFound(pt)}
                        className="w-full bg-canvas border border-hairline hover:border-primary rounded-[18px] p-4 transition-all flex items-center justify-between group cursor-pointer"
                      >
                        <div>
                          <div className="text-sm font-semibold text-ink group-hover:text-primary transition-colors">{pt.name}</div>
                          <div className="text-[11px] text-ink-muted-48 mt-1">
                            ID: <span className="font-mono">{pt.patientId}</span> • Gender: {pt.gender} • Age: {pt.age}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] bg-primary/10 text-primary border border-primary/20 px-2.5 py-1.5 rounded-full font-semibold">
                            Open File
                          </span>
                          <button
                            onClick={(e) => handleRemoveActivePatient(pt.patientId, e)}
                            className="text-[10px] bg-red-50 hover:bg-red-100 text-[#cf2d56] border border-red-200/50 px-2.5 py-1.5 rounded-full font-semibold cursor-pointer transition-colors"
                          >
                            Remove
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                  {visiblePatients.length > 3 && (
                    <button
                      onClick={() => setActiveTab('patients')}
                      className="w-full text-center text-[11px] text-primary font-semibold py-2.5 bg-primary/5 border border-primary/15 rounded-full hover:bg-primary/10 transition-colors cursor-pointer"
                    >
                      View All {visiblePatients.length} Patients →
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* Expected ambulance alerts */}
            {activeAmbulances.length > 0 && (
              <div className="bg-red-50/40 border border-red-200 rounded-lg p-4 space-y-3" style={{ borderRadius: '18px' }}>
                <h3 className="text-xs font-semibold text-[#cf2d56] uppercase flex items-center gap-1.5">
                  <AlertCircle size={14} /> Emergency Ambulance Dispatches
                </h3>
                <div className="space-y-2">
                  {activeAmbulances.map(a => (
                    <div key={a.requestId} className="bg-canvas border border-hairline rounded-[11px] p-3 text-xs">
                      <div className="font-semibold text-ink">{a.patientName} — {a.condition}</div>
                      <div className="text-[10px] text-ink-muted-48 mt-1">
                        Loc: {a.location} • Status: <strong className="text-[#cf2d56] uppercase">{a.status}</strong>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Schedule Feed — Dynamic events only */}
            <div className="space-y-3">
              <h3 className="text-[10px] text-ink-muted-48 tracking-widest uppercase mb-1 font-bold">Schedule & Events</h3>

              {/* Surgeries — real data from DB */}
              {surgeries.filter(s => s.doctorId === user?.id || s.doctorId === user?._id).map(s => (
                <div 
                  key={s.surgeryId} 
                  className="bg-canvas border border-primary/20 p-4 flex gap-4"
                  style={{ borderRadius: '18px' }}
                >
                  <div className="text-right border-r border-primary/20 pr-3 shrink-0">
                    <div className="text-sm font-semibold text-primary">{s.time.split(' ')[1] || 'OT'}</div>
                    <div className="text-[10px] text-primary uppercase">Surgery</div>
                  </div>
                  <div>
                    <h4 className="text-sm font-semibold text-ink">Scheduled Surgery: {s.patientName}</h4>
                    <p className="text-xs text-ink-muted-48 mt-1 leading-relaxed">{s.procedure} in Operating Room {s.operatingTheatre}.</p>
                  </div>
                </div>
              ))}

              {/* Empty state when no events */}
              {surgeries.filter(s => s.doctorId === user?.id || s.doctorId === user?._id).length === 0 && (
                <div 
                  className="bg-canvas border border-hairline p-6 text-center text-xs text-ink-muted-48"
                  style={{ borderRadius: '18px' }}
                >
                  <Calendar size={20} className="mx-auto mb-2 text-ink-muted-48" />
                  <p>No scheduled events at this time.</p>
                  <p className="text-[10px] mt-1">Events and rounds are managed by hospital administration.</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ==================== 2. SCAN PATIENT PORTAL TAB ==================== */}
        {activeTab === 'scanner' && (
          <div>
            <div className="mb-4">
              <h1 className="text-2xl font-semibold text-ink leading-tight">Verify Patient Identity</h1>
              <p className="text-xs text-ink-muted-48 mt-1">Scan a patient's QR code or search by name/ID to access their clinical file.</p>
            </div>

            <QRScanner onPatientFound={handlePatientFound} />
          </div>
        )}

        {/* ==================== 3. PATIENTS TAB ==================== */}
        {activeTab === 'patients' && (
          <div className="space-y-6">
            <div>
              <h1 className="text-2xl font-semibold text-ink leading-tight tracking-tight">My Patients</h1>
              <p className="text-xs text-ink-muted-48 uppercase mt-1">All patients added to your care list via QR scan</p>
            </div>

            {visiblePatients.length === 0 ? (
              <div 
                className="bg-canvas border border-hairline p-8 text-center text-xs text-ink-muted-48 space-y-3"
                style={{ borderRadius: '18px' }}
              >
                <Users size={24} className="mx-auto mb-2 text-ink-muted-48" />
                <p>No patients added yet.</p>
                <p className="text-[10px]">Scan a patient's QR code to add them to your care list.</p>
                <button 
                  onClick={() => setActiveTab('scanner')}
                  className="text-[10px] bg-primary text-canvas px-4 py-2 rounded-full font-bold uppercase tracking-wider cursor-pointer hover:bg-primary-focus transition-colors mt-2"
                >
                  ➔ Scan QR to Add
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-2.5">
                {visiblePatients.map(pt => (
                  <div
                    key={pt.patientId}
                    onClick={() => handlePatientFound(pt)}
                    className="w-full bg-canvas border border-hairline hover:border-primary rounded-[18px] p-4 transition-all flex items-center justify-between group cursor-pointer"
                  >
                    <div>
                      <div className="text-sm font-semibold text-ink group-hover:text-primary transition-colors">{pt.name}</div>
                      <div className="text-[11px] text-ink-muted-48 mt-1">
                        ID: <span className="font-mono">{pt.patientId}</span> • Gender: {pt.gender} • Age: {pt.age}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] bg-primary/10 text-primary border border-primary/20 px-2.5 py-1.5 rounded-full font-semibold">
                        Open File
                      </span>
                      <button
                        onClick={(e) => handleRemoveActivePatient(pt.patientId, e)}
                        className="text-[10px] bg-red-50 hover:bg-red-100 text-[#cf2d56] border border-red-200/50 px-2.5 py-1.5 rounded-full font-semibold cursor-pointer transition-colors"
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ==================== 4. UPDATES MAILBOX TAB ==================== */}
        {activeTab === 'mailbox' && (
          <div className="space-y-6">
            <div>
              <h1 className="text-2xl font-semibold text-ink leading-tight">Updates Mailbox</h1>
              <p className="text-xs text-ink-muted-48 uppercase mt-1 font-semibold">Unread alerts & operational dispatches</p>
            </div>

            {doctorNotifications.length === 0 ? (
              <div 
                className="bg-canvas border border-hairline p-8 text-center text-xs text-ink-muted-48"
                style={{ borderRadius: '18px' }}
              >
                Clinical mailbox is completely empty.
              </div>
            ) : (
              <div className="space-y-3">
                {doctorNotifications.map(n => (
                  <div 
                    key={n.notificationId} 
                    className={`border p-4 flex flex-col justify-between transition-colors ${
                      n.status === 'UNREAD' ? 'bg-canvas border-primary shadow-sm' : 'bg-canvas-parchment border-hairline text-ink-muted-48'
                    }`}
                    style={{ borderRadius: '18px' }}
                  >
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-[10px] bg-canvas border border-hairline px-2 py-0.5 rounded-full text-ink font-semibold flex items-center gap-1.5">
                        {n.status === 'UNREAD' && <span className="w-1.5 h-1.5 rounded-full bg-primary" />}
                        {n.type}
                      </span>
                      <span className="text-[10px] text-ink-muted-48">
                        {new Date(n.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>

                    <h4 className={`text-sm font-semibold ${n.status === 'UNREAD' ? 'text-ink' : 'text-ink-muted-48'}`}>
                      {n.title}
                    </h4>
                    <p className="text-xs text-ink mt-1.5 leading-relaxed">
                      {n.message}
                    </p>

                    <div className="mt-4 flex gap-2 justify-end text-xs">
                      {n.status === 'UNREAD' && (
                        <button
                          onClick={() => handleNotificationStatus(n.notificationId, 'READ')}
                          className="px-3.5 py-1.5 bg-ink text-canvas rounded-full hover:bg-ink-muted-80 font-semibold cursor-pointer"
                        >
                          Mark Read
                        </button>
                      )}
                      {n.status !== 'ARCHIVED' && (
                        <button
                          onClick={() => handleNotificationStatus(n.notificationId, 'ARCHIVED')}
                          className="px-3.5 py-1.5 border border-hairline rounded-full hover:bg-canvas text-ink cursor-pointer font-semibold"
                        >
                          Archive
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ==================== 4. CLINICAL PATIENT PROFILE VIEW TAB ==================== */}
        {activeTab === 'patientView' && selectedPatient && (
          <div className="space-y-6">
            
            {/* Header profile brief */}
            <div 
              className="bg-canvas border border-hairline p-4 flex justify-between items-start"
              style={{ borderRadius: '18px' }}
            >
              <div>
                <span className="text-[9px] text-ink-muted-48 uppercase tracking-widest font-bold">Authorized File access</span>
                <h2 className="text-lg font-semibold text-ink mt-1">{selectedPatient.name}</h2>
                <div className="text-xs text-ink-muted-48 mt-1">
                  ID: <span className="font-mono">{selectedPatient.patientId}</span> • UID: <span className="font-mono text-primary">{selectedPatient.aadhaarNumber ? selectedPatient.aadhaarNumber.replace(/(\d{4})(\d{4})(\d{4})/, '$1 $2 $3') : 'N/A'}</span> • Age: {selectedPatient.age} ({selectedPatient.gender})
                </div>
              </div>
              <button 
                onClick={() => { setSelectedPatient(null); setActiveTab('scanner'); }}
                className="text-xs border border-hairline hover:border-ink px-3 py-1 rounded-full cursor-pointer bg-canvas-parchment text-ink font-semibold"
              >
                Close File
              </button>
            </div>

            {/* Direct attention line toggler */}
            {selectedPatient && (
              <div 
                className="bg-canvas border border-hairline p-4 flex items-center justify-between"
                style={{ borderRadius: '18px' }}
              >
                <div>
                  <h4 className="text-sm font-semibold text-ink flex items-center gap-1.5">
                    <PhoneCall size={14} className="text-primary" /> Requires Attention Toggle
                  </h4>
                  <p className="text-xs text-ink-muted-48 mt-1 leading-relaxed">Unlocks direct call channel coordinates on the Patient PWA.</p>
                </div>
                <input
                  type="checkbox"
                  checked={Boolean(activeEpisode?.requiresAttention)}
                  onChange={(e) => handleToggleAttention(e.target.checked)}
                  className="w-5 h-5 accent-primary cursor-pointer border-hairline"
                />
              </div>
            )}

            {/* Active Episode Details */}
            {activeEpisode ? (
              <div className="space-y-6">
                
                {/* Ward and Bed position */}
                <div 
                  className="bg-canvas border border-hairline p-4"
                  style={{ borderRadius: '18px' }}
                >
                  <span className="text-xs text-ink-muted-48 uppercase font-semibold">Hospital Bed Position</span>
                  <div className="text-sm font-semibold text-ink mt-1">
                    {activeEpisode.bedAssignment?.bedId 
                      ? `Admitted: Location ${activeEpisode.bedAssignment.bedId} (Active)`
                      : 'Outpatient Status (No bed assigned)'}
                  </div>
                </div>

                {/* Consultation & Diagnoses History */}
                <div 
                  className="bg-canvas border border-hairline p-5"
                  style={{ borderRadius: '18px' }}
                >
                  <h3 className="text-xs text-ink-muted-48 tracking-widest uppercase border-b border-hairline pb-3 mb-4 font-semibold">
                    Assessments & Diagnosis logs
                  </h3>
                  
                  {activeEpisode.consultations.length === 0 ? (
                    <p className="text-xs text-ink-muted-48 italic py-2">No diagnosis reports recorded for this episode.</p>
                  ) : (
                    <div className="space-y-3 mb-4">
                      {activeEpisode.consultations.map((c, i) => (
                        <div key={i} className="text-xs border-b border-hairline pb-2.5 last:border-b-0">
                          <div className="font-semibold text-ink">Diagnosis: {c.diagnosis}</div>
                          <div className="text-ink-muted-80 mt-1">Notes: {c.notes}</div>
                          <div className="text-[9px] text-ink-muted-48 mt-1">
                            Logged: {new Date(c.date).toLocaleString()}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Add Consultation inline form */}
                  <form onSubmit={handleAddConsultation} className="border-t border-hairline pt-4 space-y-3">
                    <span className="text-xs text-ink block font-semibold uppercase">Add Assessment Log</span>
                    <div>
                      <input 
                        type="text" required placeholder="Diagnosis Label (e.g. Unstable Angina)"
                        value={consForm.diagnosis} onChange={e => setConsForm({ ...consForm, diagnosis: e.target.value })}
                        className="w-full text-xs rounded-full bg-canvas-parchment"
                      />
                    </div>
                    <div>
                      <textarea 
                        required placeholder="Clinical assessment notes..."
                        value={consForm.notes} onChange={e => setConsForm({ ...consForm, notes: e.target.value })}
                        className="w-full text-xs h-16 rounded-[11px] bg-canvas-parchment"
                      />
                    </div>
                    <button
                      type="submit" disabled={addingCons}
                      className="w-full bg-ink hover:bg-ink-muted-80 text-canvas text-xs font-semibold py-2.5 rounded-full transition-colors uppercase cursor-pointer"
                    >
                      {addingCons ? 'Saving...' : 'Log Assessment Entry'}
                    </button>
                  </form>
                 </div>

                {/* Manual Prescription Entry Form */}
                <div 
                  className="bg-canvas border border-hairline p-5"
                  style={{ borderRadius: '18px' }}
                >
                  <h3 className="text-xs text-ink-muted-48 tracking-widest uppercase border-b border-hairline pb-3 mb-4 font-semibold">
                    Write Clinical Prescription
                  </h3>
                  <form 
                    onSubmit={async (e) => {
                      e.preventDefault();
                      if (!rxForm.medicine.trim() || !rxForm.dosage.trim()) return;
                      try {
                        const updated = await api.put(`/episodes/${activeEpisode.episodeId}`, {
                          prescription: {
                            medicine: rxForm.medicine,
                            dosage: rxForm.dosage,
                            frequency: rxForm.frequency,
                            duration: rxForm.duration,
                            instructions: rxForm.instructions,
                            notes: rxForm.notes
                          }
                        });
                        setActiveEpisode(updated);
                        setRxForm({ medicine: '', dosage: '', frequency: '1-0-1', duration: '5 days', instructions: '', notes: '' });
                        addToast('Prescription committed to database successfully!', 'success');
                        refreshData();
                      } catch (err) {
                        addToast(err.message, 'error');
                      }
                    }}
                    className="space-y-3"
                  >
                    <div className="grid grid-cols-2 gap-2">
                      <input 
                        type="text" placeholder="Medicine (e.g. Amoxicillin 500mg)" required
                        value={rxForm.medicine} onChange={e => setRxForm({ ...rxForm, medicine: e.target.value })}
                        className="text-xs rounded-full bg-canvas-parchment px-3 py-2 col-span-2 border border-hairline"
                        style={{ borderRadius: '20px' }}
                      />
                      <input 
                        type="text" placeholder="Dosage (e.g. 500 mg)" required
                        value={rxForm.dosage} onChange={e => setRxForm({ ...rxForm, dosage: e.target.value })}
                        className="text-xs rounded-full bg-canvas-parchment px-3 py-2 border border-hairline"
                        style={{ borderRadius: '20px' }}
                      />
                      <input 
                        type="text" placeholder="Frequency (e.g. 1-0-1)" required
                        value={rxForm.frequency} onChange={e => setRxForm({ ...rxForm, frequency: e.target.value })}
                        className="text-xs rounded-full bg-canvas-parchment px-3 py-2 border border-hairline"
                        style={{ borderRadius: '20px' }}
                      />
                      <input 
                        type="text" placeholder="Duration (e.g. 5 days)" required
                        value={rxForm.duration} onChange={e => setRxForm({ ...rxForm, duration: e.target.value })}
                        className="text-xs rounded-full bg-canvas-parchment px-3 py-2 border border-hairline"
                        style={{ borderRadius: '20px' }}
                      />
                      <input 
                        type="text" placeholder="Instructions (e.g. Post Meal)"
                        value={rxForm.instructions} onChange={e => setRxForm({ ...rxForm, instructions: e.target.value })}
                        className="text-xs rounded-full bg-canvas-parchment px-3 py-2 border border-hairline col-span-2"
                        style={{ borderRadius: '20px' }}
                      />
                    </div>
                    <button
                      type="submit"
                      className="w-full bg-primary hover:bg-primary-focus text-canvas text-xs font-semibold py-2.5 rounded-full transition-colors uppercase cursor-pointer"
                      style={{ borderRadius: '20px' }}
                    >
                      Commit Prescription
                    </button>
                  </form>
                </div>

                {/* Prescription Digitizer Toggle trigger */}
                <div className="space-y-4">
                  <div 
                    className="flex justify-between items-center bg-canvas border border-hairline p-4"
                    style={{ borderRadius: '18px' }}
                  >
                    <div>
                      <h4 className="text-sm font-semibold text-ink flex items-center gap-1.5">
                        <FileText size={14} className="text-primary" /> Digitizer OCR Transcription
                      </h4>
                      <p className="text-xs text-ink-muted-48 mt-1">Digitize handwritten notes to automatically log medicines.</p>
                    </div>
                    <button
                      onClick={() => setShowDigitizer(!showDigitizer)}
                      className="text-xs bg-ink text-canvas px-3.5 py-1.5 rounded-full hover:bg-ink-muted-80 uppercase cursor-pointer font-semibold"
                    >
                      {showDigitizer ? 'Close' : 'Digitize'}
                    </button>
                  </div>
                  
                  {showDigitizer && (
                    <PrescriptionDigitizer 
                      episodeId={activeEpisode.episodeId} 
                      onDigitized={async () => {
                        setShowDigitizer(false);
                        const eps = await api.get(`/episodes?patientId=${selectedPatient.patientId}`);
                        setActiveEpisode(eps.find(e => e.status === 'ACTIVE') || null);
                      }}
                    />
                  )}
                </div>

                {/* Prescriptions cabinet */}
                <div 
                  className="bg-canvas border border-hairline p-5"
                  style={{ borderRadius: '18px' }}
                >
                  <h3 className="text-xs text-ink-muted-48 tracking-widest uppercase border-b border-hairline pb-3 mb-4 font-semibold">
                    Current Active Medications Cabinet
                  </h3>
                  {activeEpisode.prescriptions.length === 0 ? (
                    <p className="text-xs text-ink-muted-48 italic py-2">No active prescriptions registered.</p>
                  ) : (
                    <div className="space-y-3">
                      {activeEpisode.prescriptions.map((p, i) => (
                        <div key={i} className="bg-canvas-parchment border border-hairline rounded-[11px] p-3 text-xs">
                          <div className="font-semibold text-ink text-sm">{p.medicine}</div>
                          <div className="grid grid-cols-3 gap-2 mt-2 font-mono text-[11px]">
                            <div>Dosage: <strong className="text-ink">{p.dosage}</strong></div>
                            <div>Freq: <strong className="text-ink">{p.frequency}</strong></div>
                            <div>Duration: <strong className="text-ink">{p.duration}</strong></div>
                          </div>
                          {p.originalImagePath && (
                            <div className="text-[9px] text-[#1f8a65] font-semibold mt-3">
                              ✓ TRANSCRIPTION DIGITIZED VIA TENSORFLOW OCR
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Investigations request */}
                <div 
                  className="bg-canvas border border-hairline p-5"
                  style={{ borderRadius: '18px' }}
                >
                  <h3 className="text-xs text-ink-muted-48 tracking-widest uppercase border-b border-hairline pb-3 mb-4 font-semibold">
                    Lab Investigations & Diagnostics
                  </h3>
                  
                  {activeEpisode.tests.length === 0 ? (
                    <p className="text-xs text-ink-muted-48 italic py-2">No diagnostic test reports ordered.</p>
                  ) : (
                    <div className="space-y-2 mb-4 text-xs">
                      {activeEpisode.tests.map((tItem, i) => (
                        <div key={i} className="flex justify-between items-center py-2.5 border-b border-hairline last:border-b-0">
                          <div>
                            <span className="font-semibold text-ink">{tItem.name}</span>
                            {tItem.result && <span className="block text-[11px] text-ink-muted-85 mt-1 leading-relaxed font-mono">Result: {tItem.result}</span>}
                          </div>
                          <span className={`text-[9px] uppercase font-bold px-2 py-0.5 rounded-full ${
                            tItem.status === 'COMPLETED' ? 'bg-green-100 text-[#1f8a65]' : 'bg-yellow-100 text-timeline-done'
                          }`}>
                            {tItem.status}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}

                  <form onSubmit={handleAddTest} className="border-t border-hairline pt-4 flex gap-2">
                    <input 
                      type="text" required placeholder="Lab Test Name (e.g. Lipase Test)"
                      value={testName} onChange={e => setTestName(e.target.value)}
                      className="flex-grow text-xs rounded-full bg-canvas-parchment"
                    />
                    <button
                      type="submit"
                      className="bg-ink hover:bg-ink-muted-80 text-canvas text-xs font-semibold px-4 rounded-full transition-colors uppercase cursor-pointer"
                    >
                      Order
                    </button>
                  </form>
                </div>

                {/* Medical Documents Section */}
                <div 
                  className="bg-canvas border border-hairline p-5 space-y-4"
                  style={{ borderRadius: '18px' }}
                >
                  <div className="border-b border-hairline pb-3">
                    <h3 className="text-xs text-ink-muted-48 tracking-widest uppercase font-semibold">
                      Attached Records & Diagnostic Reports
                    </h3>
                    {/* Retention Policy & Privacy Notice */}
                    <div className="mt-2.5 p-3 rounded-[11px] bg-canvas-parchment border border-hairline text-[11px] text-ink-muted-80 leading-relaxed flex items-start gap-2">
                      <AlertCircle size={15} className="text-primary shrink-0 mt-0.5" />
                      <div>
                        <strong className="text-ink font-semibold">Retention Policy Notice:</strong> Diagnostic reports and test results older than 6 months are automatically purged in accordance with hospital compliance (unless under active legal hold). Prescriptions are preserved permanently.
                        <div className="mt-1 text-[10px] text-ink-muted-48 italic">
                          🔒 Patient Privacy: Medical records can only be removed or deleted by the patient.
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-2 mb-4 max-h-52 overflow-y-auto pr-1">
                    {[...(patientDocuments || [])]
                      .sort((a, b) => new Date(b.createdAt || b.examinationDate || 0) - new Date(a.createdAt || a.examinationDate || 0))
                      .map((doc, i) => (
                      <div key={i} className="flex justify-between items-center bg-canvas-parchment border border-hairline rounded-[11px] p-3 text-xs">
                        <div className="space-y-1">
                          <div className="font-semibold text-ink flex items-center gap-1.5">
                            <FileText size={13} className="text-primary" />
                            {doc.title}
                          </div>
                          <div className="text-[10px] text-ink-muted-48 uppercase">
                            {doc.type} • By {doc.uploadedBy || 'Medical Staff'}
                            {doc.fileSize ? ` • ${(doc.fileSize / 1024).toFixed(0)} KB` : ''}
                          </div>
                          <div className="flex items-center gap-1.5 pt-0.5">
                            {doc.retentionPolicy?.autoDelete ? (
                              <span className="text-[9px] px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-600 font-medium border border-amber-500/20">
                                6-Mo Auto Purge
                              </span>
                            ) : (
                              <span className="text-[9px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 font-medium border border-emerald-500/20">
                                Permanent Record
                              </span>
                            )}
                            {doc.legalHold && (
                              <span className="text-[9px] px-2 py-0.5 rounded-full bg-red-500/10 text-red-600 font-medium border border-red-500/20">
                                ⚖️ Legal Hold
                              </span>
                            )}
                          </div>
                        </div>

                        <div className="flex flex-col items-end gap-1.5">
                          <span className="text-[9px] text-ink-muted-48 font-mono">{new Date(doc.createdAt).toLocaleDateString()}</span>
                          <button
                            type="button"
                            disabled={downloadingDocId === doc.documentId}
                            onClick={async () => {
                              try {
                                setDownloadingDocId(doc.documentId);
                                const res = await api.get(`/documents/${doc.documentId}/download-url`);
                                if (res.downloadUrl) {
                                  window.open(getFileUrl(res.downloadUrl), '_blank');
                                } else {
                                  addToast('Download link generated', 'info');
                                }
                              } catch (err) {
                                addToast(err.message || 'Failed to download document', 'error');
                              } finally {
                                setDownloadingDocId(null);
                              }
                            }}
                            className="text-[10px] bg-canvas border border-hairline hover:bg-canvas-parchment text-ink px-2.5 py-1 rounded-full flex items-center gap-1 cursor-pointer font-medium"
                          >
                            <Download size={11} />
                            {downloadingDocId === doc.documentId ? 'Opening...' : 'View/Download'}
                          </button>
                        </div>
                      </div>
                    ))}
                    {patientDocuments.length === 0 && (
                      <p className="text-xs text-ink-muted-48 italic py-3 text-center">No reports or records attached yet.</p>
                    )}
                  </div>

                  <form 
                    onSubmit={async (e) => {
                      e.preventDefault();
                      if (!docForm.title.trim()) return;
                      setUploadingDoc(true);
                      try {
                        if (selectedFile) {
                          const formData = new FormData();
                          const patientTargetId = selectedPatient.patientId || selectedPatient.id;
                          formData.append('file', selectedFile);
                          formData.append('patientId', patientTargetId);
                          if (activeEpisode?.episodeId) formData.append('treatmentEpisodeId', activeEpisode.episodeId);
                          formData.append('type', docForm.type);
                          formData.append('title', docForm.title);
                          formData.append('department', selectedPatient.department || 'GENERAL');
                          if (user?.name) formData.append('doctor', user.name);
                          // Add doctorId for proper document linking
                          if (user?.doctorId) formData.append('doctorId', user.doctorId);
                          else if (user?.id) formData.append('doctorId', user.id);

                          // Debug: log FormData entries
                          console.log('[DoctorDashboard] Uploading document:', {
                            patientId: selectedPatient.patientId,
                            episodeId: activeEpisode?.episodeId,
                            type: docForm.type,
                            title: docForm.title,
                            fileName: selectedFile.name,
                            fileSize: selectedFile.size,
                            mimeType: selectedFile.type,
                            doctor: user?.name,
                            doctorId: user?.doctorId || user?.id
                          });
                          for (const [key, value] of formData.entries()) {
                            console.log(`[DoctorDashboard] FormData: ${key} =`, value instanceof File ? `${value.name} (${value.size} bytes, ${value.type})` : value);
                          }

                          await api.post('/documents/upload', formData);
                        } else {
                          // Metadata-only fallback
                          await api.post(`/patients/${selectedPatient.patientId}/documents`, {
                            title: docForm.title,
                            type: docForm.type,
                            treatmentEpisodeId: activeEpisode?.episodeId,
                            fileRef: 'ref_doc_' + docForm.title.toLowerCase().replace(/\s+/g, '_')
                          });
                        }

                        setDocForm({ title: '', type: 'LAB_REPORT' });
                        setSelectedFile(null);
                        addToast('Document saved to device storage!', 'success');
                        
                        // Reload docs
                        const docs = await api.get(`/patients/${selectedPatient.patientId}/documents`);
                        setPatientDocuments(docs || []);
                        refreshData();
                      } catch (err) {
                        console.error('[DoctorDashboard] Upload error:', err);
                        addToast(err.message || 'Upload failed - check console for details', 'error');
                      } finally {
                        setUploadingDoc(false);
                      }
                    }}
                    className="border-t border-hairline pt-4 space-y-3"
                  >
                    <span className="text-[11px] text-ink block font-semibold uppercase">Attach Record to Patient File (Saved Locally)</span>
                    <p className="text-[10px] text-amber-600 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
                      ⚠️ <strong>Retention Policy:</strong> Lab reports, imaging &amp; test results are <strong>auto-deleted after 6 months</strong> from examination date. Prescriptions, discharge summaries &amp; referrals are stored permanently on this device.
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <input 
                        type="text" placeholder="Title (e.g. Chest X-Ray Scan)" required
                        value={docForm.title} onChange={e => setDocForm({ ...docForm, title: e.target.value })}
                        className="text-xs rounded-full bg-canvas-parchment px-3 py-1.5 border border-hairline"
                      />
                      <select
                        value={docForm.type} onChange={e => setDocForm({ ...docForm, type: e.target.value })}
                        className="text-xs bg-canvas border border-hairline rounded-full px-3 py-1.5 outline-none cursor-pointer"
                        style={{ borderRadius: '20px' }}
                      >
                        <option value="LAB_REPORT">Lab Report (6-mo auto purge)</option>
                        <option value="IMAGING">Imaging MRI/CT/X-Ray (6-mo auto purge)</option>
                        <option value="TEST_REPORT">Diagnostic Test (6-mo auto purge)</option>
                        <option value="PRESCRIPTION">Prescription (Permanent)</option>
                        <option value="DISCHARGE_SUMMARY">Discharge Summary (Permanent)</option>
                        <option value="REFERRAL">Referral Letter (Permanent)</option>
                        <option value="OTHER">Other Clinical Record</option>
                      </select>
                    </div>

                    <div className="flex items-center gap-2">
                      <input
                        type="file"
                        accept=".pdf,image/jpeg,image/png"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) {
                            if (file.size > 15 * 1024 * 1024) {
                              addToast('File exceeds 15MB limit', 'error');
                              e.target.value = '';
                              return;
                            }
                            setSelectedFile(file);
                            if (!docForm.title) {
                              setDocForm(prev => ({ ...prev, title: file.name.replace(/\.[^/.]+$/, '') }));
                            }
                          }
                        }}
                        className="text-xs file:mr-2 file:py-1 file:px-3 file:rounded-full file:border-0 file:text-[11px] file:bg-primary file:text-canvas file:cursor-pointer text-ink-muted-48 cursor-pointer"
                      />
                    </div>

                    <button
                      type="submit" disabled={uploadingDoc}
                      className="w-full bg-ink hover:bg-ink-muted-80 text-canvas text-xs font-semibold py-2.5 rounded-full transition-colors uppercase cursor-pointer"
                      style={{ borderRadius: '20px' }}
                    >
                      {uploadingDoc ? 'Saving to device...' : 'Upload & Save to Device'}
                    </button>
                  </form>
                </div>

                {/* Chat communications */}
                <div 
                  className="bg-canvas border border-hairline p-5"
                  style={{ borderRadius: '18px' }}
                >
                  <h3 className="text-xs text-ink-muted-48 tracking-widest uppercase border-b border-hairline pb-3 mb-4 font-semibold">
                    Episode Chat Coordinator
                  </h3>
                  
                  <div className="space-y-2 max-h-48 overflow-y-auto mb-4 bg-canvas-parchment border border-hairline p-3 rounded-[11px]">
                    {activeEpisode.messages.length === 0 ? (
                      <p className="text-xs text-ink-muted-48 italic text-center py-4">No coordination messages logged.</p>
                    ) : (
                      activeEpisode.messages.map((m, i) => (
                        <div 
                          key={i} 
                          className={`p-2.5 rounded-[11px] text-xs max-w-[85%] ${
                            m.sender === 'DOCTOR' 
                              ? 'bg-ink text-canvas ml-auto' 
                              : 'bg-canvas border border-hairline text-ink mr-auto'
                          }`}
                        >
                          <div>{m.text}</div>
                          <span className="text-[9px] block text-right mt-1 opacity-70">
                            {new Date(m.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>
                      ))
                    )}
                  </div>

                  <form onSubmit={handleSendChatMessage} className="flex gap-2">
                    <input 
                      type="text" required placeholder="Type coordination message..."
                      value={chatMessage} onChange={e => setChatMessage(e.target.value)}
                      className="flex-grow text-xs rounded-full bg-canvas-parchment"
                    />
                    <button
                      type="submit"
                      className="bg-primary hover:bg-primary-focus text-canvas text-xs font-semibold px-4 rounded-full transition-colors uppercase cursor-pointer"
                    >
                      Send
                    </button>
                  </form>
                </div>

                {/* Patient Treatment Timeline */}
                <div 
                  className="bg-canvas border border-hairline p-5 space-y-4"
                  style={{ borderRadius: '18px' }}
                >
                  <h3 className="text-xs text-ink-muted-48 tracking-widest uppercase border-b border-hairline pb-3 mb-2 font-bold font-sans">
                    Treatment Event Timeline
                  </h3>
                  <div className="max-h-48 overflow-y-auto space-y-3.5 pr-1 text-xs">
                    {timelineLogs.map((log, i) => (
                      <div key={i} className="flex gap-2.5">
                        <span className="text-[10px] text-ink-muted-48 font-mono shrink-0 pt-0.5">
                          {new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                        <div>
                          <strong className="text-ink block">{log.action}</strong>
                          {log.metadata && (
                            <span className="text-[10px] text-ink-muted-48 block mt-0.5 leading-relaxed font-mono">
                              {log.metadata.from && `From: ${log.metadata.from} → To: ${log.metadata.to}`}
                              {log.metadata.condition && `${log.metadata.condition} @ ${log.metadata.location}`}
                              {log.metadata.type && `Stock log: ${log.metadata.type}`}
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                    {timelineLogs.length === 0 && (
                      <div className="text-xs text-ink-muted-48 italic py-2 text-center">No care events registered yet.</div>
                    )}
                  </div>
                </div>

                {/* Patient Discharge panel */}
                <div 
                  className="bg-canvas border border-hairline p-4 flex justify-between items-center"
                  style={{ borderRadius: '18px' }}
                >
                  <div>
                    <h4 className="text-sm font-semibold text-ink">Discharge Inpatient</h4>
                    <p className="text-xs text-ink-muted-48 mt-1">Stops clinical communications and releases bed assignment.</p>
                  </div>
                  <button
                    onClick={handleDischargePatient}
                    className="bg-primary hover:bg-primary-focus text-canvas text-xs font-semibold py-2.5 px-4 rounded-full transition-colors uppercase font-semibold cursor-pointer"
                  >
                    Discharge
                  </button>
                </div>

              </div>
            ) : (
              <div className="bg-canvas border border-dashed border-hairline p-6 text-center text-ink-muted-48">
                <AlertCircle size={20} className="text-ink-muted-48 mx-auto mb-2" />
                <p className="text-xs">Patient does not have an active Treatment Episode. Assign a clinical consultant in the Admin Web App first.</p>
              </div>
            )}

          </div>
        )}

      </main>

      {/* Bottom Navigation tab feed (frosted-glass subnav style with iOS safe area bottom inset) */}
      <footer className="fixed bottom-0 left-0 right-0 bg-canvas border-t border-hairline flex shrink-0 z-30 frosted-glass shadow-none pwa-footer">
        <button 
          onClick={() => setActiveTab('schedule')}
          className={`flex-1 flex flex-col items-center justify-center text-xs cursor-pointer ${activeTab === 'schedule' ? 'text-primary font-semibold' : 'text-ink-muted-48 hover:text-ink'}`}
        >
          <Calendar size={18} />
          <span className="mt-1 text-[9px] uppercase tracking-wider font-semibold">Rounds</span>
        </button>
        <button 
          onClick={() => setActiveTab('patients')}
          className={`flex-1 flex flex-col items-center justify-center text-xs cursor-pointer ${activeTab === 'patients' ? 'text-primary font-semibold' : 'text-ink-muted-48 hover:text-ink'}`}
        >
          <Users size={18} />
          <span className="mt-1 text-[9px] uppercase tracking-wider font-semibold">Patients</span>
        </button>
        <button 
          onClick={() => setActiveTab('scanner')}
          className={`flex-1 flex flex-col items-center justify-center text-xs cursor-pointer ${activeTab === 'scanner' ? 'text-primary font-semibold' : 'text-ink-muted-48 hover:text-ink'}`}
        >
          <Search size={18} />
          <span className="mt-1 text-[9px] uppercase tracking-wider font-semibold">Scan QR</span>
        </button>
        <button 
          onClick={() => setActiveTab('mailbox')}
          className={`flex-1 flex flex-col items-center justify-center text-xs cursor-pointer ${activeTab === 'mailbox' ? 'text-primary font-semibold' : 'text-ink-muted-48 hover:text-ink'} relative`}
        >
          <Inbox size={18} />
          <span className="mt-1 text-[9px] uppercase tracking-wider font-semibold">Updates</span>
          {doctorNotifications.filter(n => n.status === 'UNREAD').length > 0 && (
            <span className="absolute top-2 right-6 w-2 h-2 rounded-full bg-primary border border-white" />
          )}
        </button>
      </footer>

      <ServerConfigModal 
        isOpen={showServerModal} 
        onClose={() => setShowServerModal(false)} 
        addToast={addToast} 
      />

    </div>
  );
}

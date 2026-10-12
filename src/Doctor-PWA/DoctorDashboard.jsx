import React, { useState, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { api, getFileUrl } from '../utils/api';
import QRScanner from '../components/QRScanner';
import PrescriptionDigitizer from '../components/PrescriptionDigitizer';
import ServerConfigModal from '../components/ServerConfigModal';
import PatientDocumentsPanel from './components/PatientDocumentsPanel';
import { 
  Stethoscope, Calendar, Inbox, Search, LogOut, Sparkles, 
  AlertCircle, ShieldAlert, PhoneCall, PlusCircle, CheckCircle, FileText,
  Smartphone, Download, Users, Server, User, Pill, ClipboardList, History,
  CheckCircle2, HeartPulse, Activity, MessageSquare, Scissors, XCircle, Clock, MapPin
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
  const [patientSubTab, setPatientSubTab] = useState('records');

  // Local state for credentials login form
  const [loginForm, setLoginForm] = useState({ phone: '', id: '' });
  const [loggingIn, setLoggingIn] = useState(false);

  const handleLoginSubmit = async (e) => {
    e.preventDefault();
    const rawPhone = (loginForm.phone || '').trim();
    const rawId = (loginForm.id || '').trim();
    if (!rawPhone || !rawId) return;
    setLoggingIn(true);
    try {
      const digitsOnly = rawPhone.replace(/\D/g, '');
      const phoneFormatted = rawPhone.startsWith('+')
        ? `+${digitsOnly}`
        : (digitsOnly.length === 10 ? `+91${digitsOnly}` : (digitsOnly.startsWith('91') ? `+${digitsOnly}` : `+91${digitsOnly}`));
      await login('DOCTOR', { phone: phoneFormatted, id: rawId });
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

  // Doctor Surgery Action States
  const [doctorSurgTab, setDoctorSurgTab] = useState('upcoming'); // 'upcoming' | 'completed'
  const [doctorCompleteModal, setDoctorCompleteModal] = useState({
    open: false,
    surgery: null,
    outcome: 'Successful',
    notes: '',
    durationMinutes: 60
  });
  const [doctorCancelModal, setDoctorCancelModal] = useState({
    open: false,
    surgery: null,
    reason: 'Patient hemodynamically unstable'
  });
  const [submittingSurgAction, setSubmittingSurgAction] = useState(false);

  const handleDoctorCompleteSurgery = async (e) => {
    e.preventDefault();
    if (!doctorCompleteModal.surgery) return;
    setSubmittingSurgAction(true);
    try {
      const sid = doctorCompleteModal.surgery.surgeryId;
      await api.patch(`/surgeries/${sid}/status`, {
        status: 'COMPLETED',
        outcome: doctorCompleteModal.outcome || 'Successful',
        notes: doctorCompleteModal.notes || '',
        durationMinutes: doctorCompleteModal.durationMinutes || 60,
        doctorId: user?.id || user?._id || doctorCompleteModal.surgery.doctorId,
        completedAt: new Date().toISOString()
      });
      addToast(`Surgery ${sid} logged as COMPLETED. Surgical record saved.`, 'success');
      setDoctorCompleteModal({ open: false, surgery: null, outcome: 'Successful', notes: '', durationMinutes: 60 });
      refreshData();
    } catch (err) {
      addToast(err.message || 'Failed to update surgery', 'error');
    } finally {
      setSubmittingSurgAction(false);
    }
  };

  const handleDoctorCancelSurgery = async (e) => {
    e.preventDefault();
    if (!doctorCancelModal.surgery) return;
    setSubmittingSurgAction(true);
    try {
      const sid = doctorCancelModal.surgery.surgeryId;
      await api.patch(`/surgeries/${sid}/status`, {
        status: 'CANCELLED',
        cancellationReason: doctorCancelModal.reason || 'Cancelled by attending surgeon',
        cancelledBy: user?.name ? `Dr. ${user.name}` : 'Attending Surgeon'
      });
      addToast(`Surgery ${sid} marked as CANCELLED.`, 'info');
      setDoctorCancelModal({ open: false, surgery: null, reason: 'Patient hemodynamically unstable' });
      refreshData();
    } catch (err) {
      addToast(err.message || 'Failed to cancel surgery', 'error');
    } finally {
      setSubmittingSurgAction(false);
    }
  };

  // Load patient active episode, documents, and timeline whenever selectedPatient changes
  useEffect(() => {
    if (!selectedPatient?.patientId) {
      setActiveEpisode(null);
      setTimelineLogs([]);
      setPatientDocuments([]);
      return;
    }
    const pid = selectedPatient.patientId;
    async function loadEpisodeAndTimeline() {
      try {
        const [eps, logs, docs] = await Promise.all([
          api.get(`/episodes?patientId=${pid}`),
          api.get(`/dashboard/audit?patientId=${pid}`),
          api.get(`/patients/${pid}/documents`)
        ]);
        const active = (eps || []).find(e => e.status === 'ACTIVE') || (eps && eps[eps.length - 1]) || null;
        setActiveEpisode(active);
        setTimelineLogs(logs || []);
        const resolvedDocs = Array.isArray(docs) ? docs : (docs?.documents || docs?.files || []);
        setPatientDocuments(resolvedDocs);
      } catch (err) {
        console.warn('Episode/document load note:', err.message);
      }
    }
    loadEpisodeAndTimeline();
  }, [selectedPatient?.patientId]);

  const handlePatientFound = (patient) => {
    if (patient && patient.patientId) {
      const pid = patient.patientId;
      if (!activePatientIds.includes(pid)) {
        setActivePatientIds(prev => [...prev, pid]);
      }

      // 1. Instant UI switch - display patient profile immediately
      setSelectedPatient(patient);
      setActiveTab('patientView');
      setPatientSubTab('records');

      // 2. Background check: if patient was not yet assigned, confirm assignment
      const docId = user?.doctorId || user?.id || user?._id;
      const assignedDoc = patient.assignedDoctor;
      const docMatch = assignedDoc && (
        (typeof assignedDoc === 'object' && (assignedDoc.doctorId === docId || assignedDoc._id === user?._id)) ||
        (typeof assignedDoc === 'string' && (assignedDoc === docId || assignedDoc === user?._id))
      );

      if (docId && !docMatch) {
        api.put(`/patients/${pid}/assign-doctor`, { doctorId: docId })
          .then(updatedPatient => {
            if (updatedPatient) setSelectedPatient(updatedPatient);
          })
          .catch(err => {
            console.warn('Background assignment confirmation:', err.message);
          });
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
  const myDoctorId = user?.doctorId || user?.id;
  const isAssignedToDoctor = (pt) => {
    if (!pt) return false;
    const doc = pt.assignedDoctor;
    if (!doc) return false;
    if (typeof doc === 'string') return doc === myDoctorId || doc === user?._id;
    return doc.doctorId === myDoctorId || doc._id === user?._id || doc.id === myDoctorId;
  };
  const visiblePatients = (patients || []).filter(pt => 
    activePatientIds.includes(pt.patientId) || isAssignedToDoctor(pt)
  );

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

            {/* Surgical Feed & Case Management */}
            {(() => {
              const mySurgeries = surgeries.filter(s => 
                s.doctorId === user?.id || s.doctorId === user?._id ||
                s.performedBy?.doctorId === user?.id || s.performedBy?.doctorId === user?._id ||
                (s.doctorName && user?.name && s.doctorName.toLowerCase().includes(user.name.toLowerCase()))
              );
              const upcomingSurgeries = mySurgeries.filter(s => (s.status || 'SCHEDULED') === 'SCHEDULED' || s.status === 'IN_PROGRESS');
              const completedSurgeries = mySurgeries.filter(s => s.status === 'COMPLETED');
              const displayList = [...(doctorSurgTab === 'completed' ? completedSurgeries : upcomingSurgeries)];

              displayList.sort((a, b) => {
                const getT = (s) => {
                  if (s.createdAt) { const t = new Date(s.createdAt).getTime(); if (!isNaN(t)) return t; }
                  if (s._id) {
                    const hex = typeof s._id === 'string' ? s._id : (s._id.toString ? s._id.toString() : '');
                    if (hex && hex.length === 24) { const t = parseInt(hex.substring(0, 8), 16) * 1000; if (!isNaN(t)) return t; }
                  }
                  if (s.completedAt) { const t = new Date(s.completedAt).getTime(); if (!isNaN(t)) return t; }
                  if (s.time) { const t = new Date(s.time).getTime(); if (!isNaN(t)) return t; }
                  if (s.scheduledAt) { const t = new Date(s.scheduledAt).getTime(); if (!isNaN(t)) return t; }
                  return 0;
                };
                return getT(b) - getT(a);
              });

              return (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <Scissors size={14} className="text-primary" />
                      <h3 className="text-[10px] text-ink-muted-48 tracking-widest uppercase font-bold">Operating Theatre & Surgeries</h3>
                    </div>
                    <div className="flex gap-1.5">
                      <button
                        type="button"
                        onClick={() => setDoctorSurgTab('upcoming')}
                        className={`text-[10px] font-bold px-2.5 py-1 rounded-full cursor-pointer transition-all ${
                          doctorSurgTab === 'upcoming'
                            ? 'bg-ink text-canvas'
                            : 'bg-canvas-parchment text-ink-muted-48 hover:text-ink border border-hairline'
                        }`}
                      >
                        Upcoming ({upcomingSurgeries.length})
                      </button>
                      <button
                        type="button"
                        onClick={() => setDoctorSurgTab('completed')}
                        className={`text-[10px] font-bold px-2.5 py-1 rounded-full cursor-pointer transition-all ${
                          doctorSurgTab === 'completed'
                            ? 'bg-[#0066cc] text-white'
                            : 'bg-canvas-parchment text-ink-muted-48 hover:text-ink border border-hairline'
                        }`}
                      >
                        Completed Log ({completedSurgeries.length})
                      </button>
                    </div>
                  </div>

                  {displayList.length === 0 ? (
                    <div 
                      className="bg-canvas border border-hairline p-6 text-center text-xs text-ink-muted-48"
                      style={{ borderRadius: '18px' }}
                    >
                      <Calendar size={20} className="mx-auto mb-2 text-ink-muted-48" />
                      <p>No {doctorSurgTab === 'completed' ? 'completed' : 'scheduled'} surgical cases for Dr. {user?.name || 'Doctor'}.</p>
                      <p className="text-[10px] mt-1">Hospital OT allocations will appear here in real-time.</p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {displayList.map(s => {
                        const isCompleted = s.status === 'COMPLETED';

                        return (
                          <div
                            key={s.surgeryId}
                            className={`p-4 border transition-all ${
                              isCompleted
                                ? 'bg-canvas border-emerald-200/80'
                                : 'bg-canvas border-primary/20'
                            }`}
                            style={{ borderRadius: '18px' }}
                          >
                            <div className="flex justify-between items-start gap-2">
                              <div>
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <span className="font-mono text-[10px] font-bold text-ink-muted-48">{s.surgeryId}</span>
                                  {isCompleted ? (
                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                                      <CheckCircle2 size={11} /> Completed
                                    </span>
                                  ) : (
                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-blue-50 text-[#0066cc] border border-blue-200">
                                      <Clock size={11} /> Scheduled
                                    </span>
                                  )}
                                  {isCompleted && s.outcome && (
                                    <span className="text-[10px] text-ink-muted-85 px-1.5 py-0.5 rounded bg-canvas-parchment border border-hairline">
                                      {s.outcome}
                                    </span>
                                  )}
                                </div>
                                <h4 className="text-sm font-semibold text-ink mt-1">{s.procedure}</h4>
                                <div className="text-xs text-ink-muted-85 mt-0.5">
                                  Patient: <strong className="text-ink">{s.patientName || s.patientId}</strong> ({s.patientId})
                                </div>
                              </div>

                              <div className="text-right shrink-0">
                                <span className="text-xs font-semibold px-2 py-1 bg-canvas-parchment border border-hairline rounded-full inline-flex items-center gap-1">
                                  <MapPin size={10} className="text-primary" /> {s.operatingTheatre}
                                </span>
                                <span className="text-[10px] text-ink-muted-48 block mt-1.5">{s.time}</span>
                              </div>
                            </div>

                            {/* Additional info for completed surgeries */}
                            {isCompleted && (
                              <div className="mt-3 pt-2.5 border-t border-hairline text-xs space-y-1.5">
                                <div className="flex justify-between text-ink-muted-48 text-[11px]">
                                  <span>Duration: <strong>{s.durationMinutes || 60} mins</strong></span>
                                  <span>Completed: {s.completedAt ? new Date(s.completedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : s.time}</span>
                                </div>
                                {s.notes && (
                                  <div className="bg-canvas-parchment/60 p-2.5 rounded-xl text-[11px] font-mono text-ink-muted-85 border border-hairline">
                                    Notes: {s.notes}
                                  </div>
                                )}
                              </div>
                            )}

                            {/* Action buttons for upcoming surgeries */}
                            {!isCompleted && (
                              <div className="mt-3 pt-2.5 border-t border-hairline flex justify-end gap-2">
                                <button
                                  type="button"
                                  onClick={() => setDoctorCancelModal({
                                    open: true,
                                    surgery: s,
                                    reason: 'Patient hemodynamically unstable'
                                  })}
                                  className="px-3 py-1 text-xs font-semibold rounded-full bg-canvas-parchment hover:bg-rose-50 text-[#cf2d56] border border-hairline hover:border-rose-300 transition-all cursor-pointer inline-flex items-center gap-1"
                                >
                                  <XCircle size={12} />
                                  <span>Cancel</span>
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setDoctorCompleteModal({
                                    open: true,
                                    surgery: s,
                                    outcome: 'Successful',
                                    notes: '',
                                    durationMinutes: 60
                                  })}
                                  className="px-3.5 py-1 text-xs font-semibold rounded-full bg-[#0066cc] hover:bg-[#0055b3] text-white shadow-sm transition-all cursor-pointer inline-flex items-center gap-1"
                                >
                                  <CheckCircle2 size={12} />
                                  <span>Mark Completed</span>
                                </button>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })()}
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
          <div className="space-y-5">
            
            {/* Header profile brief */}
            <div 
              className="bg-canvas border border-hairline p-5 apple-product-shadow space-y-4"
              style={{ borderRadius: '18px' }}
            >
              <div className="flex justify-between items-start gap-3">
                <div className="flex items-start gap-3.5">
                  <div className="w-12 h-12 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center text-primary font-bold text-base shrink-0">
                    {(selectedPatient.name || selectedPatient.fullName || 'P').charAt(0)}
                  </div>
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <h2 className="text-lg font-bold text-ink leading-tight">
                        {selectedPatient.name || selectedPatient.fullName}
                      </h2>
                      <span className="text-[10px] bg-ink text-canvas font-mono font-bold px-2 py-0.5 rounded-full">
                        {selectedPatient.bloodGroup || 'Blood N/A'}
                      </span>
                      <span className="text-[10px] bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-0.5 rounded-full font-semibold flex items-center gap-1">
                        <CheckCircle2 size={11} /> Auto-Assigned
                      </span>
                    </div>

                    <div className="text-[11px] text-ink-muted-48 mt-1.5 flex items-center gap-3 flex-wrap">
                      <span>ID: <strong className="font-mono text-ink">{selectedPatient.patientId}</strong></span>
                      <span>UID: <strong className="font-mono text-primary">{selectedPatient.aadhaarNumber ? selectedPatient.aadhaarNumber.replace(/(\d{4})(\d{4})(\d{4})/, '$1 $2 $3') : 'N/A'}</strong></span>
                      <span>Age: <strong className="text-ink">{selectedPatient.age} Yrs ({selectedPatient.gender})</strong></span>
                      <span>Dept: <strong className="text-ink">{selectedPatient.department || 'General Medicine'}</strong></span>
                    </div>
                  </div>
                </div>

                <button 
                  onClick={() => { setSelectedPatient(null); setActiveTab('scanner'); }}
                  className="text-xs border border-hairline hover:border-ink px-3 py-1.5 rounded-full cursor-pointer bg-canvas-parchment text-ink font-semibold shrink-0"
                >
                  Close File
                </button>
              </div>

              {/* Segregated Sub-Navigation Tabs (Apple-style pill row) */}
              <div className="flex items-center gap-1.5 overflow-x-auto pt-3 border-t border-hairline scrollbar-none">
                {[
                  { id: 'records', label: 'Clinical Records', icon: FileText },
                  { id: 'overview', label: 'Medical Profile', icon: User },
                  { id: 'medications', label: 'Prescriptions', icon: Pill },
                  { id: 'clinical', label: 'Notes & Labs', icon: ClipboardList },
                  { id: 'timeline', label: 'Timeline & Chat', icon: History }
                ].map(tab => {
                  const Icon = tab.icon;
                  const isActive = patientSubTab === tab.id;
                  return (
                    <button
                      key={tab.id}
                      onClick={() => setPatientSubTab(tab.id)}
                      className={`px-3.5 py-2 rounded-full text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap transition-all cursor-pointer ${
                        isActive
                          ? 'bg-primary text-canvas shadow-xs'
                          : 'bg-canvas-parchment text-ink-muted-80 hover:text-ink hover:bg-divider-soft border border-hairline'
                      }`}
                    >
                      <Icon size={13} />
                      {tab.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* ================= SUB-TAB 1: CLINICAL RECORDS & FILES ================= */}
            {patientSubTab === 'records' && (
              <div className="space-y-4">
                <PatientDocumentsPanel
                  patient={selectedPatient}
                  activeEpisode={activeEpisode}
                  doctorUser={user}
                  initialDocuments={patientDocuments}
                />
              </div>
            )}

            {/* ================= SUB-TAB 2: MEDICAL PROFILE & HISTORY ================= */}
            {patientSubTab === 'overview' && (
              <div className="space-y-4">
                {/* Critical Allergies & Medical History */}
                <div className="bg-canvas border border-hairline p-5 space-y-4" style={{ borderRadius: '18px' }}>
                  <h3 className="text-xs text-ink-muted-48 tracking-widest uppercase border-b border-hairline pb-2.5 font-bold font-sans flex items-center gap-1.5">
                    <ShieldAlert size={14} className="text-amber-600" /> Allergies & Critical Clinical Alerts
                  </h3>
                  
                  <div>
                    <span className="text-[11px] text-ink-muted-48 uppercase font-bold block mb-1.5">Documented Allergies</span>
                    {selectedPatient.allergies && selectedPatient.allergies.length > 0 ? (
                      <div className="flex flex-wrap gap-2">
                        {selectedPatient.allergies.map((allg, i) => (
                          <span key={i} className="bg-rose-50 border border-rose-200 text-rose-700 text-xs font-bold px-3 py-1 rounded-full flex items-center gap-1">
                            ⚠️ {allg}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-ink-muted-48 italic">No drug or food allergies recorded.</p>
                    )}
                  </div>

                  <div className="border-t border-hairline pt-3">
                    <span className="text-[11px] text-ink-muted-48 uppercase font-bold block mb-1.5">Past Medical History</span>
                    {selectedPatient.medicalHistory && selectedPatient.medicalHistory.length > 0 ? (
                      <div className="flex flex-wrap gap-2">
                        {selectedPatient.medicalHistory.map((hist, i) => (
                          <span key={i} className="bg-canvas-parchment border border-hairline text-ink text-xs font-medium px-3 py-1 rounded-full">
                            • {hist}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-ink-muted-48 italic">No significant prior medical history logged.</p>
                    )}
                  </div>
                </div>

                {/* Patient Demographics & Contact */}
                <div className="bg-canvas border border-hairline p-5 space-y-4" style={{ borderRadius: '18px' }}>
                  <h3 className="text-xs text-ink-muted-48 tracking-widest uppercase border-b border-hairline pb-2.5 font-bold font-sans flex items-center gap-1.5">
                    <User size={14} className="text-primary" /> Patient Demographics & Identity
                  </h3>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                    <div className="p-3 bg-canvas-parchment border border-hairline rounded-xl">
                      <span className="text-[10px] text-ink-muted-48 uppercase font-bold block">Full Name</span>
                      <strong className="text-ink text-sm">{selectedPatient.fullName || selectedPatient.name}</strong>
                    </div>

                    <div className="p-3 bg-canvas-parchment border border-hairline rounded-xl">
                      <span className="text-[10px] text-ink-muted-48 uppercase font-bold block">Patient ID</span>
                      <strong className="text-ink font-mono">{selectedPatient.patientId}</strong>
                    </div>

                    <div className="p-3 bg-canvas-parchment border border-hairline rounded-xl">
                      <span className="text-[10px] text-ink-muted-48 uppercase font-bold block">National UID (Aadhaar)</span>
                      <strong className="text-primary font-mono">{selectedPatient.aadhaarNumber ? selectedPatient.aadhaarNumber.replace(/(\d{4})(\d{4})(\d{4})/, '$1 $2 $3') : 'Not registered'}</strong>
                    </div>

                    <div className="p-3 bg-canvas-parchment border border-hairline rounded-xl">
                      <span className="text-[10px] text-ink-muted-48 uppercase font-bold block">Date of Birth & Age</span>
                      <strong className="text-ink">{selectedPatient.dateOfBirth || selectedPatient.dob} ({selectedPatient.age} Years • {selectedPatient.gender})</strong>
                    </div>

                    <div className="p-3 bg-canvas-parchment border border-hairline rounded-xl">
                      <span className="text-[10px] text-ink-muted-48 uppercase font-bold block">Registered Mobile</span>
                      <a href={`tel:${selectedPatient.phone}`} className="text-primary font-semibold hover:underline font-mono">
                        {selectedPatient.phone}
                      </a>
                    </div>

                    <div className="p-3 bg-canvas-parchment border border-hairline rounded-xl">
                      <span className="text-[10px] text-ink-muted-48 uppercase font-bold block">Blood Group</span>
                      <strong className="text-ink font-bold text-sm">{selectedPatient.bloodGroup}</strong>
                    </div>

                    <div className="p-3 bg-canvas-parchment border border-hairline rounded-xl col-span-1 sm:col-span-2">
                      <span className="text-[10px] text-ink-muted-48 uppercase font-bold block">Residential Address</span>
                      <span className="text-ink">{selectedPatient.address || 'Address not registered'}</span>
                    </div>
                  </div>
                </div>

                {/* Emergency Contact */}
                <div className="bg-canvas border border-hairline p-5 space-y-3" style={{ borderRadius: '18px' }}>
                  <h3 className="text-xs text-ink-muted-48 tracking-widest uppercase border-b border-hairline pb-2.5 font-bold font-sans flex items-center gap-1.5">
                    <PhoneCall size={14} className="text-primary" /> Emergency Contact
                  </h3>
                  
                  {selectedPatient.emergencyContact?.name ? (
                    <div className="flex items-center justify-between p-3.5 bg-canvas-parchment border border-hairline rounded-xl text-xs">
                      <div>
                        <strong className="text-ink block text-sm">{selectedPatient.emergencyContact.name}</strong>
                        <span className="text-ink-muted-48 text-[11px]">Relation: {selectedPatient.emergencyContact.relation || 'Emergency Contact'}</span>
                      </div>
                      <a 
                        href={`tel:${selectedPatient.emergencyContact.phone}`}
                        className="bg-primary text-canvas px-3.5 py-1.5 rounded-full font-semibold hover:bg-primary-focus transition-colors"
                      >
                        Call: {selectedPatient.emergencyContact.phone}
                      </a>
                    </div>
                  ) : (
                    <p className="text-xs text-ink-muted-48 italic">No emergency contact provided.</p>
                  )}
                </div>

                {/* Hospital Bed & Ward Placement */}
                <div className="bg-canvas border border-hairline p-5 space-y-3" style={{ borderRadius: '18px' }}>
                  <span className="text-xs text-ink-muted-48 uppercase font-bold block">Hospital Care & Bed Placement</span>
                  <div className="text-sm font-semibold text-ink">
                    {activeEpisode?.bedAssignment?.bedId 
                      ? `Inpatient Admitted: Location ${activeEpisode.bedAssignment.bedId} (Ward: ${activeEpisode.bedAssignment.wardName || 'Assigned'})`
                      : 'Outpatient Care (No bed assigned)'}
                  </div>
                  <div className="text-xs text-ink-muted-48">
                    Attending Physician: <strong className="text-ink">{selectedPatient.assignedDoctor?.name || user?.name || 'Dr. Assigned'}</strong>
                  </div>
                </div>
              </div>
            )}

            {/* ================= SUB-TAB 3: MEDICATIONS & PRESCRIPTIONS ================= */}
            {patientSubTab === 'medications' && (
              <div className="space-y-5">
                {/* Active Episode Check */}
                {!activeEpisode && (
                  <div className="bg-primary/5 border border-primary/20 p-4 rounded-2xl flex items-center justify-between text-xs">
                    <div>
                      <strong className="text-ink block">Initialize Treatment Episode</strong>
                      <span className="text-ink-muted-48">Activate clinical episode to begin prescribing medications.</span>
                    </div>
                    <button
                      onClick={() => handleToggleAttention(false)}
                      className="bg-primary text-canvas px-4 py-2 rounded-full font-semibold cursor-pointer hover:bg-primary-focus"
                    >
                      Start Episode
                    </button>
                  </div>
                )}

                {/* Medications Cabinet */}
                <div className="bg-canvas border border-hairline p-5" style={{ borderRadius: '18px' }}>
                  <h3 className="text-xs text-ink-muted-48 tracking-widest uppercase border-b border-hairline pb-3 mb-4 font-bold flex items-center gap-1.5">
                    <Pill size={14} className="text-primary" /> Current Active Medications Cabinet
                  </h3>
                  
                  {(!activeEpisode || activeEpisode.prescriptions.length === 0) ? (
                    <p className="text-xs text-ink-muted-48 italic py-2">No active prescriptions registered for this patient.</p>
                  ) : (
                    <div className="space-y-3">
                      {activeEpisode.prescriptions.map((p, i) => (
                        <div key={i} className="bg-canvas-parchment border border-hairline rounded-[14px] p-3.5 text-xs">
                          <div className="flex justify-between items-start">
                            <div className="font-semibold text-ink text-sm">{p.medicine}</div>
                            <span className="text-[10px] bg-primary/10 text-primary border border-primary/20 px-2 py-0.5 rounded-full font-semibold">
                              {p.dosage}
                            </span>
                          </div>
                          <div className="grid grid-cols-3 gap-2 mt-2 font-mono text-[11px] text-ink-muted-80">
                            <div>Dosage: <strong className="text-ink">{p.dosage}</strong></div>
                            <div>Freq: <strong className="text-ink">{p.frequency}</strong></div>
                            <div>Duration: <strong className="text-ink">{p.duration}</strong></div>
                          </div>
                          {p.instructions && (
                            <div className="text-[11px] text-ink-muted-48 mt-1.5 font-sans">
                              Instructions: {p.instructions}
                            </div>
                          )}
                          {p.originalImagePath && (
                            <div className="text-[9px] text-[#1f8a65] font-semibold mt-2.5">
                              ✓ TRANSCRIPTION DIGITIZED VIA TENSORFLOW OCR
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Prescription Digitizer Toggle trigger */}
                {activeEpisode && (
                  <div className="space-y-4">
                    <div className="flex justify-between items-center bg-canvas border border-hairline p-4" style={{ borderRadius: '18px' }}>
                      <div>
                        <h4 className="text-sm font-semibold text-ink flex items-center gap-1.5">
                          <FileText size={14} className="text-primary" /> Digitizer OCR Transcription
                        </h4>
                        <p className="text-xs text-ink-muted-48 mt-0.5">Digitize handwritten doctor slips to automatically log medicines.</p>
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
                )}

                {/* Write Clinical Prescription Form */}
                {activeEpisode && (
                  <div className="bg-canvas border border-hairline p-5" style={{ borderRadius: '18px' }}>
                    <h3 className="text-xs text-ink-muted-48 tracking-widest uppercase border-b border-hairline pb-3 mb-4 font-bold">
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
                          className="text-xs rounded-full bg-canvas-parchment px-3 py-2.5 col-span-2 border border-hairline"
                          style={{ borderRadius: '20px' }}
                        />
                        <input 
                          type="text" placeholder="Dosage (e.g. 500 mg)" required
                          value={rxForm.dosage} onChange={e => setRxForm({ ...rxForm, dosage: e.target.value })}
                          className="text-xs rounded-full bg-canvas-parchment px-3 py-2.5 border border-hairline"
                          style={{ borderRadius: '20px' }}
                        />
                        <input 
                          type="text" placeholder="Frequency (e.g. 1-0-1)" required
                          value={rxForm.frequency} onChange={e => setRxForm({ ...rxForm, frequency: e.target.value })}
                          className="text-xs rounded-full bg-canvas-parchment px-3 py-2.5 border border-hairline"
                          style={{ borderRadius: '20px' }}
                        />
                        <input 
                          type="text" placeholder="Duration (e.g. 5 days)" required
                          value={rxForm.duration} onChange={e => setRxForm({ ...rxForm, duration: e.target.value })}
                          className="text-xs rounded-full bg-canvas-parchment px-3 py-2.5 border border-hairline"
                          style={{ borderRadius: '20px' }}
                        />
                        <input 
                          type="text" placeholder="Instructions (e.g. Post Meal)"
                          value={rxForm.instructions} onChange={e => setRxForm({ ...rxForm, instructions: e.target.value })}
                          className="text-xs rounded-full bg-canvas-parchment px-3 py-2.5 border border-hairline col-span-2"
                          style={{ borderRadius: '20px' }}
                        />
                      </div>
                      <button
                        type="submit"
                        className="w-full bg-primary hover:bg-primary-focus text-canvas text-xs font-semibold py-3 rounded-full transition-colors uppercase cursor-pointer"
                        style={{ borderRadius: '20px' }}
                      >
                        Commit Prescription
                      </button>
                    </form>
                  </div>
                )}
              </div>
            )}

            {/* ================= SUB-TAB 4: CLINICAL NOTES & DIAGNOSTICS ================= */}
            {patientSubTab === 'clinical' && (
              <div className="space-y-5">
                {/* Direct attention line toggler */}
                <div className="bg-canvas border border-hairline p-4 flex items-center justify-between" style={{ borderRadius: '18px' }}>
                  <div>
                    <h4 className="text-sm font-semibold text-ink flex items-center gap-1.5">
                      <PhoneCall size={14} className="text-primary" /> Requires Attention Direct Call Line
                    </h4>
                    <p className="text-xs text-ink-muted-48 mt-0.5 leading-relaxed">Unlocks priority call channel coordinates on the Patient PWA.</p>
                  </div>
                  <input
                    type="checkbox"
                    checked={Boolean(activeEpisode?.requiresAttention)}
                    onChange={(e) => handleToggleAttention(e.target.checked)}
                    className="w-5 h-5 accent-primary cursor-pointer border-hairline"
                  />
                </div>

                {/* Consultation & Diagnoses History */}
                <div className="bg-canvas border border-hairline p-5" style={{ borderRadius: '18px' }}>
                  <h3 className="text-xs text-ink-muted-48 tracking-widest uppercase border-b border-hairline pb-3 mb-4 font-bold flex items-center gap-1.5">
                    <ClipboardList size={14} className="text-primary" /> Assessments & Clinical Diagnosis Logs
                  </h3>
                  
                  {(!activeEpisode || activeEpisode.consultations.length === 0) ? (
                    <p className="text-xs text-ink-muted-48 italic py-2">No diagnosis reports recorded for this episode.</p>
                  ) : (
                    <div className="space-y-3 mb-4">
                      {activeEpisode.consultations.map((c, i) => (
                        <div key={i} className="text-xs border-b border-hairline pb-2.5 last:border-b-0">
                          <div className="font-semibold text-ink text-sm">Diagnosis: {c.diagnosis}</div>
                          <div className="text-ink-muted-80 mt-1">Notes: {c.notes}</div>
                          <div className="text-[10px] text-ink-muted-48 mt-1 font-mono">
                            Logged: {new Date(c.date).toLocaleString()}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Add Consultation inline form */}
                  {activeEpisode && (
                    <form onSubmit={handleAddConsultation} className="border-t border-hairline pt-4 space-y-3">
                      <span className="text-xs text-ink block font-semibold uppercase">Add Assessment Entry</span>
                      <div>
                        <input 
                          type="text" required placeholder="Diagnosis Label (e.g. Unstable Angina)"
                          value={consForm.diagnosis} onChange={e => setConsForm({ ...consForm, diagnosis: e.target.value })}
                          className="w-full text-xs rounded-full bg-canvas-parchment px-4 py-2.5 border border-hairline"
                        />
                      </div>
                      <div>
                        <textarea 
                          required placeholder="Clinical assessment notes..."
                          value={consForm.notes} onChange={e => setConsForm({ ...consForm, notes: e.target.value })}
                          className="w-full text-xs h-20 rounded-[14px] bg-canvas-parchment p-3 border border-hairline"
                        />
                      </div>
                      <button
                        type="submit" disabled={addingCons}
                        className="w-full bg-ink hover:bg-ink-muted-80 text-canvas text-xs font-semibold py-2.5 rounded-full transition-colors uppercase cursor-pointer"
                      >
                        {addingCons ? 'Saving...' : 'Log Assessment Entry'}
                      </button>
                    </form>
                  )}
                </div>

                {/* Investigations request */}
                <div className="bg-canvas border border-hairline p-5" style={{ borderRadius: '18px' }}>
                  <h3 className="text-xs text-ink-muted-48 tracking-widest uppercase border-b border-hairline pb-3 mb-4 font-bold flex items-center gap-1.5">
                    <Activity size={14} className="text-primary" /> Lab Investigations & Diagnostics
                  </h3>
                  
                  {(!activeEpisode || activeEpisode.tests.length === 0) ? (
                    <p className="text-xs text-ink-muted-48 italic py-2">No diagnostic test reports ordered.</p>
                  ) : (
                    <div className="space-y-2 mb-4 text-xs">
                      {activeEpisode.tests.map((tItem, i) => (
                        <div key={i} className="flex justify-between items-center py-2.5 border-b border-hairline last:border-b-0">
                          <div>
                            <span className="font-semibold text-ink">{tItem.name}</span>
                            {tItem.result && <span className="block text-[11px] text-ink-muted-85 mt-1 leading-relaxed font-mono">Result: {tItem.result}</span>}
                          </div>
                          <span className={`text-[9px] uppercase font-bold px-2.5 py-0.5 rounded-full ${
                            tItem.status === 'COMPLETED' ? 'bg-green-100 text-[#1f8a65]' : 'bg-yellow-100 text-amber-700'
                          }`}>
                            {tItem.status}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}

                  {activeEpisode && (
                    <form onSubmit={handleAddTest} className="border-t border-hairline pt-4 flex gap-2">
                      <input 
                        type="text" required placeholder="Lab Test Name (e.g. Lipase Test, Lipid Profile)"
                        value={testName} onChange={e => setTestName(e.target.value)}
                        className="flex-grow text-xs rounded-full bg-canvas-parchment px-4 py-2.5 border border-hairline"
                      />
                      <button
                        type="submit"
                        className="bg-ink hover:bg-ink-muted-80 text-canvas text-xs font-semibold px-5 rounded-full transition-colors uppercase cursor-pointer shrink-0"
                      >
                        Order Test
                      </button>
                    </form>
                  )}
                </div>
              </div>
            )}

            {/* ================= SUB-TAB 5: TIMELINE & COORDINATION ================= */}
            {patientSubTab === 'timeline' && (
              <div className="space-y-5">
                {/* Chat communications */}
                {activeEpisode && (
                  <div className="bg-canvas border border-hairline p-5" style={{ borderRadius: '18px' }}>
                    <h3 className="text-xs text-ink-muted-48 tracking-widest uppercase border-b border-hairline pb-3 mb-4 font-bold flex items-center gap-1.5">
                      <MessageSquare size={14} className="text-primary" /> Episode Chat Coordinator
                    </h3>
                    
                    <div className="space-y-2 max-h-56 overflow-y-auto mb-4 bg-canvas-parchment border border-hairline p-3 rounded-[14px]">
                      {activeEpisode.messages.length === 0 ? (
                        <p className="text-xs text-ink-muted-48 italic text-center py-4">No coordination messages logged.</p>
                      ) : (
                        activeEpisode.messages.map((m, i) => (
                          <div 
                            key={i} 
                            className={`p-2.5 rounded-[12px] text-xs max-w-[85%] ${
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
                        className="flex-grow text-xs rounded-full bg-canvas-parchment px-4 py-2.5 border border-hairline"
                      />
                      <button
                        type="submit"
                        className="bg-primary hover:bg-primary-focus text-canvas text-xs font-semibold px-5 rounded-full transition-colors uppercase cursor-pointer shrink-0"
                      >
                        Send
                      </button>
                    </form>
                  </div>
                )}

                {/* Patient Treatment Timeline */}
                <div className="bg-canvas border border-hairline p-5 space-y-4" style={{ borderRadius: '18px' }}>
                  <h3 className="text-xs text-ink-muted-48 tracking-widest uppercase border-b border-hairline pb-3 mb-2 font-bold font-sans flex items-center gap-1.5">
                    <History size={14} className="text-primary" /> Treatment Event Timeline
                  </h3>
                  <div className="max-h-56 overflow-y-auto space-y-3.5 pr-1 text-xs">
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
                {activeEpisode && (
                  <div className="bg-canvas border border-hairline p-4 flex justify-between items-center" style={{ borderRadius: '18px' }}>
                    <div>
                      <h4 className="text-sm font-semibold text-ink">Discharge Inpatient</h4>
                      <p className="text-xs text-ink-muted-48 mt-0.5">Stops clinical communications and releases bed assignment.</p>
                    </div>
                    <button
                      onClick={handleDischargePatient}
                      className="bg-primary hover:bg-primary-focus text-canvas text-xs font-semibold py-2.5 px-4 rounded-full transition-colors uppercase cursor-pointer"
                    >
                      Discharge
                    </button>
                  </div>
                )}
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

      {/* Doctor Complete Surgery Modal */}
      {doctorCompleteModal.open && doctorCompleteModal.surgery && (
        <div className="fixed inset-0 bg-black/60 z-[100] flex justify-center items-center p-4 backdrop-blur-sm">
          <div className="bg-white border border-hairline p-5 max-w-sm w-full rounded-3xl shadow-2xl space-y-4">
            <div className="flex justify-between items-start">
              <div>
                <div className="flex items-center gap-1.5">
                  <CheckCircle2 size={16} className="text-emerald-600" />
                  <h3 className="text-sm font-bold text-ink uppercase tracking-wider">Mark Surgery Complete</h3>
                </div>
                <p className="text-xs text-ink-muted-48 mt-0.5">{doctorCompleteModal.surgery.procedure}</p>
              </div>
              <button
                type="button"
                onClick={() => setDoctorCompleteModal({ open: false, surgery: null, outcome: 'Successful', notes: '', durationMinutes: 60 })}
                className="text-ink-muted-48 hover:text-ink text-xs font-bold bg-canvas-parchment border border-hairline px-2 py-0.5 rounded-full cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleDoctorCompleteSurgery} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-ink uppercase mb-1">Outcome</label>
                <select
                  value={doctorCompleteModal.outcome}
                  onChange={e => setDoctorCompleteModal({ ...doctorCompleteModal, outcome: e.target.value })}
                  className="w-full text-xs h-9 px-3 rounded-full border border-hairline bg-canvas"
                  style={{ borderRadius: '20px' }}
                >
                  <option value="Successful">Successful</option>
                  <option value="Successful with minor complications">Minor Complications</option>
                  <option value="Transferred to ICU post-op">Transferred to ICU</option>
                  <option value="Partial procedure completed">Partial Procedure</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-ink uppercase mb-1">Duration (Minutes)</label>
                <input
                  type="number"
                  min="5"
                  max="1440"
                  value={doctorCompleteModal.durationMinutes}
                  onChange={e => setDoctorCompleteModal({ ...doctorCompleteModal, durationMinutes: parseInt(e.target.value) || 60 })}
                  className="w-full text-xs px-3 py-1.5 rounded-full border border-hairline bg-canvas"
                  style={{ borderRadius: '20px' }}
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-ink uppercase mb-1">Operative Notes</label>
                <textarea
                  rows="2"
                  value={doctorCompleteModal.notes}
                  onChange={e => setDoctorCompleteModal({ ...doctorCompleteModal, notes: e.target.value })}
                  placeholder="Intra-operative notes..."
                  className="w-full text-xs p-2.5 rounded-xl border border-hairline bg-canvas font-mono"
                  style={{ borderRadius: '12px' }}
                />
              </div>

              <div className="flex justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setDoctorCompleteModal({ open: false, surgery: null, outcome: 'Successful', notes: '', durationMinutes: 60 })}
                  className="px-3.5 py-1.5 text-xs font-semibold rounded-full border border-hairline hover:bg-canvas-parchment cursor-pointer text-ink"
                  style={{ borderRadius: '20px' }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingSurgAction}
                  className="px-4 py-1.5 text-xs font-bold rounded-full bg-[#0066cc] hover:bg-[#0055b3] text-white shadow-sm cursor-pointer disabled:opacity-50"
                  style={{ borderRadius: '20px' }}
                >
                  {submittingSurgAction ? 'Saving...' : 'Confirm Complete'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Doctor Cancel Surgery Modal */}
      {doctorCancelModal.open && doctorCancelModal.surgery && (
        <div className="fixed inset-0 bg-black/60 z-[100] flex justify-center items-center p-4 backdrop-blur-sm">
          <div className="bg-white border border-hairline p-5 max-w-sm w-full rounded-3xl shadow-2xl space-y-4">
            <div className="flex justify-between items-start">
              <div>
                <div className="flex items-center gap-1.5">
                  <XCircle size={16} className="text-[#cf2d56]" />
                  <h3 className="text-sm font-bold text-ink uppercase tracking-wider">Cancel Surgery</h3>
                </div>
                <p className="text-xs text-ink-muted-48 mt-0.5">{doctorCancelModal.surgery.procedure}</p>
              </div>
              <button
                type="button"
                onClick={() => setDoctorCancelModal({ open: false, surgery: null, reason: 'Patient hemodynamically unstable' })}
                className="text-ink-muted-48 hover:text-ink text-xs font-bold bg-canvas-parchment border border-hairline px-2 py-0.5 rounded-full cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleDoctorCancelSurgery} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-ink uppercase mb-1">Reason</label>
                <select
                  value={doctorCancelModal.reason}
                  onChange={e => setDoctorCancelModal({ ...doctorCancelModal, reason: e.target.value })}
                  className="w-full text-xs h-9 px-3 rounded-full border border-hairline bg-canvas"
                  style={{ borderRadius: '20px' }}
                >
                  <option value="Patient hemodynamically unstable">Patient hemodynamically unstable</option>
                  <option value="Emergency surgical rescheduling">Emergency rescheduling</option>
                  <option value="Pre-op diagnostic anomaly">Pre-op diagnostic anomaly</option>
                  <option value="Patient / Family requested postponement">Patient requested postponement</option>
                  <option value="Other clinical rationale">Other clinical rationale</option>
                </select>
              </div>

              <div className="flex justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setDoctorCancelModal({ open: false, surgery: null, reason: 'Patient hemodynamically unstable' })}
                  className="px-3.5 py-1.5 text-xs font-semibold rounded-full border border-hairline hover:bg-canvas-parchment cursor-pointer text-ink"
                  style={{ borderRadius: '20px' }}
                >
                  Keep
                </button>
                <button
                  type="submit"
                  disabled={submittingSurgAction}
                  className="px-4 py-1.5 text-xs font-bold rounded-full bg-[#cf2d56] hover:bg-[#b02245] text-white shadow-sm cursor-pointer disabled:opacity-50"
                  style={{ borderRadius: '20px' }}
                >
                  {submittingSurgAction ? 'Cancelling...' : 'Confirm Cancel'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <ServerConfigModal 
        isOpen={showServerModal} 
        onClose={() => setShowServerModal(false)} 
        addToast={addToast} 
      />

    </div>
  );
}

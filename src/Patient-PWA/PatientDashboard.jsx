import React, { useState, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { api, getFileUrl } from '../utils/api';
import QRCode from 'qrcode';
import ServerConfigModal from '../components/ServerConfigModal';
import MyDocumentsPanel from './components/MyDocumentsPanel';
import { 
  User, Calendar, CreditCard, ChevronRight, Activity, 
  MapPin, ShieldAlert, Phone, Ambulance, MessageSquare, Info,
  Check, Receipt, Smartphone, Download, Trash2, FileText, AlertCircle, UploadCloud, Server
} from 'lucide-react';

export default function PatientDashboard() {
  const { 
    user, login, logout, exitApp, t, language, setLanguage, 
    patientEpisode, patientProfile, addToast, refreshData, patientDocuments, doctors 
  } = useApp();

  const [activeTab, setActiveTabState] = useState(() => {
    return localStorage.getItem('halo_patient_active_tab') || 'journey';
  });
  const setActiveTab = (tab) => {
    setActiveTabState(tab);
    localStorage.setItem('halo_patient_active_tab', tab);
  };
  const [qrBlob, setQrBlob] = useState('');

  // Local state for credentials login form
  const [loginForm, setLoginForm] = useState({ phone: '', id: '' });
  const [loggingIn, setLoggingIn] = useState(false);

  const handleLoginSubmit = async (e) => {
    e.preventDefault();
    if (!loginForm.phone || !loginForm.id) return;
    setLoggingIn(true);
    try {
      const phoneFormatted = loginForm.phone.startsWith('+') ? loginForm.phone : `+91${loginForm.phone.trim()}`;
      await login('PATIENT', { ...loginForm, phone: phoneFormatted });
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

  // Patient Document Upload & Management State
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [uploadDocForm, setUploadDocForm] = useState({ title: '', type: 'LAB_REPORT' });
  const [selectedUploadFile, setSelectedUploadFile] = useState(null);
  const [uploadingDoc, setUploadingDoc] = useState(false);
  const [downloadingDocId, setDownloadingDocId] = useState(null);
  const [deletingDocId, setDeletingDocId] = useState(null);
  const [showServerModal, setShowServerModal] = useState(false);

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
        addToast('Installing Patient PWA natively...', 'success');
      }
      setDeferredPrompt(null);
    } else {
      addToast(
        "To install natively on iOS: Tap Safari Share button (⬆️), then tap 'Add to Home Screen' (➕). On Android: Tap Chrome menu (⋮) -> 'Install App'.",
        "info"
      );
    }
  };
  
  // Ambulance request form
  const [ambForm, setAmbForm] = useState({ condition: '', location: '', phone: user?.phone || '' });
  const [ambRequest, setAmbRequest] = useState(null);
  const [submittingAmb, setSubmittingAmb] = useState(false);

  // Chat message details
  const [chatMessage, setChatMessage] = useState('');

  // Dynamic manifest registration for standalone Patient PWA mode
  useEffect(() => {
    let link = document.querySelector('link[rel="manifest"]');
    if (!link) {
      link = document.createElement('link');
      link.rel = 'manifest';
      document.head.appendChild(link);
    }
    link.href = '/manifest-patient.json';

    let appleTitle = document.querySelector('meta[name="apple-mobile-web-app-title"]');
    if (appleTitle) {
      appleTitle.setAttribute('content', 'HALO Patient');
    }
  }, []);

  // Generate QR code for digital card
  useEffect(() => {
    if (patientProfile?.qrCodeToken) {
      QRCode.toDataURL(patientProfile.qrCodeToken)
        .then(url => setQrBlob(url))
        .catch(err => console.error('QR generation error:', err));
    }
  }, [patientProfile?.qrCodeToken]);

  // Load patient active ambulance request if exists
  useEffect(() => {
    async function loadAmbulance() {
      if (!user) return;
      try {
        const list = await api.get('/ambulance');
        const myActive = list.reverse().find(a => a.patientId === patientProfile?.patientId);
        setAmbRequest(myActive || null);
      } catch (_) {}
    }
    loadAmbulance();
  }, [patientProfile?.patientId, activeTab]);

  const handleRequestAmbulance = async (e) => {
    e.preventDefault();
    if (!ambForm.condition || !ambForm.location || !ambForm.phone) return;
    setSubmittingAmb(true);
    try {
      const req = await api.post('/ambulance/request', {
        condition: ambForm.condition,
        location: ambForm.location,
        phone: ambForm.phone
      });
      setAmbRequest(req);
      addToast('Emergency dispatch request posted. Dispatching ambulance.', 'success');
      setAmbForm({ condition: '', location: '', phone: user?.phone || '' });
      refreshData();
    } catch (err) {
      addToast(err.message, 'error');
    } finally {
      setSubmittingAmb(false);
    }
  };

  const handleSendChatMessage = async (e) => {
    e.preventDefault();
    if (!chatMessage.trim() || !patientEpisode) return;
    try {
      const updated = await api.put(`/episodes/${patientEpisode.episodeId}`, {
        message: {
          sender: 'PATIENT',
          text: chatMessage.trim()
        }
      });
      setChatMessage('');
      refreshData();
    } catch (err) {
      addToast(err.message, 'error');
    }
  };

  const getJourneyStage = () => {
    if (!patientEpisode) return 0; // Registration
    if (patientEpisode.status === 'COMPLETED') return 6; // Discharge
    
    if (patientEpisode.surgeries && patientEpisode.surgeries.some(s => s.status !== 'Completed')) return 5; // Surgery
    if (patientEpisode.bedAssignment && patientEpisode.bedAssignment.bedId) {
      return 4; // Admission
    }
    if (patientEpisode.tests && patientEpisode.tests.length > 0) return 2; // Tests
    if (patientEpisode.consultations && patientEpisode.consultations.length > 0) return 1; // Consultation
    return 3; // Treatment plan
  };

  const currentStage = getJourneyStage();
  const stages = [
    { label: t('registration'), key: 'registration' },
    { label: t('consultation'), key: 'consultation' },
    { label: t('tests'), key: 'tests' },
    { label: t('treatment'), key: 'treatment' },
    { label: t('admission'), key: 'admission' },
    { label: t('surgery'), key: 'surgery' },
    { label: t('discharge'), key: 'discharge' }
  ];

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
            This patient application is restricted to native standalone execution to ensure secure, sandboxed health card access. It cannot be run inside standard browser tabs.
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

  if (!user || user.role !== 'PATIENT') {
    return (
      <div className="pwa-container min-h-screen bg-canvas-parchment flex flex-col justify-center items-center p-6 font-sans">
        <div className="w-full max-w-sm bg-canvas border border-hairline p-8 flex flex-col apple-product-shadow" style={{ borderRadius: '24px' }}>
          <div className="flex flex-col items-center text-center space-y-2 mb-6">
            <div className="w-14 h-14 bg-primary/10 rounded-full flex items-center justify-center text-primary">
              <Activity size={28} />
            </div>
            <h2 className="text-xl font-bold text-ink">Patient Health Portal</h2>
            <p className="text-xs text-ink-muted-48">Sign in with your registered mobile number & unique Patient ID.</p>
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
                  placeholder="9876543210" 
                  value={loginForm.phone}
                  onChange={e => setLoginForm(prev => ({ ...prev, phone: e.target.value }))}
                  className="w-full px-3 py-3 text-xs bg-transparent focus:outline-none transition-all shadow-none border-none"
                  required
                />
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-[10px] text-ink-muted-48 uppercase font-bold tracking-widest block">Unique Patient ID</label>
              <input 
                type="text" 
                placeholder="HALO-PAT-XX-XXXX" 
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
            <span className="text-[9px] text-ink-muted-48 uppercase tracking-wider block font-sans">SECURE PATIENT GATEWAY • ENCRYPTED</span>
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
          <span className="w-5 h-5 bg-primary rounded-full flex items-center justify-center text-canvas">
            <Activity size={11} strokeWidth={3} />
          </span>
          <span className="text-ink text-sm font-semibold tracking-tight uppercase">HALO Care</span>
        </div>
        
        {/* Language select dropdown & Server Settings & Exit */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setShowServerModal(true)}
            className="p-1.5 rounded-full text-ink-muted-48 hover:text-primary hover:bg-canvas-parchment cursor-pointer transition-colors"
            title="Configure Server Host"
          >
            <Server size={15} />
          </button>
          <select 
            value={language} 
            onChange={(e) => setLanguage(e.target.value)} 
            className="bg-canvas border border-hairline rounded-full px-2 py-0.5 text-[9px] text-ink font-semibold outline-none cursor-pointer hover:border-hairline-strong transition-all"
            style={{ borderRadius: '20px' }}
          >
            <option value="en">EN</option>
            <option value="hi">HI</option>
            <option value="bn">BN</option>
            <option value="ta">TM</option>
          </select>
          <button 
            onClick={logout} 
            className="text-[10px] uppercase font-bold text-ink hover:text-primary transition-colors cursor-pointer border border-hairline hover:border-primary px-2.5 py-1 rounded-full animate-all"
            title="Logout of credentials"
          >
            Logout
          </button>
          <button 
            onClick={exitApp} 
            className="text-[10px] uppercase font-bold text-white bg-[#cf2d56] hover:bg-[#b02244] transition-colors cursor-pointer px-2.5 py-1 rounded-full animate-all"
            title="Exit standalone application"
          >
            Exit
          </button>
        </div>
      </header>

      {/* Main Container Area */}
      <main className="flex-grow overflow-y-auto p-4 pb-20">
        
        {/* Inactive Profile Warning Banner */}
        {patientProfile && patientProfile.status === 'INACTIVE' && (
          <div className="bg-[#cf2d56]/10 border border-[#cf2d56]/20 p-3.5 rounded-[16px] mb-4 flex items-start gap-2.5 text-xs text-[#cf2d56]">
            <ShieldAlert size={18} className="shrink-0 mt-0.5" />
            <div>
              <strong className="block font-semibold">Profile Status: INACTIVE (Archived)</strong>
              <span className="text-[10px] text-ink-muted-48 leading-relaxed block mt-0.5">
                Your medical record is currently archived/deactivated in the hospital registry. You can still view your digital card, medical history, and clinical file logs, but active treatment rounds or consult features are disabled.
              </span>
            </div>
          </div>
        )}
        
        {/* Profile Card Header */}
        {patientProfile && (
          <div 
            className="bg-canvas border border-hairline p-4 mb-6 flex justify-between items-center"
            style={{ borderRadius: '18px' }} // rounded.lg
          >
            <div>
              <span className="text-[9px] text-ink-muted-48 uppercase tracking-widest font-bold">{t('patientDashboard')}</span>
              <h2 className="text-base font-semibold text-ink leading-tight mt-0.5">{patientProfile.name}</h2>
              <div className="text-[10px] text-ink-muted-48 mt-0.5 font-mono">
                ID: {patientProfile.patientId}
              </div>
            </div>
            <div className="text-right">
              <span className="text-[9px] text-ink-muted-48 uppercase tracking-widest block font-bold">{t('bedLocation')}</span>
              <span className="text-xs font-semibold text-ink block mt-0.5">
                {patientEpisode?.bedAssignment?.bedId || t('notAdmitted')}
              </span>
            </div>
          </div>
        )}

        {/* Native PWA Installation Banner (Hidden if already running as standalone native app) */}
        {!isStandalone && (
          <div className="bg-primary/10 border border-primary/20 p-3.5 rounded-[16px] mb-4 flex items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-2.5 text-ink">
              <Smartphone size={20} className="text-primary shrink-0" />
              <div>
                <strong className="block font-semibold text-ink">Install Patient Native App</strong>
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

        {/* ==================== 1. TREATMENT JOURNEY TAB ==================== */}
        {activeTab === 'journey' && (
          <div className="space-y-6">
            <div>
              <h1 className="text-xl font-semibold text-ink leading-tight tracking-tight">{t('treatmentJourney')}</h1>
              <p className="text-xs text-ink-muted-48 mt-1">Track your connected clinical roadmap timeline in real-time.</p>
            </div>

            {/* Current Care block */}
            <div className="bg-canvas border border-hairline p-5 space-y-3" style={{ borderRadius: '18px' }}>
              <h3 className="text-xs text-ink-muted-48 tracking-widest uppercase border-b border-hairline pb-2 font-bold">
                Current Care Assignment
              </h3>
              <div className="grid grid-cols-2 gap-3 text-xs">
                <div>
                  <span className="text-ink-muted-48 block">Assigned Doctor</span>
                  <strong className="text-ink text-sm block mt-0.5">{patientProfile?.assignedDoctor?.name || 'Awaiting doctor assignment'}</strong>
                </div>
                <div>
                  <span className="text-ink-muted-48 block">Clinical Department</span>
                  <strong className="text-ink text-sm block mt-0.5">{patientProfile?.department || 'Outpatient Services'}</strong>
                </div>
                <div>
                  <span className="text-ink-muted-48 block">Current Bed location</span>
                  <strong className="text-ink text-sm block mt-0.5">{patientProfile?.currentBed || 'Not Admitted (Outpatient)'}</strong>
                </div>
                <div>
                  <span className="text-ink-muted-48 block">Care Status / Phase</span>
                  <strong className="text-primary text-sm uppercase block mt-0.5 font-mono">{patientEpisode?.currentStage || patientProfile?.status || 'Active'}</strong>
                </div>
              </div>
            </div>

            {/* Appointments & Follow-ups Section */}
            <div className="bg-canvas border border-hairline p-5 space-y-4" style={{ borderRadius: '18px' }}>
              <h3 className="text-xs text-ink font-semibold uppercase flex items-center gap-1.5 border-b border-hairline pb-3">
                <Calendar size={14} className="text-primary" /> Appointments & Follow-ups
              </h3>
              {patientProfile?.assignedDoctor ? (
                <div className="space-y-3">
                  <div className="bg-canvas border border-hairline rounded-[11px] p-3 text-xs space-y-2 text-ink-muted-85">
                    <div className="flex justify-between items-center">
                      <span className="font-semibold text-ink text-sm">Clinical Checkup & Review</span>
                      <span className="text-[9px] bg-primary/10 text-primary border border-primary/20 px-2 py-0.5 rounded-full font-semibold uppercase">Scheduled</span>
                    </div>
                    <div>Doctor: <strong className="text-ink">{patientProfile.assignedDoctor.name}</strong></div>
                    <div className="flex justify-between">
                      <div>Date/Time: <strong className="text-primary">Tomorrow, 10:00 AM</strong></div>
                      <div>Location: <strong className="text-ink">OPD Room 104</strong></div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="text-xs text-ink-muted-48 italic py-2 text-center">No upcoming appointments scheduled.</div>
              )}
            </div>

            {/* Vertical Journeys Timeline */}
            <div 
              className="bg-canvas border border-hairline p-5"
              style={{ borderRadius: '18px' }}
            >
              <div className="relative pl-6 space-y-6">
                
                {/* Timeline vertical guideline */}
                <div className="absolute left-2.5 top-2 bottom-2 w-0.5 bg-divider-soft" />

                {stages.map((stage, index) => {
                  const isActive = index === currentStage;
                  const isPassed = index < currentStage;
                  return (
                    <div key={stage.key} className="relative flex items-start gap-4">
                      {/* Timeline dot */}
                      <div className={`absolute -left-6 w-5 h-5 rounded-full border flex items-center justify-center text-[10px] font-semibold ${
                        isActive 
                          ? 'bg-primary border-primary text-canvas'
                          : isPassed
                          ? 'bg-ink border-ink text-canvas'
                          : 'bg-canvas border-hairline text-ink-muted-48'
                      }`}>
                        {isPassed ? <Check size={10} strokeWidth={3} /> : index + 1}
                      </div>

                      <div className="flex-grow">
                        <h4 className={`text-sm font-semibold ${isActive ? 'text-primary' : isPassed ? 'text-ink' : 'text-ink-muted-48'}`}>
                          {stage.label}
                        </h4>
                        {isActive && (
                          <div className="mt-2 text-xs text-ink leading-relaxed bg-canvas-parchment border border-hairline p-3 rounded-[11px]">
                            {stage.key === 'registration' && 'Registered successfully. Awaiting initial clinical diagnostics checkup.'}
                            {stage.key === 'consultation' && 'Primary consultant review is active. Accessing diagnosis metrics.'}
                            {stage.key === 'tests' && 'Diagnostic lab investigation tests ordered. Check cabinet files.'}
                            {stage.key === 'treatment' && 'Medications cabinet active. Checking pharmacological prescriptions.'}
                            {stage.key === 'admission' && `Inpatient admission authorized. Admitted to ward bed ${patientEpisode?.bedAssignment?.bedId}.`}
                            {stage.key === 'surgery' && `Surgeries booked: ${patientEpisode?.surgeries?.[0]?.procedure || 'OT Operations schedule active.'}`}
                            {stage.key === 'discharge' && `Care episode complete. Summary: ${patientEpisode?.dischargeSummary || 'Released in stable condition.'}`}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

              {/* Daily Medicine Reminders */}
              <div 
                className="bg-canvas border border-hairline p-5 space-y-4"
                style={{ borderRadius: '18px' }}
              >
                <h3 className="text-xs text-ink-muted-48 tracking-widest uppercase border-b border-hairline pb-3 mb-2 font-bold font-sans">
                  {t('medicineReminders')}
                </h3>

                {patientEpisode && patientEpisode.reminders && patientEpisode.reminders.length > 0 ? (
                  (() => {
                    const todayStr = new Date().toISOString().split('T')[0];
                    const todayReminders = patientEpisode.reminders.filter(r => r.dateString === todayStr);
                    
                    if (todayReminders.length === 0) {
                      return <div className="text-xs text-ink-muted-48 italic py-2 text-center">No reminders scheduled for today.</div>;
                    }

                    return (
                      <div className="space-y-3">
                        {todayReminders.map((r, i) => (
                          <div key={i} className="flex justify-between items-center bg-canvas border border-hairline p-3.5 rounded-[11px] text-xs">
                            <div>
                              <strong className="text-ink text-sm block">{r.medicine}</strong>
                              <div className="text-[10px] text-ink-muted-48 mt-1 uppercase font-mono tracking-wider">
                                Time: {r.timeOfDay} • Dosage: {r.dosage}
                              </div>
                            </div>
                            
                            <div className="flex gap-2">
                              {r.status === 'PENDING' ? (
                                <>
                                  <button
                                    onClick={async () => {
                                      try {
                                        await api.put(`/episodes/${patientEpisode.episodeId}`, {
                                          reminderAction: { reminderId: r._id, status: 'TAKEN' }
                                        });
                                        addToast('Dose recorded as Taken!', 'success');
                                        refreshData();
                                      } catch (err) {
                                        addToast(err.message, 'error');
                                      }
                                    }}
                                    className="text-[10px] bg-[#1f8a65] hover:bg-[#1a7455] text-canvas font-bold px-3 py-1.5 rounded-full cursor-pointer uppercase"
                                    style={{ borderRadius: '20px' }}
                                  >
                                    Take
                                  </button>
                                  <button
                                    onClick={async () => {
                                      try {
                                        await api.put(`/episodes/${patientEpisode.episodeId}`, {
                                          reminderAction: { reminderId: r._id, status: 'SKIPPED' }
                                        });
                                        addToast('Dose recorded as Skipped!', 'warning');
                                        refreshData();
                                      } catch (err) {
                                        addToast(err.message, 'error');
                                      }
                                    }}
                                    className="text-[10px] border border-hairline hover:bg-canvas-parchment text-ink-muted-85 font-bold px-3 py-1.5 rounded-full cursor-pointer uppercase"
                                    style={{ borderRadius: '20px' }}
                                  >
                                    Skip
                                  </button>
                                </>
                              ) : (
                                <span 
                                  className={`text-[10px] font-bold uppercase px-3 py-1.5 rounded-full ${r.status === 'TAKEN' ? 'bg-green-100 text-[#1f8a65]' : 'bg-red-100 text-[#cf2d56]'}`}
                                  style={{ borderRadius: '20px' }}
                                >
                                  {r.status}
                                </span>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    );
                  })()
                ) : (
                  <div className="text-xs text-ink-muted-48 italic py-2 text-center">No active medicine reminders loaded.</div>
                )}
              </div>

            </div>
        )}

        {/* ==================== 2. DIGITAL CARD TAB ==================== */}
        {activeTab === 'card' && patientProfile && (
          <div className="space-y-6">
            <div>
              <h1 className="text-xl font-semibold text-ink leading-tight tracking-tight">{t('patientCard')}</h1>
              <p className="text-xs text-ink-muted-48 mt-1">Secure digital identity card containing clinical identifier barcodes.</p>
            </div>

            {/* Print card (with exactly ONE drop shadow) */}
            <div 
              className="bg-canvas border border-hairline p-6 flex flex-col justify-between h-96 apple-product-shadow"
              style={{ borderRadius: '18px' }} // rounded.lg
            >
              <div className="flex justify-between items-start border-b border-hairline pb-4">
                <div>
                  <h4 className="text-base font-semibold text-ink">{patientProfile.name}</h4>
                  <span className="text-xs text-ink-muted-48 block mt-1 font-mono">{patientProfile.patientId}</span>
                  <span className="text-[11px] text-primary block mt-0.5 font-mono">UID: {patientProfile.aadhaarNumber ? patientProfile.aadhaarNumber.replace(/(\d{4})(\d{4})(\d{4})/, '$1 $2 $3') : '2345 6789 0123'}</span>
                </div>
                <span className="text-xs text-canvas bg-ink px-2.5 py-0.5 rounded-full font-semibold font-mono">{patientProfile.bloodGroup}</span>
              </div>
              
              <div className="flex justify-center my-4">
                {qrBlob ? (
                  <img src={qrBlob} alt="Digital Patient Card QR" className="w-40 h-40 border border-hairline p-1" />
                ) : (
                  <div className="w-40 h-40 border border-dashed border-hairline rounded flex items-center justify-center text-xs text-ink-muted-48">
                    Generating QR...
                  </div>
                )}
              </div>

              <div className="border-t border-hairline pt-4 text-xs text-ink-muted-85 space-y-1">
                <div>DOB: {patientProfile.dob || patientProfile.dateOfBirth} ({patientProfile.age} Yrs)</div>
                <div>Emergency: {patientProfile.emergencyContact?.name} ({patientProfile.emergencyContact?.phone})</div>
                <div className="text-[9px] text-ink-muted-48 uppercase tracking-tight mt-3 text-center block">
                  SECURE INTERNAL ACCESS KEY • NO MEDICAL DATA CONTAINED INSIDE QR
                </div>
              </div>
            </div>

            {/* Detailed Patient Profile Section */}
            <div 
              className="bg-canvas border border-hairline p-5 space-y-4"
              style={{ borderRadius: '18px' }}
            >
              <h3 className="text-xs text-ink-muted-48 tracking-widest uppercase border-b border-hairline pb-3 mb-2 font-bold font-sans">
                Patient Profile & Medical History
              </h3>
              
              <div className="space-y-3.5 text-xs text-ink-muted-85">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <span className="text-ink-muted-48 block">Full Name</span>
                    <strong className="text-ink text-sm block mt-0.5">{patientProfile.name}</strong>
                  </div>
                  <div>
                    <span className="text-ink-muted-48 block">Aadhaar (UID)</span>
                    <strong className="text-primary text-sm font-mono block mt-0.5">{patientProfile.aadhaarNumber ? patientProfile.aadhaarNumber.replace(/(\d{4})(\d{4})(\d{4})/, '$1 $2 $3') : '2345 6789 0123'}</strong>
                  </div>
                  <div>
                    <span className="text-ink-muted-48 block">Gender / Age</span>
                    <strong className="text-ink text-sm block mt-0.5">{patientProfile.gender} / {patientProfile.age} Yrs</strong>
                  </div>
                  <div>
                    <span className="text-ink-muted-48 block">Date of Birth</span>
                    <strong className="text-ink text-sm block mt-0.5">{patientProfile.dob || patientProfile.dateOfBirth || 'Not Configured'}</strong>
                  </div>
                  <div>
                    <span className="text-ink-muted-48 block">Phone Number</span>
                    <strong className="text-ink text-sm block mt-0.5">{patientProfile.phone || 'Not Configured'}</strong>
                  </div>
                  <div>
                    <span className="text-ink-muted-48 block">Blood Group</span>
                    <strong className="text-ink text-sm block mt-0.5 font-mono">{patientProfile.bloodGroup || 'O-'}</strong>
                  </div>
                </div>

                <div className="border-t border-hairline pt-3">
                  <span className="text-ink-muted-48 block">Residential Address</span>
                  <strong className="text-ink block mt-0.5">{patientProfile.address || 'Not Configured'}</strong>
                </div>

                <div className="border-t border-hairline pt-3 space-y-2">
                  <h4 className="text-[10px] text-ink-muted-48 tracking-wide font-bold uppercase">Emergency Contact Info</h4>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <span className="text-ink-muted-48 block">Name (Relation)</span>
                      <strong className="text-ink block mt-0.5">
                        {patientProfile.emergencyContact?.name || 'Not Configured'} 
                        {patientProfile.emergencyContact?.relation && ` (${patientProfile.emergencyContact.relation})`}
                      </strong>
                    </div>
                    <div>
                      <span className="text-ink-muted-48 block">Telephone Number</span>
                      <strong className="text-ink block mt-0.5">{patientProfile.emergencyContact?.phone || 'Not Configured'}</strong>
                    </div>
                  </div>
                </div>

                <div className="border-t border-hairline pt-3 grid grid-cols-2 gap-4">
                  <div>
                    <span className="text-ink-muted-48 block">Allergies Profile</span>
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      {patientProfile.allergies && patientProfile.allergies.length > 0 ? (
                        patientProfile.allergies.map((allg, idx) => (
                          <span key={idx} className="bg-red-50 text-[#cf2d56] border border-red-200/50 px-2 py-0.5 rounded-full text-[9px] font-semibold">
                            {allg}
                          </span>
                        ))
                      ) : (
                        <span className="text-xs text-ink-muted-48 italic">No known drug/food allergies.</span>
                      )}
                    </div>
                  </div>
                  <div>
                    <span className="text-ink-muted-48 block">Medical History</span>
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      {patientProfile.medicalHistory && patientProfile.medicalHistory.length > 0 ? (
                        patientProfile.medicalHistory.map((hist, idx) => (
                          <span key={idx} className="bg-canvas-parchment text-ink border border-hairline px-2 py-0.5 rounded-full text-[9px] font-semibold">
                            {hist}
                          </span>
                        ))
                      ) : (
                        <span className="text-xs text-ink-muted-48 italic">No significant medical history logged.</span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ==================== 3. CABINET RECORDS TAB ==================== */}
        {activeTab === 'cabinet' && (
          <div className="space-y-6">
            
            {/* Prescriptions cabinet */}
            <div>
              <h2 className="text-xs text-ink-muted-48 uppercase tracking-widest mb-3 pl-1 font-bold">{t('prescriptions')}</h2>
              
              {!patientEpisode || patientEpisode.prescriptions?.length === 0 ? (
                <div 
                  className="bg-canvas border border-hairline p-6 text-center text-xs text-ink-muted-48"
                  style={{ borderRadius: '18px' }}
                >
                  {t('noDocs')}
                </div>
              ) : (
                <div className="space-y-3">
                  {patientEpisode.prescriptions.map((p, i) => (
                    <div 
                      key={i} 
                      className="bg-canvas border border-hairline p-4 text-xs"
                      style={{ borderRadius: '11px' }} // rounded.md
                    >
                      <div className="font-semibold text-sm text-ink">{p.medicine}</div>
                      <div className="grid grid-cols-3 gap-2 mt-2 font-mono text-[11px]">
                        <div>Dosage: <strong className="text-ink">{p.dosage}</strong></div>
                        <div>Freq: <strong className="text-ink">{p.frequency}</strong></div>
                        <div>Duration: <strong className="text-ink">{p.duration}</strong></div>
                      </div>
                      <div className="text-[10px] text-ink-muted-48 mt-3 pt-2 border-t border-hairline flex justify-between">
                        <span>DATE: {new Date(p.date).toLocaleDateString()}</span>
                        <span>BY: {patientEpisode.doctorName}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Test reports */}
            <div>
              <h2 className="text-xs text-ink-muted-48 uppercase tracking-widest mb-3 pl-1 font-bold">{t('docsAndReports')}</h2>
              
              {!patientEpisode || patientEpisode.tests?.length === 0 ? (
                <div 
                  className="bg-canvas border border-hairline p-6 text-center text-xs text-ink-muted-48"
                  style={{ borderRadius: '18px' }}
                >
                  No diagnostic investigations found in this cabinet.
                </div>
              ) : (
                <div className="space-y-2">
                  {patientEpisode.tests.map((tItem, i) => (
                    <div 
                      key={i} 
                      className="bg-canvas border border-hairline p-4 flex justify-between items-center text-xs"
                      style={{ borderRadius: '11px' }}
                    >
                      <div>
                        <div className="font-semibold text-ink">{tItem.name}</div>
                        {tItem.result && <div className="text-ink-muted-85 mt-1 leading-relaxed font-mono">Result: {tItem.result}</div>}
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
            </div>

            {/* Clinical Reports, Medical History & Local Object Storage */}
            <MyDocumentsPanel 
              user={user} 
              patientEpisode={patientEpisode} 
            />

            {/* Chat message box with Doctor */}
            {patientEpisode && (
              <div>
                <h2 className="text-xs text-ink-muted-48 uppercase tracking-widest mb-3 pl-1 font-bold">{t('chatWithConsultant')}</h2>
                <div 
                  className="bg-canvas border border-hairline p-4"
                  style={{ borderRadius: '18px' }}
                >
                  <div className="space-y-2 max-h-40 overflow-y-auto mb-4 bg-canvas-parchment border border-hairline p-3 rounded-[11px]">
                    {patientEpisode.messages.length === 0 ? (
                      <p className="text-xs text-ink-muted-48 italic text-center py-4">No care coordination messages logged.</p>
                    ) : (
                      patientEpisode.messages.map((m, i) => (
                        <div 
                          key={i} 
                          className={`p-2.5 rounded-[11px] text-xs max-w-[85%] ${
                            m.sender === 'PATIENT' 
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
                      type="text" required placeholder={t('typeMessage')}
                      value={chatMessage} onChange={e => setChatMessage(e.target.value)}
                      className="flex-grow text-xs rounded-full bg-canvas-parchment"
                    />
                    <button
                      type="submit"
                      className="bg-primary hover:bg-primary-focus text-canvas text-xs font-semibold px-4 rounded-full transition-colors uppercase cursor-pointer"
                    >
                      {t('send')}
                    </button>
                  </form>
                </div>
              </div>
            )}

          </div>
        )}

        {/* ==================== 4. EMERGENCY TOOLS TAB ==================== */}
        {activeTab === 'emergency' && (
          <div className="space-y-6">
            <div>
              <h1 className="text-xl font-semibold text-ink leading-tight tracking-tight">Emergency Dispatch Operations</h1>
              <p className="text-xs text-ink-muted-48 mt-1">Dispatch ambulance services and coordinate direct consultation attention.</p>
            </div>

            {/* Direct Call Doctor Feature */}
            <div 
              className="bg-canvas border border-hairline p-5 space-y-4"
              style={{ borderRadius: '18px' }}
            >
              <h3 className="text-sm font-semibold text-ink flex items-center gap-1.5">
                <Phone size={15} className="text-primary" /> {t('callDoctor')}
              </h3>

              {patientEpisode?.requiresAttention ? (() => {
                const assignedDoctor = (doctors || []).find(d => d.doctorId === patientEpisode?.doctorId);
                const callDoctorPhone = patientEpisode?.doctorPhone || assignedDoctor?.phone || '';
                const callDoctorName = patientEpisode?.doctorName || assignedDoctor?.name || 'Your Doctor';
                
                return (
                  <div className="space-y-3">
                    <div className="p-3 bg-green-50 border border-green-200 text-[#1f8a65] text-xs rounded-[11px] leading-relaxed flex items-start gap-2">
                      <Info size={14} className="shrink-0 mt-0.5" />
                      <span>{t('requiresAttentionActive')}</span>
                    </div>
                    
                    {/* Dynamic Call Button — connects directly to the doctor who scanned the QR code */}
                    <a
                      href={callDoctorPhone ? `tel:${callDoctorPhone}` : '#'}
                      onClick={(e) => {
                        if (!callDoctorPhone) {
                          e.preventDefault();
                          addToast('Doctor phone number not configured.', 'error');
                        }
                      }}
                      className="w-full bg-primary hover:bg-primary-focus text-canvas py-3.5 rounded-full text-xs font-semibold transition-colors uppercase text-center block cursor-pointer"
                    >
                      Call Consultant: {callDoctorName}
                    </a>
                  </div>
                );
              })() : (
                <div className="p-3 bg-canvas-parchment border border-hairline text-ink-muted-85 text-xs rounded-[11px] leading-relaxed flex items-start gap-2">
                  <Info size={14} className="shrink-0 mt-0.5 text-ink-muted-48" />
                  <span>{t('requiresAttentionInactive')}</span>
                </div>
              )}
            </div>

            {/* Ambulance Dispatch Area */}
            <div 
              className="bg-canvas border border-hairline p-5 space-y-4"
              style={{ borderRadius: '18px' }}
            >
              <h3 className="text-sm font-semibold text-ink flex items-center gap-1.5">
                <Ambulance size={16} className="text-primary" /> {t('requestAmbulance')}
              </h3>

              {ambRequest ? (
                <div className="bg-canvas-parchment border border-hairline rounded-[11px] p-4 space-y-3">
                  <span className="text-[10px] text-ink-muted-48 uppercase tracking-widest block font-bold">{t('ambulanceStatus')}</span>
                  
                  {/* Progress visual status bar */}
                  <div className="grid grid-cols-5 gap-1 text-[8px] text-center uppercase font-semibold">
                    <div className={`p-1.5 rounded-full ${['requested'].includes((ambRequest.status || '').toLowerCase()) ? 'bg-primary text-canvas' : 'bg-ink text-canvas'}`}>Req</div>
                    <div className={`p-1.5 rounded-full ${
                      ['assigned'].includes((ambRequest.status || '').toLowerCase()) ? 'bg-primary text-canvas' : ['en_route', 'en route', 'arrived', 'completed'].includes((ambRequest.status || '').toLowerCase()) ? 'bg-ink text-canvas' : 'bg-canvas border border-hairline text-ink-muted-48'
                    }`}>Asg</div>
                    <div className={`p-1.5 rounded-full ${
                      ['en_route', 'en route'].includes((ambRequest.status || '').toLowerCase()) ? 'bg-primary text-canvas' : ['arrived', 'completed'].includes((ambRequest.status || '').toLowerCase()) ? 'bg-ink text-canvas' : 'bg-canvas border border-hairline text-ink-muted-48'
                    }`}>Route</div>
                    <div className={`p-1.5 rounded-full ${
                      ['arrived'].includes((ambRequest.status || '').toLowerCase()) ? 'bg-primary text-canvas' : ['completed'].includes((ambRequest.status || '').toLowerCase()) ? 'bg-ink text-canvas' : 'bg-canvas border border-hairline text-ink-muted-48'
                    }`}>Arv</div>
                    <div className={`p-1.5 rounded-full ${
                      ['completed'].includes((ambRequest.status || '').toLowerCase()) ? 'bg-primary text-canvas' : 'bg-canvas border border-hairline text-ink-muted-48'
                    }`}>Done</div>
                  </div>
                  
                  <div className="text-xs pt-3 border-t border-hairline space-y-2 text-ink-muted-85">
                    <div>Condition: <strong className="text-ink">{ambRequest.condition}</strong></div>
                    <div>Location: <strong className="text-ink">{ambRequest.location}</strong></div>
                    <div>Status: <strong className="text-primary uppercase font-bold">{ambRequest.status}</strong></div>
                    
                    {ambRequest.driverName && (
                      <div className="bg-canvas border border-hairline p-3 rounded-[9px] mt-2 space-y-1">
                        <div className="text-[10px] text-ink-muted-48 uppercase font-bold tracking-wide">Assigned Vehicle Details</div>
                        <div>Plate Number: <strong className="text-ink">{ambRequest.plateNumber}</strong></div>
                        <div>Driver Name: <strong className="text-ink">{ambRequest.driverName}</strong></div>
                        <div>Driver Contact: <strong className="text-ink">{ambRequest.driverPhone}</strong></div>
                        
                        <a
                          href={`tel:${ambRequest.driverPhone}`}
                          className="mt-2 w-full block text-center bg-[#cf2d56] hover:bg-[#b02245] text-canvas text-[10px] font-bold py-2 rounded-full transition-colors uppercase"
                          style={{ borderRadius: '20px' }}
                        >
                          Call Ambulance Driver
                        </a>
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  {/* Call Hotline */}
                  <a
                    href="tel:102"
                    className="w-full text-center border border-hairline hover:bg-canvas-parchment text-[#cf2d56] text-xs font-semibold py-3.5 rounded-full transition-colors uppercase block cursor-pointer"
                    style={{ borderRadius: '20px' }}
                  >
                    📞 Call Dispatch Hotline (102)
                  </a>

                  <form onSubmit={handleRequestAmbulance} className="space-y-4">
                    <p className="text-xs text-ink-muted-48 leading-relaxed">
                      {t('requestAmbulanceSub')}
                    </p>

                  <div>
                    <label className="block text-xs text-ink uppercase mb-1 font-semibold">{t('enterLocation')}</label>
                    <input
                      type="text" required placeholder="Coordinates / Address"
                      value={ambForm.location} onChange={e => setAmbForm({ ...ambForm, location: e.target.value })}
                      className="w-full text-xs rounded-full bg-canvas-parchment"
                    />
                  </div>

                  <div>
                    <label className="block text-xs text-ink uppercase mb-1 font-semibold">{t('describeCondition')}</label>
                    <input
                      type="text" required placeholder="Symptom description"
                      value={ambForm.condition} onChange={e => setAmbForm({ ...ambForm, condition: e.target.value })}
                      className="w-full text-xs rounded-full bg-canvas-parchment"
                    />
                  </div>

                  <div>
                    <label className="block text-xs text-ink uppercase mb-1 font-semibold">{t('enterPhone')}</label>
                    <div className="flex items-center bg-canvas-parchment border border-hairline focus-within:border-hairline-strong transition-all overflow-hidden rounded-full">
                      <div className="bg-canvas-card border-r border-hairline px-3.5 py-2.5 text-xs text-ink-muted-48 font-bold flex items-center shrink-0">
                        +91
                      </div>
                      <input
                        type="text" required placeholder="98765 43210"
                        value={ambForm.phone} onChange={e => setAmbForm({ ...ambForm, phone: e.target.value })}
                        className="w-full text-xs px-3 py-2.5 bg-transparent focus:outline-none border-none font-mono"
                      />
                    </div>
                  </div>

                  <button
                    type="submit" disabled={submittingAmb}
                    className="w-full bg-ink hover:bg-ink-muted-80 disabled:opacity-50 text-canvas text-xs font-semibold py-3.5 rounded-full transition-colors uppercase cursor-pointer"
                  >
                    {submittingAmb ? 'Requesting...' : t('submitRequest')}
                  </button>
                </form>
              </div>
            )}
            </div>
          </div>
        )}

        {/* ==================== 5. BILLING TAB ==================== */}
        {activeTab === 'billing' && (
          <div className="space-y-6">
            <div>
              <h1 className="text-xl font-semibold text-ink leading-tight tracking-tight">Care Episode Billing</h1>
              <p className="text-xs text-ink-muted-48 mt-1">Live statement of clinical assessments, bed occupancy, and pharmacy prescription transactions.</p>
            </div>

            <div 
              className="bg-canvas border border-hairline p-5 space-y-4"
              style={{ borderRadius: '18px' }}
            >
              <h3 className="text-xs text-ink-muted-48 tracking-widest uppercase border-b border-hairline pb-3 mb-2 font-bold font-sans">Statement Summary</h3>
              {patientEpisode ? (
                <div className="space-y-4">
                  <div className="space-y-3 divide-y divide-hairline">
                    {(patientEpisode.billing || []).map((b, i) => (
                      <div key={i} className="flex justify-between items-center text-xs py-2 first:pt-0 last:pb-0">
                        <div>
                          <div className="font-semibold text-ink">{b.description}</div>
                          <div className="text-[10px] text-ink-muted-48 mt-0.5">{new Date(b.date).toLocaleDateString()} • {b.category}</div>
                        </div>
                        <div className="text-right">
                          <span className="font-semibold text-ink block">₹{b.total}</span>
                          <span className={`text-[9px] uppercase font-bold px-1.5 py-0.5 rounded inline-block mt-0.5 ${b.status === 'PAID' ? 'bg-green-100 text-[#1f8a65]' : 'bg-yellow-100 text-timeline-done'}`}>{b.status}</span>
                        </div>
                      </div>
                    ))}
                    {(!patientEpisode.billing || patientEpisode.billing.length === 0) && (
                      <div className="text-xs text-ink-muted-48 italic py-4 text-center">No billing items registered for this active care cycle.</div>
                    )}
                  </div>

                  <div className="border-t border-hairline pt-4 space-y-2 text-xs">
                    <div className="flex justify-between text-ink-muted-85">
                      <span>Total Invoiced:</span>
                      <span>₹{(patientEpisode.billing || []).reduce((acc, curr) => acc + curr.total, 0)}</span>
                    </div>
                    <div className="flex justify-between text-[#1f8a65]">
                      <span>Amount Paid:</span>
                      <span>₹{(patientEpisode.billing || []).reduce((acc, curr) => acc + (curr.status === 'PAID' ? curr.total : 0), 0)}</span>
                    </div>
                    <div className="flex justify-between font-bold text-ink border-t border-dashed border-hairline pt-2 text-sm">
                      <span>Outstanding Balance:</span>
                      <span>₹{(patientEpisode.billing || []).reduce((acc, curr) => acc + (curr.status === 'PENDING' ? curr.total : 0), 0)}</span>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="text-xs text-ink-muted-48 italic py-4 text-center">No active clinical care episode. Check-in at admin portal to initiate.</div>
              )}
            </div>
          </div>
        )}

      </main>

      {/* Bottom Mobile Tab Bar (frosted glass with iOS safe area bottom inset) */}
      <footer className="fixed bottom-0 left-0 right-0 bg-canvas border-t border-hairline flex shrink-0 z-30 frosted-glass shadow-none pwa-footer">
        <button 
          onClick={() => setActiveTab('journey')}
          className={`flex-1 flex flex-col items-center justify-center text-xs cursor-pointer ${activeTab === 'journey' ? 'text-primary font-semibold' : 'text-ink-muted-48 hover:text-ink'}`}
        >
          <Activity size={18} />
          <span className="mt-1 text-[9px] uppercase tracking-wider font-semibold">Journey</span>
        </button>
        <button 
          onClick={() => setActiveTab('card')}
          className={`flex-1 flex flex-col items-center justify-center text-xs cursor-pointer ${activeTab === 'card' ? 'text-primary font-semibold' : 'text-ink-muted-48 hover:text-ink'}`}
        >
          <CreditCard size={18} />
          <span className="mt-1 text-[9px] uppercase tracking-wider font-semibold">Identity</span>
        </button>
        <button 
          onClick={() => setActiveTab('cabinet')}
          className={`flex-1 flex flex-col items-center justify-center text-xs cursor-pointer ${activeTab === 'cabinet' ? 'text-primary font-semibold' : 'text-ink-muted-48 hover:text-ink'}`}
        >
          <MessageSquare size={18} />
          <span className="mt-1 text-[9px] uppercase tracking-wider font-semibold">Cabinet</span>
        </button>
        <button 
          onClick={() => setActiveTab('billing')}
          className={`flex-1 flex flex-col items-center justify-center text-xs cursor-pointer ${activeTab === 'billing' ? 'text-primary font-semibold' : 'text-ink-muted-48 hover:text-ink'}`}
        >
          <Receipt size={18} />
          <span className="mt-1 text-[9px] uppercase tracking-wider font-semibold">Billing</span>
        </button>
        <button 
          onClick={() => setActiveTab('emergency')}
          className={`flex-1 flex flex-col items-center justify-center text-xs cursor-pointer ${activeTab === 'emergency' ? 'text-primary font-semibold' : 'text-ink-muted-48 hover:text-ink'}`}
        >
          <ShieldAlert size={18} />
          <span className="mt-1 text-[9px] uppercase tracking-wider font-semibold">Emergency</span>
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

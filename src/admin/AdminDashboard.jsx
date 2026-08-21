import React, { useState, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { api } from '../utils/api';
import { 
  Building2, Users, Bed, Truck, Droplet, Package, 
  UserPlus, Plus, Search, Calendar, ChevronRight, AlertTriangle,
  Activity, Pill, FlaskConical, Stethoscope, QrCode, ShieldCheck
} from 'lucide-react';
import QRCode from 'qrcode';

const getCategoryIcon = (category) => {
  const norm = (category || '').toUpperCase();
  if (norm.includes('MEDICINE') || norm.includes('PHAR')) return <Pill size={12} className="text-primary shrink-0" />;
  if (norm.includes('LAB')) return <FlaskConical size={12} className="text-primary shrink-0" />;
  if (norm.includes('SURG')) return <Activity size={12} className="text-primary shrink-0" />;
  if (norm.includes('EMER')) return <AlertTriangle size={12} className="text-[#cf2d56] shrink-0" />;
  return <Package size={12} className="text-ink-muted-48 shrink-0" />;
};

export default function AdminDashboard() {
  const { 
    user, login, logout, t, beds, patients, ambulanceRequests, 
    bloodBank, inventory, surgeries, addToast, refreshData, departments,
    ambulanceVehicles, doctors, wasOfflineRef, donorsList
  } = useApp();

  // Admin credentials login form state
  const [loginForm, setLoginForm] = useState({ phone: '', id: '' });
  const [loggingIn, setLoggingIn] = useState(false);

  const handleLoginSubmit = async (e) => {
    e.preventDefault();
    if (!loginForm.phone || !loginForm.id) return;
    setLoggingIn(true);
    try {
      const phoneFormatted = loginForm.phone.startsWith('+') ? loginForm.phone : `+91${loginForm.phone.trim()}`;
      await login('ADMIN', { ...loginForm, phone: phoneFormatted });
    } catch (_) {
      // Error is already toasted by AppContext
    } finally {
      setLoggingIn(false);
    }
  };

  const [newVehForm, setNewVehForm] = useState({ plateNumber: '', driverName: '', driverPhone: '' });
  const [dispatchVehicles, setDispatchVehicles] = useState({});
  const [newInvForm, setNewInvForm] = useState({ name: '', category: 'MEDICINE', unit: 'tablets', quantity: 0, minimumStock: 10, location: 'PHARMACY', supplier: '' });
  const [newDocForm, setNewDocForm] = useState({ name: '', department: 'GENERAL', phone: '', specialty: '' });

  const [activeTab, setActiveTabState] = useState(() => {
    return localStorage.getItem('halo_admin_active_tab') || 'overview';
  });
  const setActiveTab = (tab) => {
    setActiveTabState(tab);
    localStorage.setItem('halo_admin_active_tab', tab);
  };
  
  // Registration state
  const [regForm, setRegForm] = useState({
    name: '', aadhaarNumber: '', phone: '', age: '', gender: 'Male', dob: '', 
    bloodGroup: 'O-', address: '', emergencyName: '', 
    emergencyPhone: '', emergencyRelation: 'Spouse', 
    allergies: '', medicalHistory: ''
  });

  // Bed Assign State
  const [selectedBed, setSelectedBed] = useState(null);
  const [assignPatientId, setAssignPatientId] = useState('');
  const [newBedForm, setNewBedForm] = useState({ bedId: '', wardId: 'WARD-GEN', bedNumber: '' });
  
  // Blood Requirement State
  const [bloodReq, setBloodReq] = useState({ group: '', units: 1 });
  const [eligibleDonors, setEligibleDonors] = useState([]);
  
  // Inventory movement State
  const [invMove, setInvMove] = useState({ itemId: '', type: 'Received', qty: 1, notes: '' });

  // Surgery Register State
  const [surgForm, setSurgForm] = useState({ patientId: '', procedure: '', doctorId: '', theatre: 'OT-01', time: '' });
  const doctorsList = doctors;

  // QR Code render
  const [qrBlob, setQrBlob] = useState('');
  const [patientQrBlob, setPatientQrBlob] = useState('');
  const [activeCardPatient, setActiveCardPatient] = useState(null);
  const [showQrZoom, setShowQrZoom] = useState(null);

  // Selected Patient Details state
  const [selectedPatient, setSelectedPatient] = useState(null);
  const [selectedEpisode, setSelectedEpisode] = useState(null);
  const [timelineLogs, setTimelineLogs] = useState([]);
  const [transferDept, setTransferDept] = useState('Cardiology');
  const [newBillItem, setNewBillItem] = useState({ description: '', category: 'Consultation', qty: 1, price: 0 });

  // Doctor assignment, admission, and document states
  const [assignDoctorId, setAssignDoctorId] = useState('');
  const [admitDept, setAdmitDept] = useState('General Medicine');
  const [admitDocId, setAdmitDocId] = useState('');
  const [admitReason, setAdmitReason] = useState('');
  const [docForm, setDocForm] = useState({ title: '', type: 'LAB_REPORT', fileRef: '' });
  const [uploadingDoc, setUploadingDoc] = useState(false);

  // Search filter
  const [searchQuery, setSearchQuery] = useState('');

  // Premium custom confirmation modal state
  const [confirmModal, setConfirmModal] = useState({
    isOpen: false,
    title: '',
    message: '',
    onConfirm: null
  });

  const [isDonorModalOpen, setIsDonorModalOpen] = useState(false);
  const [newDonorForm, setNewDonorForm] = useState({ name: '', bloodGroup: 'O-', phone: '', location: '' });

  const safeLocaleDateString = (val) => {
    if (!val) return 'N/A';
    const d = new Date(val);
    return isNaN(d.getTime()) ? 'N/A' : d.toLocaleDateString();
  };

  const safeLocaleTimeString = (val) => {
    if (!val) return 'N/A';
    const d = new Date(val);
    return isNaN(d.getTime()) ? 'N/A' : d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  // Initial loads
  useEffect(() => {
    if (doctors && doctors.length > 0) {
      const defaultDocId = doctors[0].id || doctors[0].doctorId || doctors[0]._id;
      setSurgForm(f => ({ ...f, doctorId: defaultDocId }));
      setAssignDoctorId(defaultDocId);
      setAdmitDocId(defaultDocId);
    }
  }, [doctors]);

  const [selectedPatientDocuments, setSelectedPatientDocuments] = useState([]);

  // Load selected patient details, active episode, and timeline events
  useEffect(() => {
    async function loadSelectedPatientDetails() {
      if (!selectedPatient) return;
      try {
        const eps = await api.get(`/episodes?patientId=${selectedPatient.patientId}`);
        const active = eps.find(e => e.status === 'ACTIVE') || eps[eps.length - 1] || null;
        setSelectedEpisode(active);

        // Fetch audit logs/timeline events for this patient
        const logs = await api.get(`/dashboard/audit?patientId=${selectedPatient.patientId}`);
        setTimelineLogs(logs || []);

        // Fetch patient documents
        const docs = await api.get(`/patients/${selectedPatient.patientId}/documents`);
        setSelectedPatientDocuments(docs || []);

        // Generate high-resolution patient QR code for reliable camera scanning
        const qrUrl = await QRCode.toDataURL(selectedPatient.qrCodeToken || selectedPatient.patientId, {
          width: 450,
          margin: 1,
          color: { dark: '#000000', light: '#ffffff' }
        });
        setPatientQrBlob(qrUrl);
      } catch (err) {
        console.error('Error loading patient details:', err);
      }
    }
    loadSelectedPatientDetails();
  }, [selectedPatient, beds, patients]);

  // Fetch donors when blood shortage is checked
  const checkBloodOutreach = async (group) => {
    try {
      const donors = await api.get(`/bloodbank/donors/${group}`);
      setEligibleDonors(donors);
    } catch (_) {}
  };

  const handleRegisterPatient = async (e) => {
    e.preventDefault();
    const cleanAadhaar = regForm.aadhaarNumber.replace(/\D/g, '');
    if (cleanAadhaar.length !== 12) {
      addToast('A valid 12-digit Aadhaar number is mandatory for registration.', 'error');
      return;
    }

    try {
      const formatPhone = (val) => {
        if (!val) return '';
        const trimmed = val.trim();
        return trimmed.startsWith('+') ? trimmed : `+91${trimmed}`;
      };

      const patient = await api.post('/patients/register', {
        name: regForm.name,
        aadhaarNumber: cleanAadhaar,
        phone: formatPhone(regForm.phone),
        age: regForm.age,
        gender: regForm.gender,
        dob: regForm.dob,
        bloodGroup: regForm.bloodGroup,
        address: regForm.address,
        emergencyContact: {
          name: regForm.emergencyName,
          phone: formatPhone(regForm.emergencyPhone),
          relation: regForm.emergencyRelation
        },
        allergies: regForm.allergies,
        medicalHistory: regForm.medicalHistory
      });

      addToast(`Patient registered! Generated ID: ${patient.patientId}`, 'success');
      
      // Auto create a treatment episode for this patient with the first doctor
      if (doctorsList.length > 0) {
        const doc = doctorsList[0];
        await api.post('/episodes', {
          patientId: patient.patientId,
          doctorId: doc.id || doc._id
        });
        addToast(`Activated clinical episode with ${doc.name}`, 'info');
      }

      // Generate virtual card QR
      const qrUrl = await QRCode.toDataURL(patient.qrCodeToken);
      setQrBlob(qrUrl);
      setActiveCardPatient(patient);
      
      // Reset form
      setRegForm({
        name: '', aadhaarNumber: '', phone: '', age: '', gender: 'Male', dob: '', 
        bloodGroup: 'O-', address: '', emergencyName: '', 
        emergencyPhone: '', emergencyRelation: 'Spouse', 
        allergies: '', medicalHistory: ''
      });
      refreshData();
    } catch (err) {
      addToast(err.message, 'error');
    }
  };

  const handleAssignBed = async (e) => {
    e.preventDefault();
    if (!selectedBed) return;
    try {
      await api.put(`/beds/${selectedBed.bedId}/assign`, { patientId: assignPatientId });
      addToast(`Bed ${selectedBed.bedId} updated!`, 'success');
      setSelectedBed(null);
      setAssignPatientId('');
      refreshData();
    } catch (err) {
      if (wasOfflineRef.current || err.message === 'Failed to fetch' || err.message.includes('NetworkError')) {
        const patient = patients.find(p => p.patientId === assignPatientId);
        const updatedBeds = beds.map(b => {
          if (b.bedId === selectedBed.bedId) {
            return {
              ...b,
              status: 'OCCUPIED',
              patientId: assignPatientId,
              patientName: patient ? patient.name : 'Unknown Patient',
            };
          }
          return b;
        });
        setBeds(updatedBeds);
        try { localStorage.setItem('halo_beds', JSON.stringify(updatedBeds)); } catch (_) {}

        const updatedPatients = patients.map(p => {
          if (p.patientId === assignPatientId) {
            return { ...p, currentBed: selectedBed.bedId, status: 'ADMITTED' };
          }
          return p;
        });
        setPatients(updatedPatients);
        try { localStorage.setItem('halo_patients', JSON.stringify(updatedPatients)); } catch (_) {}

        addToast(`[Offline] Bed ${selectedBed.bedId} allocated to ${patient ? patient.name : assignPatientId}`, 'success');
        setSelectedBed(null);
        setAssignPatientId('');
      } else {
        addToast(err.message, 'error');
      }
    }
  };

  const handleCleanBed = async (bedId) => {
    try {
      await api.put(`/beds/${bedId}/clean`);
      addToast(`Bed ${bedId} is now green (Available)`, 'success');
      setSelectedBed(null);
      refreshData();
    } catch (err) {
      if (wasOfflineRef.current || err.message === 'Failed to fetch' || err.message.includes('NetworkError')) {
        const updatedBeds = beds.map(b => {
          if (b.bedId === bedId) {
            return { ...b, status: 'AVAILABLE', patientId: null, patientName: null, episodeId: null };
          }
          return b;
        });
        setBeds(updatedBeds);
        try { localStorage.setItem('halo_beds', JSON.stringify(updatedBeds)); } catch (_) {}
        addToast(`[Offline] Bed ${bedId} marked Available`, 'success');
        setSelectedBed(null);
      } else {
        addToast(err.message, 'error');
      }
    }
  };

  const handleUpdateBedStatus = async (bedId, status) => {
    try {
      await api.put(`/beds/${bedId}/status`, { status });
      addToast(`Bed ${bedId} status updated to ${status}!`, 'success');
      setSelectedBed(null);
      refreshData();
    } catch (err) {
      if (wasOfflineRef.current || err.message === 'Failed to fetch' || err.message.includes('NetworkError')) {
        const updatedBeds = beds.map(b => {
          if (b.bedId === bedId) {
            const isReleasing = b.status === 'OCCUPIED' && status !== 'OCCUPIED';
            return {
              ...b,
              status,
              ...(isReleasing ? { patientId: null, patientName: null, episodeId: null } : {})
            };
          }
          return b;
        });
        setBeds(updatedBeds);
        try { localStorage.setItem('halo_beds', JSON.stringify(updatedBeds)); } catch (_) {}
        
        const releasedBed = beds.find(b => b.bedId === bedId);
        if (releasedBed && releasedBed.status === 'OCCUPIED' && status !== 'OCCUPIED') {
          const updatedPatients = patients.map(p => {
            if (p.patientId === releasedBed.patientId) {
              return { ...p, currentBed: null };
            }
            return p;
          });
          setPatients(updatedPatients);
          try { localStorage.setItem('halo_patients', JSON.stringify(updatedPatients)); } catch (_) {}
        }

        addToast(`[Offline] Bed ${bedId} status updated to ${status}`, 'success');
        setSelectedBed(null);
      } else {
        addToast(err.message, 'error');
      }
    }
  };

  const handleAddBed = async (e) => {
    e.preventDefault();
    if (!newBedForm.bedId.trim()) return;
    try {
      await api.post('/beds', {
        bedId: newBedForm.bedId.toUpperCase(),
        wardId: newBedForm.wardId,
        bedNumber: newBedForm.bedNumber || '1'
      });
      addToast(`Bed ${newBedForm.bedId.toUpperCase()} created successfully!`, 'success');
      setNewBedForm({ bedId: '', wardId: 'WARD-GEN', bedNumber: '' });
      refreshData();
    } catch (err) {
      addToast(err.message, 'error');
    }
  };

  const handleDeleteBed = async (bedId) => {
    setConfirmModal({
      isOpen: true,
      title: 'Delete Bed Location',
      message: `Are you sure you want to permanently delete bed location ${bedId}?`,
      onConfirm: async () => {
        try {
          await api.delete(`/beds/${bedId}`);
          addToast(`Bed ${bedId} deleted successfully!`, 'success');
          setSelectedBed(null);
          refreshData();
        } catch (err) {
          addToast(err.message, 'error');
        }
      }
    });
  };

  const handleAmbulanceStatus = async (requestId, status, ambulanceId = null) => {
    try {
      await api.put(`/ambulance/${requestId}/status`, { status, ambulanceId });
      addToast(`Ambulance status: ${status}`, 'success');
      refreshData();
    } catch (err) {
      addToast(err.message, 'error');
    }
  };

  const handleAddVehicle = async (e) => {
    e.preventDefault();
    if (!newVehForm.plateNumber.trim() || !newVehForm.driverName.trim() || !newVehForm.driverPhone.trim()) return;
    try {
      await api.post('/ambulance/vehicles', newVehForm);
      addToast(`Vehicle ${newVehForm.plateNumber} registered!`, 'success');
      setNewVehForm({ plateNumber: '', driverName: '', driverPhone: '' });
      refreshData();
    } catch (err) {
      addToast(err.message, 'error');
    }
  };

  const handleDeleteVehicle = async (ambulanceId) => {
    setConfirmModal({
      isOpen: true,
      title: 'Remove Ambulance Vehicle',
      message: `Are you sure you want to permanently remove vehicle ${ambulanceId} from fleet registry?`,
      onConfirm: async () => {
        try {
          await api.delete(`/ambulance/vehicles/${ambulanceId}`);
          addToast(`Vehicle removed successfully!`, 'success');
          refreshData();
        } catch (err) {
          addToast(err.message, 'error');
        }
      }
    });
  };

  const handleBloodRequest = async (e) => {
    e.preventDefault();
    if (!bloodReq.group) {
      addToast('Please select a required blood group', 'error');
      return;
    }
    try {
      const res = await api.post('/bloodbank/request', {
        bloodGroup: bloodReq.group,
        unitsRequired: bloodReq.units
      });
      if (res.shortage > 0) {
        addToast(`Shortage of ${res.shortage} units detected! Alert dispatched.`, 'error');
        checkBloodOutreach(bloodReq.group);
      } else {
        addToast('Stock sufficient. No emergency outreach needed.', 'success');
        setEligibleDonors([]);
      }
      refreshData();
    } catch (err) {
      addToast(err.message, 'error');
    }
  };

  const handleUpdateBloodStock = async (bloodGroup, actionType) => {
    try {
      await api.put('/bloodbank/stock', { bloodGroup, actionType });
      addToast(`Blood Group ${bloodGroup} units updated!`, 'success');
      refreshData();
    } catch (err) {
      addToast(err.message, 'error');
    }
  };

  const handleAddDonor = async (e) => {
    e.preventDefault();
    if (!newDonorForm.name || !newDonorForm.phone) return;
    try {
      const formatPhone = (val) => {
        if (!val) return '';
        const trimmed = val.trim();
        return trimmed.startsWith('+') ? trimmed : `+91${trimmed}`;
      };
      await api.post('/bloodbank/donors-list', {
        ...newDonorForm,
        phone: formatPhone(newDonorForm.phone)
      });
      addToast('New blood donor registered successfully!', 'success');
      setNewDonorForm({ name: '', bloodGroup: 'O-', phone: '', location: '' });
      refreshData();
    } catch (err) {
      addToast(err.message, 'error');
    }
  };

  const handleDeleteDonor = async (donorId, name) => {
    setConfirmModal({
      isOpen: true,
      title: 'Remove Blood Donor',
      message: `Are you sure you want to permanently delete blood donor ${name} from the registry log?`,
      onConfirm: async () => {
        try {
          await api.delete(`/bloodbank/donors-list/${donorId}`);
          addToast(`Donor ${name} removed successfully!`, 'success');
          refreshData();
        } catch (err) {
          addToast(err.message, 'error');
        }
      }
    });
  };

  const handleInventoryMovement = async (e) => {
    e.preventDefault();
    if (!invMove.itemId) return;
    try {
      await api.post('/inventory/movement', {
        itemId: invMove.itemId,
        type: invMove.type,
        quantity: invMove.qty,
        notes: invMove.notes
      });
      addToast('Inventory movement logged & updated.', 'success');
      setInvMove({ itemId: '', type: 'Received', qty: 1, notes: '' });
      refreshData();
    } catch (err) {
      addToast(err.message, 'error');
    }
  };

  const handleAddInventoryItem = async (e) => {
    e.preventDefault();
    if (!newInvForm.name.trim()) return;
    try {
      await api.post('/inventory', {
        name: newInvForm.name,
        category: newInvForm.category,
        unit: newInvForm.unit,
        quantity: Number(newInvForm.quantity) || 0,
        minimumStock: Number(newInvForm.minimumStock) || 10,
        location: newInvForm.location,
        supplier: newInvForm.supplier
      });
      addToast(`Inventory Item ${newInvForm.name} added successfully!`, 'success');
      setNewInvForm({ name: '', category: 'MEDICINE', unit: 'tablets', quantity: 0, minimumStock: 10, location: 'PHARMACY', supplier: '' });
      refreshData();
    } catch (err) {
      addToast(err.message, 'error');
    }
  };

  const handleAddNewCharge = async (e) => {
    e.preventDefault();
    if (!selectedEpisode || !newBillItem.description.trim()) return;
    try {
      const updated = await api.put(`/episodes/${selectedEpisode.episodeId}`, {
        billItem: {
          description: newBillItem.description,
          category: newBillItem.category,
          quantity: Number(newBillItem.qty) || 1,
          unitPrice: Number(newBillItem.price) || 0
        }
      });
      setSelectedEpisode(updated);
      addToast('Cost item added to ledger!', 'success');
      setNewBillItem({ description: '', category: 'Consultation', qty: 1, price: 0 });
      refreshData();
    } catch (err) {
      addToast(err.message, 'error');
    }
  };

  const handleAddDoctor = async (e) => {
    e.preventDefault();
    if (!newDocForm.name.trim()) return;
    try {
      const formatPhone = (val) => {
        if (!val) return '';
        const trimmed = val.trim();
        return trimmed.startsWith('+') ? trimmed : `+91${trimmed}`;
      };
      await api.post('/doctors', {
        ...newDocForm,
        phone: formatPhone(newDocForm.phone)
      });
      addToast(`Doctor ${newDocForm.name} registered!`, 'success');
      setNewDocForm({ name: '', department: 'GENERAL', phone: '', specialty: '' });
      refreshData();
    } catch (err) {
      addToast(err.message, 'error');
    }
  };

  const handleDeleteDoctor = async (doctorId) => {
    setConfirmModal({
      isOpen: true,
      title: 'Remove Doctor from Registry',
      message: `Are you sure you want to permanently remove doctor record for ID ${doctorId}?`,
      onConfirm: async () => {
        try {
          await api.delete(`/doctors/${doctorId}`);
          addToast('Doctor removed successfully!', 'success');
          refreshData();
        } catch (err) {
          addToast(err.message, 'error');
        }
      }
    });
  };

  const handleRegisterSurgery = async (e) => {
    e.preventDefault();
    if (!surgForm.patientId || !surgForm.procedure || !surgForm.time) return;
    try {
      await api.post('/surgeries', {
        patientId: surgForm.patientId,
        procedure: surgForm.procedure,
        doctorId: surgForm.doctorId,
        operatingTheatre: surgForm.theatre,
        time: surgForm.time
      });
      addToast('Surgery booked and clinical schedule updated.', 'success');
      setSurgForm({ patientId: '', procedure: '', doctorId: doctorsList[0]?.id || '', theatre: 'OT-01', time: '' });
      refreshData();
    } catch (err) {
      addToast(err.message, 'error');
    }
  };

  // Stats calculators
  const stats = {
    occupiedBeds: beds.filter(b => b.status === 'OCCUPIED').length,
    totalBeds: beds.length,
    cleaningBeds: beds.filter(b => b.status === 'CLEANING').length,
    activeAmbulance: ambulanceRequests.filter(a => a.status !== 'Completed').length,
    lowInventory: inventory.filter(i => i.quantity <= i.minStockLevel).length,
    bloodAlerts: bloodBank.some(b => b.unitsAvailable <= 1)
  };

  const filteredPatients = patients.filter(pt => 
    (pt.name || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
    (pt.patientId || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
    (pt.phone || '').toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Admin login gate — all roles authenticate through the backend
  if (!user || user.role !== 'ADMIN') {
    return (
      <div className="min-h-screen bg-canvas-parchment flex flex-col justify-center items-center p-6 font-sans">
        <div className="w-full max-w-sm bg-canvas border border-hairline p-8 flex flex-col apple-product-shadow" style={{ borderRadius: '24px' }}>
          <div className="flex flex-col items-center text-center space-y-2 mb-6">
            <div className="w-14 h-14 bg-primary/10 rounded-full flex items-center justify-center text-primary">
              <ShieldCheck size={28} />
            </div>
            <h2 className="text-xl font-bold text-ink">Admin Command Centre</h2>
            <p className="text-xs text-ink-muted-48">Sign in with your admin mobile number & unique Admin ID.</p>
          </div>

          <form onSubmit={handleLoginSubmit} className="space-y-4">
            <div className="space-y-1">
              <label className="text-[10px] text-ink-muted-48 uppercase font-bold tracking-widest block">Admin Mobile</label>
              <div className="flex items-center bg-canvas-parchment border border-hairline focus-within:border-hairline-strong transition-all overflow-hidden" style={{ borderRadius: '30px' }}>
                <div className="bg-canvas-card border-r border-hairline px-3.5 py-3 text-xs text-ink-muted-48 font-bold flex items-center shrink-0">
                  +91
                </div>
                <input 
                  type="tel" 
                  placeholder="9999999999" 
                  value={loginForm.phone}
                  onChange={e => setLoginForm(prev => ({ ...prev, phone: e.target.value }))}
                  className="w-full px-3 py-3 text-xs bg-transparent focus:outline-none transition-all shadow-none border-none"
                  required
                />
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-[10px] text-ink-muted-48 uppercase font-bold tracking-widest block">Unique Admin ID</label>
              <input 
                type="text" 
                placeholder="HALO-ADMIN" 
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
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-canvas-parchment flex flex-col font-sans">
      
      {/* Sticky Header Group */}
      <header className="sticky top-0 z-40 shrink-0 flex flex-col">
        {/* 1. Global Navigation Bar (Apple True Black, 44px) */}
        <nav className="bg-surface-black h-11 flex justify-between items-center px-6 select-none">
          <div className="flex items-center gap-2">
            <span className="w-5 h-5 bg-white rounded-full flex items-center justify-center text-surface-black">
              <Activity size={11} strokeWidth={3} />
            </span>
            <span className="text-on-dark text-xs tracking-tight font-light uppercase">HALO Hospital Admin</span>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-[10px] text-body-muted uppercase tracking-wider">
              System Operations Command
            </span>
            <button 
              onClick={logout}
              className="text-xs text-on-dark hover:text-primary-on-dark transition-colors cursor-pointer"
            >
              Sign Out
            </button>
          </div>
        </nav>

        {/* 2. Secondary Sub-Nav (Apple Frosted Glass, 52px) */}
        <div className="h-13 border-b border-hairline frosted-glass flex justify-between items-center px-6">
          <h1 className="text-xl font-semibold text-ink tracking-tight">
            {activeTab === 'overview' && 'Command Center Dashboard'}
            {activeTab === 'register' && 'Register Patient'}
            {activeTab === 'patients' && 'Patients Directory'}
            {activeTab === 'beds' && 'Ward Bed Allocations'}
            {activeTab === 'doctors' && 'Doctors Registry'}
            {activeTab === 'ambulance' && 'Ambulance Coordinates'}
            {activeTab === 'blood' && 'Blood Bank Storage'}
            {activeTab === 'inventory' && 'Pharmacy Ledger'}
            {activeTab === 'surgeries' && 'OT Operating Scheduler'}
          </h1>
          <div className="flex items-center gap-2 text-xs text-ink-muted-48">
            <span>OPERATIONAL STATE: ACTIVE</span>
          </div>
        </div>
      </header>

      {/* Admin Dashboard Workspace Split */}
      <div className="flex flex-1 flex-col lg:flex-row">
        
        {/* Left Nav Menu Sidebar */}
        <aside className="w-full lg:w-64 shrink-0 border-r border-hairline bg-canvas-parchment p-6 flex flex-col gap-1 lg:sticky lg:top-24 lg:h-[calc(100vh-6rem)] overflow-y-auto">
          <h2 className="text-xs text-ink-muted-48 tracking-widest uppercase mb-4 pl-4 font-semibold">Management</h2>
          
          <button 
            onClick={() => setActiveTab('overview')} 
            className={`w-full text-left px-4 py-3 rounded-[11px] text-sm flex items-center gap-3 transition-all cursor-pointer ${activeTab === 'overview' ? 'bg-ink text-canvas font-medium' : 'text-ink hover:bg-divider-soft'}`}
          >
            <Building2 size={15} /> Overview Command
          </button>
          <button 
            onClick={() => setActiveTab('register')} 
            className={`w-full text-left px-4 py-3 rounded-[11px] text-sm flex items-center gap-3 transition-all cursor-pointer ${activeTab === 'register' ? 'bg-ink text-canvas font-medium' : 'text-ink hover:bg-divider-soft'}`}
          >
            <UserPlus size={15} /> Register Patient
          </button>
          <button 
            onClick={() => setActiveTab('patients')} 
            className={`w-full text-left px-4 py-3 rounded-[11px] text-sm flex items-center gap-3 transition-all cursor-pointer ${activeTab === 'patients' ? 'bg-ink text-canvas font-medium' : 'text-ink hover:bg-divider-soft'}`}
          >
            <Users size={15} /> Patients Directory
          </button>
          <button 
            onClick={() => setActiveTab('beds')} 
            className={`w-full text-left px-4 py-3 rounded-[11px] text-sm flex items-center gap-3 transition-all cursor-pointer ${activeTab === 'beds' ? 'bg-ink text-canvas font-medium' : 'text-ink hover:bg-divider-soft'}`}
          >
            <Bed size={15} /> Bed Management
          </button>
          <button 
            onClick={() => setActiveTab('doctors')} 
            className={`w-full text-left px-4 py-3 rounded-[11px] text-sm flex items-center gap-3 transition-all cursor-pointer ${activeTab === 'doctors' ? 'bg-ink text-canvas font-medium' : 'text-ink hover:bg-divider-soft'}`}
          >
            <Stethoscope size={15} /> Doctors Registry
          </button>
          <button 
            onClick={() => setActiveTab('ambulance')} 
            className={`w-full text-left px-4 py-3 rounded-[11px] text-sm flex items-center gap-3 transition-all cursor-pointer ${activeTab === 'ambulance' ? 'bg-ink text-canvas font-medium' : 'text-ink hover:bg-divider-soft'}`}
          >
            <Truck size={15} /> Ambulance Control
          </button>
          <button 
            onClick={() => setActiveTab('blood')} 
            className={`w-full text-left px-4 py-3 rounded-[11px] text-sm flex items-center gap-3 transition-all cursor-pointer ${activeTab === 'blood' ? 'bg-ink text-canvas font-medium' : 'text-ink hover:bg-divider-soft'}`}
          >
            <Droplet size={15} /> Blood Bank Module
          </button>
          <button 
            onClick={() => setActiveTab('inventory')} 
            className={`w-full text-left px-4 py-3 rounded-[11px] text-sm flex items-center gap-3 transition-all cursor-pointer ${activeTab === 'inventory' ? 'bg-ink text-canvas font-medium' : 'text-ink hover:bg-divider-soft'}`}
          >
            <Package size={15} /> Pharmacy Inventory
          </button>
          <button 
            onClick={() => setActiveTab('surgeries')} 
            className={`w-full text-left px-4 py-3 rounded-[11px] text-sm flex items-center gap-3 transition-all cursor-pointer ${activeTab === 'surgeries' ? 'bg-ink text-canvas font-medium' : 'text-ink hover:bg-divider-soft'}`}
          >
            <Calendar size={15} /> OT Surgeries
          </button>
        </aside>

        {/* Right Main Dashboard Panel */}
        <main className="flex-grow min-w-0 p-8 bg-canvas-parchment">
          
          {/* ==================== OVERVIEW COMMAND TAB ==================== */}
          {activeTab === 'overview' && (
            <div className="space-y-8">
              
              {/* Statistics Cards */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                
                <div 
                  className="bg-canvas border border-hairline p-6 flex flex-col justify-between h-36"
                  style={{ borderRadius: '18px' }} // rounded.lg
                >
                  <div className="flex justify-between items-start">
                    <span className="text-[10px] text-ink-muted-48 uppercase tracking-wider font-semibold">Bed Occupancy</span>
                    <Bed size={18} className="text-ink" />
                  </div>
                  <div>
                    <span className="text-3xl font-semibold text-ink tracking-tight">{stats.occupiedBeds}</span>
                    <span className="text-xs text-ink-muted-48 block mt-1"> / {stats.totalBeds} Active Beds</span>
                  </div>
                </div>

                <div 
                  className="bg-canvas border border-hairline p-6 flex flex-col justify-between h-36"
                  style={{ borderRadius: '18px' }} // rounded.lg
                >
                  <div className="flex justify-between items-start">
                    <span className="text-[10px] text-ink-muted-48 uppercase tracking-wider font-semibold">Ambulance Dispatches</span>
                    <Truck size={18} className="text-ink" />
                  </div>
                  <div>
                    <span className="text-3xl font-semibold text-ink tracking-tight">{stats.activeAmbulance}</span>
                    <span className="text-xs text-ink-muted-48 block mt-1"> Active dispatches en route</span>
                  </div>
                </div>

                <div 
                  className="bg-canvas border border-hairline p-6 flex flex-col justify-between h-36"
                  style={{ borderRadius: '18px' }} // rounded.lg
                >
                  <div className="flex justify-between items-start">
                    <span className="text-[10px] text-ink-muted-48 uppercase tracking-wider font-semibold">Inventory Warnings</span>
                    <Package size={18} className={stats.lowInventory > 0 ? 'text-primary' : 'text-ink'} />
                  </div>
                  <div>
                    <span className={`text-3xl font-semibold tracking-tight ${stats.lowInventory > 0 ? 'text-primary' : 'text-ink'}`}>{stats.lowInventory}</span>
                    <span className="text-xs text-ink-muted-48 block mt-1"> Supplies below threshold</span>
                  </div>
                </div>

                <div 
                  className={`border p-6 flex flex-col justify-between h-36 ${
                    stats.bloodAlerts ? 'bg-red-50/50 border-[#cf2d56] text-[#cf2d56]' : 'bg-canvas border-hairline text-ink'
                  }`}
                  style={{ borderRadius: '18px' }} // rounded.lg
                >
                  <div className="flex justify-between items-start">
                    <span className="text-[10px] uppercase tracking-wider font-semibold">Blood Stock Alert</span>
                    <Droplet size={18} className={stats.bloodAlerts ? 'text-[#cf2d56]' : 'text-ink'} />
                  </div>
                  <div>
                    <span className="text-base font-semibold uppercase block">{stats.bloodAlerts ? 'Critical shortages' : 'Stock levels OK'}</span>
                    <span className="text-xs block mt-1 text-ink-muted-48">O- blood units: 1</span>
                  </div>
                </div>

              </div>

              {/* Split grids */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                
                {/* Active Surgeries list */}
                <div 
                  className="bg-canvas border border-hairline p-6"
                  style={{ borderRadius: '18px' }}
                >
                  <h3 className="text-xs text-ink-muted-48 tracking-widest uppercase mb-4 font-semibold">Today's Operating Theatre Schedule</h3>
                  {surgeries.length === 0 ? (
                    <div className="text-xs text-ink-muted-48 py-8 text-center">No surgeries booked today.</div>
                  ) : (
                    <div className="divide-y divide-hairline">
                      {surgeries.map(s => (
                        <div key={s.surgeryId} className="py-4 flex justify-between items-center">
                          <div>
                            <div className="text-sm font-semibold text-ink">{s.procedure}</div>
                            <div className="text-xs text-ink-muted-48 mt-1">
                              Patient: {s.patientName} • Consultant: {s.doctorName}
                            </div>
                          </div>
                          <div className="text-right">
                            <span className="text-xs px-2.5 py-1 bg-canvas-parchment border border-hairline rounded-full text-ink block font-semibold">
                              {s.operatingTheatre}
                            </span>
                            <span className="text-[11px] text-ink-muted-48 block mt-2">{s.time}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Active Emergency dispatch */}
                <div 
                  className="bg-canvas border border-hairline p-6"
                  style={{ borderRadius: '18px' }}
                >
                  <h3 className="text-xs text-ink-muted-48 tracking-widest uppercase mb-4 font-semibold">Ambulance Fleet Coordinates</h3>
                  {ambulanceRequests.filter(a => a.status !== 'Completed').length === 0 ? (
                    <div className="text-xs text-ink-muted-48 py-8 text-center">No active emergency dispatches.</div>
                  ) : (
                    <div className="divide-y divide-hairline">
                      {ambulanceRequests.filter(a => a.status !== 'Completed').map(a => (
                        <div key={a.requestId} className="py-4 flex justify-between items-center">
                          <div>
                            <div className="text-sm font-semibold text-ink">{a.patientName} — {a.condition}</div>
                            <div className="text-xs text-ink-muted-48 mt-1">Coordinates: {a.location}</div>
                          </div>
                          <div>
                            <span className="text-[10px] uppercase font-semibold px-2.5 py-1 bg-red-100 text-[#cf2d56] rounded-full border border-red-200">
                              {a.status}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

              </div>
            </div>
          )}

          {/* ==================== REGISTER PATIENT TAB ==================== */}
          {activeTab === 'register' && (
            <div className="h-[calc(100vh-140px)] overflow-hidden flex flex-col md:flex-row gap-8">
              {/* Registration Form */}
              <div 
                className="flex-1 bg-canvas border border-hairline p-6 overflow-y-auto"
                style={{ borderRadius: '18px' }}
              >
                <h3 className="text-lg font-semibold text-ink mb-4 flex items-center gap-2">
                  <UserPlus size={18} /> Register Demographics Profile
                </h3>
                
                <form onSubmit={handleRegisterPatient} className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs text-ink uppercase mb-1 font-semibold">Full Patient Name</label>
                      <input 
                        type="text" required value={regForm.name} 
                        onChange={e => setRegForm({ ...regForm, name: e.target.value })}
                        className="w-full text-sm" placeholder="John Doe"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-ink uppercase mb-1 font-semibold flex items-center justify-between">
                        <span>12-Digit Aadhaar Number</span>
                        <span className="text-[10px] text-primary lowercase font-normal font-sans">unique identifier</span>
                      </label>
                      <input 
                        type="text" 
                        required 
                        maxLength={14}
                        value={regForm.aadhaarNumber} 
                        onChange={e => {
                          const raw = e.target.value.replace(/\D/g, '').slice(0, 12);
                          const formatted = raw.replace(/(\d{4})(?=\d)/g, '$1 ');
                          setRegForm({ ...regForm, aadhaarNumber: formatted });
                        }}
                        className="w-full text-sm font-mono tracking-wider" 
                        placeholder="XXXX XXXX XXXX"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs text-ink uppercase mb-1 font-semibold">Phone Number</label>
                      <div className="flex border border-hairline focus-within:border-hairline-strong rounded-[8px] overflow-hidden transition-all bg-canvas-parchment h-11">
                        <div className="bg-canvas border-r border-hairline px-3 text-sm text-ink-muted-48 font-bold flex items-center shrink-0">
                          +91
                        </div>
                        <input 
                          type="text" required value={regForm.phone} 
                          onChange={e => setRegForm({ ...regForm, phone: e.target.value })}
                          className="w-full text-sm px-3 bg-transparent focus:outline-none border-none h-full font-mono" placeholder="98765 43210"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs text-ink uppercase mb-1 font-semibold">Date of Birth</label>
                      <input 
                        type="date" required value={regForm.dob} 
                        onChange={e => setRegForm({ ...regForm, dob: e.target.value })}
                        className="w-full text-sm h-11"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-4">
                    <div>
                      <label className="block text-xs text-ink uppercase mb-1 font-semibold">Age</label>
                      <input 
                        type="number" required value={regForm.age} 
                        onChange={e => setRegForm({ ...regForm, age: e.target.value })}
                        className="w-full text-sm" placeholder="32"
                      />
                    </div>
                    <div>
                      <label className="block text-xs text-ink uppercase mb-1 font-semibold">Gender</label>
                      <select 
                        value={regForm.gender} 
                        onChange={e => setRegForm({ ...regForm, gender: e.target.value })}
                        className="w-full text-sm h-11"
                      >
                        <option>Male</option>
                        <option>Female</option>
                        <option>Other</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs text-ink uppercase mb-1 font-semibold">Blood Group</label>
                      <select 
                        value={regForm.bloodGroup} 
                        onChange={e => setRegForm({ ...regForm, bloodGroup: e.target.value })}
                        className="w-full text-sm h-11"
                      >
                        {['O-', 'O+', 'A-', 'A+', 'B-', 'B+', 'AB-', 'AB+'].map(g => (
                          <option key={g}>{g}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs text-ink uppercase mb-1 font-semibold">Residential Address</label>
                    <input 
                      type="text" required value={regForm.address} 
                      onChange={e => setRegForm({ ...regForm, address: e.target.value })}
                      className="w-full text-sm" placeholder="House/Street, City, State"
                    />
                  </div>

                  {/* Emergency Contacts */}
                  <div className="border-t border-hairline pt-4 space-y-3">
                    <h4 className="text-xs text-ink-muted-48 uppercase font-semibold">Emergency Contacts</h4>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                      <div>
                        <label className="block text-xs text-ink uppercase mb-0.5 font-semibold">Contact Name</label>
                        <input 
                          type="text" required value={regForm.emergencyName} 
                          onChange={e => setRegForm({ ...regForm, emergencyName: e.target.value })}
                          className="w-full text-sm" placeholder="Contact Name"
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-ink uppercase mb-0.5 font-semibold">Phone Number</label>
                        <div className="flex border border-hairline focus-within:border-hairline-strong rounded-[8px] overflow-hidden transition-all bg-canvas-parchment h-11">
                          <div className="bg-canvas border-r border-hairline px-3 text-sm text-ink-muted-48 font-bold flex items-center shrink-0">
                            +91
                          </div>
                          <input 
                            type="text" required value={regForm.emergencyPhone} 
                            onChange={e => setRegForm({ ...regForm, emergencyPhone: e.target.value })}
                            className="w-full text-sm px-3 bg-transparent focus:outline-none border-none h-full font-mono" placeholder="98765 43210"
                          />
                        </div>
                      </div>
                      <div>
                        <label className="block text-xs text-ink uppercase mb-0.5 font-semibold">Relation</label>
                        <input 
                          type="text" required value={regForm.emergencyRelation} 
                          onChange={e => setRegForm({ ...regForm, emergencyRelation: e.target.value })}
                          className="w-full text-sm" placeholder="Spouse"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Medical details */}
                  <div className="border-t border-hairline pt-4 space-y-3">
                    <h4 className="text-xs text-ink-muted-48 uppercase font-semibold">Clinical History Background</h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs text-ink uppercase mb-0.5 font-semibold">Allergies (comma separated)</label>
                        <textarea 
                          value={regForm.allergies} 
                          onChange={e => setRegForm({ ...regForm, allergies: e.target.value })}
                          className="w-full text-sm h-12 bg-canvas-parchment" placeholder="Penicillin, Peanuts"
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-ink uppercase mb-0.5 font-semibold">Medical History (comma separated)</label>
                        <textarea 
                          value={regForm.medicalHistory} 
                          onChange={e => setRegForm({ ...regForm, medicalHistory: e.target.value })}
                          className="w-full text-sm h-12 bg-canvas-parchment" placeholder="Hypertension, Appendectomy"
                        />
                      </div>
                    </div>
                  </div>

                  <button 
                    type="submit"
                    className="w-full bg-primary hover:bg-primary-focus text-canvas text-sm font-semibold py-3 rounded-full transition-colors uppercase cursor-pointer"
                  >
                    Save Profile & Generate Digital ID Card
                  </button>
                </form>
              </div>

              {/* Virtual Card Output / Active Print Preview */}
              <div className="w-full md:w-96 flex flex-col justify-between bg-canvas border border-hairline p-6 apple-product-shadow" style={{ borderRadius: '18px' }}>
                <div>
                  <h3 className="text-xs text-ink-muted-48 tracking-widest uppercase font-semibold mb-4">Active Patient Card</h3>
                  
                  {activeCardPatient ? (
                    <div className="space-y-4">
                      <div className="bg-canvas border border-hairline p-5 rounded-[18px] space-y-4">
                        <div className="flex justify-between items-start border-b border-hairline pb-4">
                          <div>
                            <h4 className="text-base font-semibold text-ink">{activeCardPatient.name}</h4>
                            <span className="text-xs text-ink-muted-48 block mt-1 font-mono">{activeCardPatient.patientId}</span>
                          </div>
                          <span className="text-xs text-canvas bg-ink px-2.5 py-0.5 rounded-full font-semibold">{activeCardPatient.bloodGroup}</span>
                        </div>
                        
                        {/* Render QR code */}
                        <div className="flex justify-center my-4">
                          {qrBlob && <img src={qrBlob} alt="Secure QR Code" className="w-36 h-36 border border-hairline p-1" />}
                        </div>

                        <div className="border-t border-hairline pt-4 text-xs text-ink-muted-85 space-y-1">
                          <div>DOB: {activeCardPatient.dob || activeCardPatient.dateOfBirth} ({activeCardPatient.age} Yrs)</div>
                          <div>Emergency: {activeCardPatient.emergencyContact?.name} ({activeCardPatient.emergencyContact?.phone})</div>
                          <div className="text-[10px] text-ink-muted-48 uppercase tracking-tight mt-2 block font-sans">SECURE IDENTIFIER • PHYSICAL ACCESS QR</div>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div 
                      className="bg-canvas border border-dashed border-hairline p-8 text-center h-80 flex flex-col justify-center items-center text-ink-muted-48"
                      style={{ borderRadius: '18px' }}
                    >
                      <Users size={32} className="text-ink-muted-48 mb-3" />
                      <p className="text-sm leading-relaxed">No active registration. Patient card will print here after database submit.</p>
                    </div>
                  )}
                </div>

                {activeCardPatient && (
                  <button
                    onClick={() => window.print()}
                    className="w-full bg-ink hover:bg-ink-muted-80 text-canvas text-xs font-semibold py-3 rounded-full uppercase cursor-pointer transition-colors"
                  >
                    Print Digital ID Card
                  </button>
                )}
              </div>
            </div>
          )}

          {/* ==================== PATIENTS DIRECTORY TAB ==================== */}
          {activeTab === 'patients' && (
            <div className="space-y-6">
              {/* Registry Summary List (Spanned Side-to-Side) */}
              <div 
                className="w-full bg-canvas border border-hairline p-6 flex flex-col apple-product-shadow"
                style={{ borderRadius: '24px', minHeight: '500px' }}
              >
                <h4 className="text-xs text-ink-muted-48 uppercase mb-4 font-bold tracking-widest font-sans">Patients Registry Directory</h4>
                
                {/* Search Input with proper spacing */}
                <div className="relative mb-4 shrink-0">
                  <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 text-ink-muted-48" size={16} />
                  <input 
                    type="text" placeholder="Search by name, ID, or phone..." 
                    value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
                    className="w-full pl-12 pr-4 py-3 text-xs rounded-full bg-canvas-parchment border border-hairline focus:border-hairline-strong focus:outline-none transition-all shadow-none"
                    style={{ borderRadius: '30px' }}
                  />
                </div>
                
                <div className="flex-grow overflow-y-auto divide-y divide-hairline">
                  {filteredPatients.map(p => (
                    <div 
                      key={p.patientId} 
                      onClick={() => setSelectedPatient(p)}
                      className="py-3 flex justify-between items-center text-xs cursor-pointer hover:bg-canvas-parchment px-4 rounded-[12px] transition-all"
                    >
                      <div>
                        <span className="font-bold text-ink">{p.name}</span>
                        <span className="text-ink-muted-48 block text-[10px] mt-0.5 font-mono">{p.patientId}</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-[10px] bg-canvas-parchment border border-hairline text-ink px-2.5 py-0.5 rounded-full font-bold">{p.bloodGroup}</span>
                        <span className="text-[11px] text-ink-muted-48">{p.phone}</span>
                      </div>
                    </div>
                  ))}
                  {filteredPatients.length === 0 && (
                    <div className="text-xs text-ink-muted-48 italic py-6 text-center">No patients found.</div>
                  )}
                </div>
              </div>

              {/* Patient Management Console Modal Popup Window */}
              {selectedPatient && (
                <div className="fixed inset-0 bg-[#000000]/60 z-[80] flex justify-center items-center backdrop-blur-sm p-4 md:p-8">
                  <div 
                    className="bg-white border border-[#e5e5e5] p-8 max-w-6xl w-full flex flex-col max-h-[90vh] shadow-2xl relative"
                    style={{ borderRadius: '24px' }}
                  >
                    <div className="flex justify-between items-start border-b border-hairline pb-4 mb-6 shrink-0">
                      <div>
                        <span className="text-[10px] text-ink-muted-48 uppercase font-bold tracking-widest block mb-1">Patient Management Console</span>
                        <h3 className="text-xl font-bold text-ink">{selectedPatient.name}</h3>
                        <div className="text-xs text-ink-muted-48 mt-1 font-mono">
                          Patient ID: {selectedPatient.patientId} | Status: <span className={selectedPatient.status === 'ACTIVE' || selectedPatient.status === 'ADMITTED' ? 'text-[#1f8a65] font-semibold' : 'text-[#cf2d56] font-semibold'}>{selectedPatient.status || 'ACTIVE'}</span>
                        </div>
                      </div>
                      
                      <div className="flex items-center gap-4">
                        {patientQrBlob && (
                          <button 
                            onClick={() => setShowQrZoom(patientQrBlob)}
                            className="flex items-center gap-2.5 bg-canvas-parchment border border-hairline hover:border-primary px-3 py-1.5 rounded-full cursor-pointer transition-all group"
                            title="Click to Zoom QR Code"
                          >
                            <img 
                              src={patientQrBlob} 
                              alt="Patient Profile QR" 
                              className="w-8 h-8 border border-hairline rounded bg-white"
                            />
                            <span className="text-xs font-bold text-ink group-hover:text-primary flex items-center gap-1">
                              <QrCode size={14} className="text-primary" /> Zoom QR Pass
                            </span>
                          </button>
                        )}
                        
                        <button
                          onClick={async () => {
                            if (selectedPatient.status === 'INACTIVE') {
                              setConfirmModal({
                                isOpen: true,
                                title: 'Remove Patient Record',
                                message: `Are you sure you want to permanently delete patient ${selectedPatient.name} and all related clinical data? This action is irreversible.`,
                                onConfirm: async () => {
                                  try {
                                    await api.delete(`/patients/${selectedPatient.patientId}`);
                                    addToast(`Patient ${selectedPatient.name} deleted successfully`, 'success');
                                    setSelectedPatient(null);
                                    refreshData();
                                  } catch (err) {
                                    addToast(err.message, 'error');
                                  }
                                }
                              });
                            } else {
                              try {
                                const updated = await api.put(`/patients/${selectedPatient.patientId}`, { status: 'INACTIVE' });
                                setSelectedPatient(updated);
                                addToast('Patient profile deactivated', 'success');
                                refreshData();
                              } catch (err) {
                                addToast(err.message, 'error');
                              }
                            }
                          }}
                          className={`text-xs px-4 py-2 rounded-full cursor-pointer font-bold uppercase transition-all shadow-none ${
                            selectedPatient.status === 'INACTIVE' 
                              ? 'bg-[#cf2d56] hover:bg-[#b02244] text-white border-none' 
                              : 'bg-canvas border border-hairline hover:border-hairline-strong text-ink bg-canvas-parchment'
                          }`}
                          style={{ borderRadius: '20px' }}
                        >
                          {selectedPatient.status === 'INACTIVE' ? 'REMOVE PATIENT' : 'Deactivate Profile'}
                        </button>
                        
                        {selectedPatient.status === 'INACTIVE' && (
                          <button
                            onClick={async () => {
                              try {
                                const updated = await api.put(`/patients/${selectedPatient.patientId}`, { status: 'ACTIVE' });
                                setSelectedPatient(updated);
                                addToast('Patient profile reactivated', 'success');
                                refreshData();
                              } catch (err) {
                                addToast(err.message, 'error');
                              }
                            }}
                            className="text-xs bg-canvas border border-hairline hover:border-hairline-strong px-3 py-2 rounded-full cursor-pointer font-semibold uppercase bg-canvas-parchment"
                            style={{ borderRadius: '20px' }}
                          >
                            Reactivate
                          </button>
                        )}
                        
                        <button 
                          onClick={() => setSelectedPatient(null)}
                          className="text-xs text-ink-muted-48 hover:text-ink border border-hairline hover:border-hairline-strong px-4 py-2 rounded-full cursor-pointer font-bold uppercase bg-canvas-parchment transition-all"
                          style={{ borderRadius: '20px' }}
                        >
                          Close Console
                        </button>
                      </div>
                    </div>

                    {/* Modal Body Grid */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-8 overflow-y-auto pr-2 pb-4">
                      {/* Column 1: Demographics & Care Details */}
                      <div className="space-y-6 text-xs">
                        {/* Dedicated Prominent Patient QR Pass Block */}
                        {patientQrBlob && (
                          <div className="bg-canvas-parchment border-2 border-hairline p-4 rounded-2xl flex flex-col items-center text-center space-y-2">
                            <span className="text-[10px] text-ink font-bold uppercase tracking-widest flex items-center gap-1.5">
                              <QrCode size={14} className="text-primary" /> Clinical Access QR Pass
                            </span>
                            <div 
                              onClick={() => setShowQrZoom(patientQrBlob)}
                              className="relative group cursor-pointer p-2.5 bg-white rounded-2xl border-2 border-hairline shadow-md hover:shadow-lg transition-all"
                            >
                              <img 
                                src={patientQrBlob} 
                                alt="Patient QR Code" 
                                className="w-52 h-52 object-contain rounded-xl transition-transform group-hover:scale-105"
                              />
                              <div className="absolute inset-0 bg-black/10 opacity-0 group-hover:opacity-100 transition-opacity rounded-2xl flex items-center justify-center">
                                <span className="bg-ink text-canvas text-xs font-bold px-3 py-1.5 rounded-full shadow-lg">🔍 Click to Zoom</span>
                              </div>
                            </div>
                            <span className="text-[10px] text-primary font-semibold tracking-tight">
                              📷 Scan with Doctor PWA Rear Camera to open file
                            </span>
                          </div>
                        )}

                        <div>
                          <h4 className="text-xs text-ink-muted-48 uppercase font-bold tracking-widest border-b border-hairline pb-2 mb-2">Patient Demographics</h4>
                          <div className="space-y-2">
                            <div><span className="text-ink-muted-48">Aadhaar (UID):</span> <strong className="text-primary font-mono">{selectedPatient.aadhaarNumber ? selectedPatient.aadhaarNumber.replace(/(\d{4})(\d{4})(\d{4})/, '$1 $2 $3') : 'Not Configured'}</strong></div>
                            <div><span className="text-ink-muted-48">Phone:</span> <strong className="text-ink">{selectedPatient.phone}</strong></div>
                            <div><span className="text-ink-muted-48">Age / Gender:</span> <strong className="text-ink">{selectedPatient.age} Yrs / {selectedPatient.gender}</strong></div>
                            <div><span className="text-ink-muted-48">Blood Group:</span> <strong className="text-ink">{selectedPatient.bloodGroup}</strong></div>
                            <div><span className="text-ink-muted-48">DOB:</span> <strong className="text-ink">{selectedPatient.dob || selectedPatient.dateOfBirth}</strong></div>
                            <div><span className="text-ink-muted-48">Address:</span> <strong className="text-ink">{selectedPatient.address}</strong></div>
                            <div><span className="text-ink-muted-48">Emergency Contact:</span> <strong className="text-ink">{selectedPatient.emergencyContact?.name} ({selectedPatient.emergencyContact?.phone} - {selectedPatient.emergencyContact?.relation})</strong></div>
                            <div><span className="text-ink-muted-48">Allergies:</span> <strong className="text-[#cf2d56]">{selectedPatient.allergies?.join(', ') || 'None'}</strong></div>
                            <div><span className="text-ink-muted-48">Medical History:</span> <strong className="text-ink">{selectedPatient.medicalHistory?.join(', ') || 'None'}</strong></div>
                          </div>
                        </div>

                        {/* Current Care Block */}
                        <div className="pt-4 border-t border-hairline space-y-2">
                          <h4 className="text-xs text-ink-muted-48 uppercase font-bold tracking-widest border-b border-hairline pb-2 mb-2">Current Care Status</h4>
                          <div className="space-y-2 bg-canvas-parchment p-3 rounded-[11px] border border-hairline">
                            <div><span className="text-ink-muted-48">Care Status:</span> <strong className="text-ink uppercase">{selectedPatient.status || 'ACTIVE'}</strong></div>
                            <div><span className="text-ink-muted-48">Assigned Doctor:</span> <strong className="text-ink">{selectedPatient.assignedDoctor?.name || 'No doctor assigned'}</strong></div>
                            <div><span className="text-ink-muted-48">Current Department:</span> <strong className="text-ink">{selectedPatient.department || 'General Medicine'}</strong></div>
                            <div><span className="text-ink-muted-48">Current Bed:</span> <strong className="text-ink">{selectedPatient.currentBed || 'Not admitted (Outpatient)'}</strong></div>
                            {selectedEpisode && (
                              <>
                                <div><span className="text-ink-muted-48">Active Treatment:</span> <strong className="text-ink">{selectedEpisode.reason || 'General checkup'}</strong></div>
                                <div><span className="text-ink-muted-48">Care Stage:</span> <strong className="text-primary font-semibold font-mono uppercase">{selectedEpisode.currentStage}</strong></div>
                              </>
                            )}
                          </div>
                        </div>

                        {/* Doctor Assignment Form */}
                        <div className="pt-4 border-t border-hairline space-y-2">
                          <span className="block text-xs text-ink uppercase font-bold">Assign Clinical Consultant</span>
                          <div className="flex gap-2">
                            <select
                              value={assignDoctorId}
                              onChange={(e) => setAssignDoctorId(e.target.value)}
                              className="text-xs bg-canvas border border-hairline rounded-full px-3 py-1.5 outline-none cursor-pointer hover:border-hairline-strong transition-all flex-grow"
                              style={{ borderRadius: '20px' }}
                            >
                              {doctorsList.map(d => (
                                <option key={d.id || d._id} value={d.id || d._id}>{d.name} ({d.specialty})</option>
                              ))}
                            </select>
                            <button
                              onClick={async () => {
                                try {
                                  const updated = await api.put(`/patients/${selectedPatient.patientId}/assign-doctor`, { doctorId: assignDoctorId });
                                  setSelectedPatient(updated);
                                  addToast('Clinical consultant assigned successfully!', 'success');
                                  refreshData();
                                } catch (err) {
                                  addToast(err.message, 'error');
                                }
                              }}
                              className="text-[10px] bg-primary hover:bg-primary-focus text-canvas px-3.5 py-1.5 rounded-full cursor-pointer font-bold uppercase transition-colors"
                              style={{ borderRadius: '20px' }}
                            >
                              Assign
                            </button>
                          </div>
                        </div>

                        {/* Patient Admission Form */}
                        {selectedPatient.status !== 'ADMITTED' && (
                          <div className="pt-4 border-t border-hairline space-y-3 bg-red-50/20 p-3 rounded-[11px] border border-dashed border-red-200">
                            <span className="block text-xs text-ink uppercase font-bold text-[#cf2d56]">Admit Patient to Ward</span>
                            <div className="space-y-2">
                              <div>
                                <label className="text-[10px] text-ink-muted-48 block mb-0.5">Admitting Department</label>
                                <select
                                  value={admitDept}
                                  onChange={(e) => setAdmitDept(e.target.value)}
                                  className="w-full text-xs bg-canvas border border-hairline rounded-full px-3 py-1.5 outline-none cursor-pointer"
                                  style={{ borderRadius: '20px' }}
                                >
                                  {departments.map(d => (
                                    <option key={d} value={d}>{d}</option>
                                  ))}
                                </select>
                              </div>
                              <div>
                                <label className="text-[10px] text-ink-muted-48 block mb-0.5">Primary Doctor</label>
                                <select
                                  value={admitDocId}
                                  onChange={(e) => setAdmitDocId(e.target.value)}
                                  className="w-full text-xs bg-canvas border border-hairline rounded-full px-3 py-1.5 outline-none cursor-pointer"
                                  style={{ borderRadius: '20px' }}
                                >
                                  {doctorsList.map(d => (
                                    <option key={d.id || d._id} value={d.id || d._id}>{d.name} ({d.specialty})</option>
                                  ))}
                                </select>
                              </div>
                              <div>
                                <label className="text-[10px] text-ink-muted-48 block mb-0.5">Reason for Treatment</label>
                                <input
                                  type="text"
                                  value={admitReason}
                                  onChange={(e) => setAdmitReason(e.target.value)}
                                  placeholder="e.g. Chest Tightness"
                                  className="w-full text-xs px-3 py-1.5 rounded-full border border-hairline"
                                  style={{ borderRadius: '20px' }}
                                />
                              </div>
                              <button
                                onClick={async () => {
                                  if (!admitReason.trim()) {
                                    addToast('Please enter an admission reason.', 'error');
                                    return;
                                  }
                                  try {
                                    const updated = await api.post(`/patients/${selectedPatient.patientId}/admit`, {
                                      department: admitDept,
                                      doctorId: admitDocId,
                                      reason: admitReason
                                    });
                                    setSelectedPatient(updated);
                                    addToast('Patient admitted as Inpatient!', 'success');
                                    setAdmitReason('');
                                    refreshData();
                                  } catch (err) {
                                    addToast(err.message, 'error');
                                  }
                                }}
                                className="w-full text-center bg-[#cf2d56] hover:bg-[#b02244] text-canvas py-2 rounded-full text-[10px] font-bold uppercase transition-colors cursor-pointer mt-1"
                                style={{ borderRadius: '20px' }}
                              >
                                Admit Patient
                              </button>
                            </div>
                          </div>
                        )}

                        {/* Department Transfer Form */}
                        {selectedEpisode && (
                          <div className="pt-4 border-t border-hairline space-y-3">
                            <label className="block text-xs text-ink uppercase font-bold">Transfer Department</label>
                            <div className="flex gap-2">
                              <select
                                value={transferDept}
                                onChange={(e) => setTransferDept(e.target.value)}
                                className="text-xs bg-canvas border border-hairline rounded-full px-3 py-1.5 outline-none cursor-pointer hover:border-hairline-strong transition-all flex-grow"
                                style={{ borderRadius: '20px' }}
                              >
                                {departments.map(d => (
                                  <option key={d} value={d}>{d}</option>
                                ))}
                              </select>
                              <button
                                onClick={async () => {
                                  try {
                                    const updated = await api.put(`/episodes/${selectedEpisode.episodeId}`, { department: transferDept });
                                    setSelectedEpisode(updated);
                                    addToast(`Patient transferred to ${transferDept}`, 'success');
                                    refreshData();
                                  } catch (err) {
                                    addToast(err.message, 'error');
                                  }
                                }}
                                className="text-[10px] bg-ink hover:bg-ink-muted-80 text-canvas px-3.5 py-1.5 rounded-full cursor-pointer font-bold uppercase transition-colors"
                                style={{ borderRadius: '20px' }}
                              >
                                Transfer
                              </button>
                            </div>
                          </div>
                        )}

                        {/* Attach Document Form */}
                        <div className="pt-4 border-t border-hairline space-y-3">
                          <span className="block text-xs text-ink uppercase font-bold">Attach Medical Document</span>
                          <div className="space-y-2 bg-canvas-parchment p-3 rounded-[11px] border border-hairline">
                            <div>
                              <input
                                type="text"
                                placeholder="Document Title (e.g. Lab Report ECG)"
                                value={docForm.title}
                                onChange={e => setDocForm({ ...docForm, title: e.target.value })}
                                className="w-full text-xs px-3 py-1.5 rounded-full border border-hairline bg-canvas"
                                style={{ borderRadius: '20px' }}
                              />
                            </div>
                            <div>
                              <select
                                value={docForm.type}
                                onChange={e => setDocForm({ ...docForm, type: e.target.value })}
                                className="w-full text-xs bg-canvas border border-hairline rounded-full px-3 py-1.5 outline-none cursor-pointer"
                                style={{ borderRadius: '20px' }}
                              >
                                <option value="PRESCRIPTION">Prescription</option>
                                <option value="LAB_REPORT">Lab Report</option>
                                <option value="IMAGING">Imaging Report (X-Ray/MRI)</option>
                                <option value="REFERRAL">Referral Letter</option>
                                <option value="OTHER">Other Document</option>
                              </select>
                            </div>
                            <button
                              onClick={async () => {
                                if (!docForm.title.trim()) {
                                  addToast('Please specify a document title.', 'error');
                                  return;
                                }
                                setUploadingDoc(true);
                                try {
                                  await api.post(`/patients/${selectedPatient.patientId}/documents`, {
                                    title: docForm.title,
                                    type: docForm.type,
                                    treatmentEpisodeId: selectedEpisode?.episodeId || null,
                                    fileRef: 'ref_' + docForm.title.toLowerCase().replace(/\s+/g, '_')
                                  });
                                  addToast('Medical document attached successfully!', 'success');
                                  setDocForm({ title: '', type: 'LAB_REPORT', fileRef: '' });
                                  const docs = await api.get(`/patients/${selectedPatient.patientId}/documents`);
                                  setSelectedPatientDocuments(docs || []);
                                  refreshData();
                                } catch (err) {
                                  addToast(err.message, 'error');
                                } finally {
                                  setUploadingDoc(false);
                                }
                              }}
                              disabled={uploadingDoc}
                              className="w-full text-center bg-ink hover:bg-ink-muted-80 text-canvas py-2 rounded-full text-[10px] font-bold uppercase transition-colors cursor-pointer mt-1"
                              style={{ borderRadius: '20px' }}
                            >
                              {uploadingDoc ? 'Saving...' : 'Save & Attach Document'}
                            </button>
                          </div>
                        </div>

                        {/* List Attached Documents */}
                        <div className="pt-4 border-t border-hairline space-y-2">
                          <span className="block text-xs text-ink-muted-48 uppercase font-bold tracking-wide">Attached Files & Reports</span>
                          <div className="space-y-2 max-h-40 overflow-y-auto pr-1">
                            {selectedPatientDocuments.map((doc, idx) => (
                              <div key={idx} className="bg-canvas border border-hairline p-2.5 rounded-[11px] flex justify-between items-center text-[11px]">
                                <div>
                                  <div className="font-semibold text-ink">{doc.title}</div>
                                  <div className="text-[9px] text-ink-muted-48 uppercase mt-0.5">{doc.type} • By {doc.uploadedBy}</div>
                                </div>
                                <span className="text-[9px] text-ink-muted-48 font-mono">{safeLocaleDateString(doc.createdAt)}</span>
                              </div>
                            ))}
                            {selectedPatientDocuments.length === 0 && (
                              <div className="text-xs text-ink-muted-48 italic py-1">No medical files uploaded yet.</div>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Column 2: Patient Billing */}
                      <div className="space-y-4 border-l border-hairline pl-6">
                        <h4 className="text-xs text-ink-muted-48 uppercase font-bold tracking-widest border-b border-hairline pb-2">Treatment Episode Ledger</h4>
                        {selectedEpisode ? (
                          <div className="space-y-4">
                            <div className="max-h-72 overflow-y-auto space-y-2 pr-1">
                              {(selectedEpisode.billing || []).map((item, i) => (
                                <div key={i} className="flex justify-between items-start text-xs border-b border-hairline pb-2">
                                  <div>
                                    <div className="font-semibold text-ink">{item.description}</div>
                                    <div className="text-[9px] text-ink-muted-48 uppercase mt-0.5">{item.category} • {item.department}</div>
                                  </div>
                                  <div className="text-right">
                                    <strong className="text-ink">₹{item.total}</strong>
                                    <span className={`text-[8px] uppercase font-bold block mt-1 ${item.status === 'PAID' ? 'text-success' : 'text-[#cf2d56]'}`}>
                                      {item.status}
                                    </span>
                                  </div>
                                </div>
                              ))}
                            </div>

                            <div className="pt-3 border-t border-hairline flex justify-between text-sm">
                              <span className="text-ink font-semibold">Total Accumulation:</span>
                              <strong className="text-ink text-base">₹{(selectedEpisode.billing || []).reduce((sum, item) => sum + item.total, 0)}</strong>
                            </div>

                            <form onSubmit={handleAddNewCharge} className="border-t border-hairline pt-4 space-y-3">
                              <span className="text-[11px] text-ink block font-semibold uppercase">Add Manual Cost Item</span>
                              <div>
                                <input 
                                  type="text" placeholder="Description (e.g. ECG scan)" required
                                  value={newBillItem.description}
                                  onChange={e => setNewBillItem({...newBillItem, description: e.target.value})}
                                  className="w-full text-xs px-3 py-1.5 rounded-full border border-hairline"
                                  style={{ borderRadius: '20px' }}
                                />
                              </div>
                              <div className="grid grid-cols-2 gap-2">
                                <select 
                                  value={newBillItem.category}
                                  onChange={e => setNewBillItem({...newBillItem, category: e.target.value})}
                                  className="text-xs px-2 py-1.5 rounded-full border border-hairline bg-canvas"
                                  style={{ borderRadius: '20px' }}
                                >
                                  {['Consultation', 'Medicine', 'Lab Test', 'Imaging', 'Bed', 'Procedure', 'Surgery', 'Consumables', 'Other'].map(c => (
                                    <option key={c} value={c}>{c}</option>
                                  ))}
                                </select>
                                <input 
                                  type="number" placeholder="Price (₹)" required
                                  value={newBillItem.price || ''}
                                  onChange={e => setNewBillItem({...newBillItem, price: Number(e.target.value)})}
                                  className="text-xs px-2.5 py-1.5 rounded-full border border-hairline"
                                  style={{ borderRadius: '20px' }}
                                />
                              </div>
                              <button 
                                type="submit"
                                className="w-full bg-ink hover:bg-ink-muted-80 text-canvas py-2 rounded-full text-[10px] font-bold uppercase transition-colors cursor-pointer"
                                style={{ borderRadius: '20px' }}
                              >
                                Add Charge Item
                              </button>
                            </form>
                          </div>
                        ) : (
                          <div className="text-xs text-ink-muted-48 italic py-2">No active Care Episode. Admit patient to initiate billing.</div>
                        )}
                      </div>

                      {/* Column 3: Event Log Timeline */}
                      <div className="space-y-4 border-l border-hairline pl-6">
                        <h4 className="text-xs text-ink-muted-48 uppercase font-bold tracking-widest border-b border-hairline pb-2">Care Event Log</h4>
                        <div className="max-h-[380px] overflow-y-auto space-y-4 pr-1">
                          {timelineLogs.map((log, i) => (
                            <div key={i} className="flex gap-2 text-xs">
                              <span className="text-[10px] text-ink-muted-48 font-mono shrink-0 pt-0.5">
                               {safeLocaleTimeString(log.timestamp)}
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
                            <div className="text-xs text-ink-muted-48 italic py-2">No events registered yet.</div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ==================== BED MANAGEMENT TAB ==================== */}
          {activeTab === 'beds' && (
            <div className="space-y-8">
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                
                {/* Visual Bed Grid map */}
                <div 
                  className="lg:col-span-2 bg-canvas border border-hairline p-6"
                  style={{ borderRadius: '18px' }}
                >
                  <h3 className="text-xs text-ink-muted-48 tracking-widest uppercase mb-6 font-semibold">Interactive Bed Ward Layout Map</h3>
                  
                  <div className="space-y-6">
                    {['ICU', 'CCU', 'General Ward', 'Private Ward'].map(dept => {
                      const deptBeds = beds.filter(b => b.department === dept);
                      return (
                        <div key={dept} className="border-b border-hairline pb-6 last:border-b-0">
                          <h4 className="text-xs text-ink font-semibold uppercase mb-3">{dept} Section</h4>
                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                            {deptBeds.map(b => (
                              <button
                                key={b.bedId}
                                onClick={() => setSelectedBed(b)}
                                className={`border p-4 rounded-lg text-left transition-all cursor-pointer ${
                                  selectedBed?.bedId === b.bedId
                                    ? 'ring-2 ring-primary ring-offset-2 scale-[1.02] shadow-md border-primary'
                                    : ''
                                } ${
                                  b.status === 'OCCUPIED' 
                                    ? 'bg-red-50/40 border-[#cf2d56] text-ink'
                                    : b.status === 'CLEANING'
                                    ? 'bg-yellow-50/40 border-timeline-done text-ink'
                                    : b.status === 'UNAVAILABLE'
                                    ? 'bg-gray-100/70 border-gray-300 text-gray-400 opacity-60'
                                    : 'bg-canvas border-hairline hover:border-hairline-strong text-ink'
                                }`}
                                style={{ borderRadius: '11px' }}
                              >
                                <span className="text-xs font-semibold block font-mono">{b.bedId}</span>
                                <span className={`text-[9px] uppercase font-bold mt-1.5 inline-block px-2 py-0.5 rounded-full ${
                                  b.status === 'OCCUPIED'
                                    ? 'bg-red-100 text-[#cf2d56]'
                                    : b.status === 'CLEANING'
                                    ? 'bg-yellow-100 text-timeline-done'
                                    : b.status === 'UNAVAILABLE'
                                    ? 'bg-gray-200 text-gray-500'
                                    : 'bg-green-100 text-[#1f8a65]'
                                }`}>
                                  {b.status}
                                </span>
                                {b.status === 'OCCUPIED' && (
                                  <span className="text-xs block font-semibold truncate mt-2 text-ink">{b.patientName}</span>
                                )}
                              </button>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Right Column: Admission allocation form */}
                <div className="space-y-6">
                  <h3 className="text-xs text-ink-muted-48 tracking-widest uppercase font-semibold">Active Ward Assignment</h3>
                  
                  {selectedBed ? (
                    <div className="space-y-6">
                      <div 
                        className="bg-canvas border border-hairline p-6"
                        style={{ borderRadius: '18px' }}
                      >
                        <div className="border-b border-hairline pb-4 mb-4 flex justify-between items-center">
                          <div>
                            <span className="text-xs text-ink-muted-48 block uppercase text-[10px]">Selected Location</span>
                            <h4 className="text-lg font-semibold text-ink font-mono">{selectedBed.bedId} <span className="font-sans font-normal text-sm text-ink-muted-48">({selectedBed.department})</span></h4>
                          </div>
                          {selectedBed.status !== 'OCCUPIED' && (
                            <button
                              onClick={() => handleDeleteBed(selectedBed.bedId)}
                              className="text-[9px] bg-red-100 hover:bg-red-200 text-[#cf2d56] px-3 py-1.5 rounded-full font-bold uppercase transition-colors cursor-pointer"
                              style={{ borderRadius: '20px' }}
                            >
                              Delete Bed
                            </button>
                          )}
                        </div>
                        
                        {selectedBed.status === 'OCCUPIED' ? (
                          <div className="space-y-4">
                            <div className="text-xs">
                              <span className="text-xs text-ink-muted-48 block uppercase text-[10px]">Occupied By:</span>
                              <span className="font-semibold text-ink text-base block mt-1">{selectedBed.patientName}</span>
                              <span className="text-xs text-ink mt-1 block font-mono">ID: {selectedBed.patientId}</span>
                              <span className="text-xs text-ink block font-mono">Episode: {selectedBed.episodeId}</span>
                            </div>

                            {(() => {
                              const patientDetail = patients.find(p => p.patientId === selectedBed.patientId);
                              if (!patientDetail) return null;
                              return (
                                <div className="mt-4 bg-canvas-parchment p-4 rounded-[14px] border border-hairline space-y-3 text-xs">
                                  <h5 className="text-[10px] uppercase font-bold tracking-wider text-ink-muted-48 border-b border-hairline pb-1.5">Patient Demographics</h5>
                                  <div className="grid grid-cols-2 gap-2 text-xs">
                                    <div><span className="text-ink-muted-48 block text-[10px]">Phone:</span> <strong className="text-ink font-semibold">{patientDetail.phone}</strong></div>
                                    <div><span className="text-ink-muted-48 block text-[10px]">Age / Gender:</span> <strong className="text-ink font-semibold">{patientDetail.age} Yrs / {patientDetail.gender}</strong></div>
                                    <div><span className="text-ink-muted-48 block text-[10px]">Blood Group:</span> <strong className="text-ink font-semibold">{patientDetail.bloodGroup}</strong></div>
                                    <div><span className="text-ink-muted-48 block text-[10px]">Current Dept:</span> <strong className="text-ink font-semibold">{patientDetail.department}</strong></div>
                                  </div>
                                  {patientDetail.allergies && patientDetail.allergies.length > 0 && (
                                    <div className="border-t border-hairline pt-2">
                                      <span className="text-ink-muted-48 block text-[10px]">Allergies:</span>
                                      <strong className="text-[#cf2d56] font-semibold">{patientDetail.allergies.join(', ')}</strong>
                                    </div>
                                  )}
                                  {patientDetail.assignedDoctor && (
                                    <div className="border-t border-hairline pt-2">
                                      <span className="text-ink-muted-48 block text-[10px]">Assigned Physician:</span>
                                      <strong className="text-ink font-semibold">{patientDetail.assignedDoctor.name || 'Assigned Doctor'}</strong>
                                    </div>
                                  )}
                                </div>
                              );
                            })()}

                            <button
                              onClick={() => handleUpdateBedStatus(selectedBed.bedId, 'CLEANING')}
                              className="w-full bg-[#cf2d56] hover:bg-[#b02245] text-canvas text-xs font-semibold py-3 rounded-full transition-colors uppercase cursor-pointer"
                            >
                              Release Bed & Mark Cleaning
                            </button>
                          </div>
                        ) : selectedBed.status === 'CLEANING' ? (
                          <div className="space-y-4">
                            <p className="text-xs text-ink-muted-48 leading-relaxed">This location is currently being sanitized. Complete sanitization to mark ready for allocation.</p>
                            <button
                              onClick={() => handleCleanBed(selectedBed.bedId)}
                              className="w-full bg-primary hover:bg-primary-focus text-canvas text-xs font-semibold py-3 rounded-full transition-colors uppercase cursor-pointer"
                            >
                              Mark Sanitized & Ready
                            </button>
                          </div>
                        ) : selectedBed.status === 'UNAVAILABLE' ? (
                          <div className="space-y-4">
                            <p className="text-xs text-ink-muted-48 leading-relaxed">This location is currently marked as Unavailable for maintenance or clinical holds.</p>
                            <button
                              onClick={() => handleUpdateBedStatus(selectedBed.bedId, 'AVAILABLE')}
                              className="w-full bg-primary hover:bg-primary-focus text-canvas text-xs font-semibold py-3 rounded-full transition-colors uppercase cursor-pointer"
                            >
                              Mark Available
                            </button>
                          </div>
                        ) : (
                          <div className="space-y-4">
                            <form onSubmit={handleAssignBed} className="space-y-4">
                              <div>
                                <label className="block text-xs text-ink uppercase mb-1 font-semibold">Select Registered Patient to Allocate</label>
                                <select
                                  required
                                  value={assignPatientId}
                                  onChange={e => setAssignPatientId(e.target.value)}
                                  className="w-full text-xs h-11 bg-canvas border border-hairline rounded-full px-3 outline-none"
                                  style={{ borderRadius: '20px' }}
                                >
                                  <option value="">-- Select Patient --</option>
                                  {patients
                                    .filter(p => !p.currentBed && p.status !== 'INACTIVE')
                                    .map(p => (
                                      <option key={p.patientId} value={p.patientId}>
                                        {p.name} ({p.patientId})
                                      </option>
                                    ))}
                                </select>
                              </div>
                              
                              <button
                                type="submit"
                                className="w-full bg-primary hover:bg-primary-focus text-canvas text-xs font-semibold py-3 rounded-full transition-colors uppercase cursor-pointer"
                              >
                                Commit Bed Admission
                              </button>
                            </form>

                            <div className="grid grid-cols-2 gap-2 border-t border-hairline pt-4">
                              <button
                                onClick={() => handleUpdateBedStatus(selectedBed.bedId, 'CLEANING')}
                                className="w-full text-center border border-hairline hover:bg-canvas-parchment text-ink-muted-85 text-[10px] font-bold py-2.5 rounded-full transition-colors uppercase cursor-pointer"
                                style={{ borderRadius: '20px' }}
                              >
                                Mark Cleaning
                              </button>
                              <button
                                onClick={() => handleUpdateBedStatus(selectedBed.bedId, 'UNAVAILABLE')}
                                className="w-full text-center border border-hairline hover:bg-canvas-parchment text-ink-muted-85 text-[10px] font-bold py-2.5 rounded-full transition-colors uppercase cursor-pointer"
                                style={{ borderRadius: '20px' }}
                              >
                                Mark Unavailable
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div 
                      className="bg-canvas border border-dashed border-hairline p-6 text-center text-ink-muted-48 text-xs"
                      style={{ borderRadius: '18px' }}
                    >
                      Select any bed ward tile on the left to allocate patients or verify clinical occupancy logs.
                    </div>
                  )}

                  {/* Register New Bed Location Form */}
                  <div 
                    className="bg-canvas border border-hairline p-6 mt-6"
                    style={{ borderRadius: '18px' }}
                  >
                    <h4 className="text-xs text-ink-muted-48 tracking-widest uppercase font-semibold mb-4">Register New Bed Location</h4>
                    <form onSubmit={handleAddBed} className="space-y-4 text-xs">
                      <div>
                        <label className="block text-ink uppercase mb-1 font-semibold text-[10px]">Bed Location ID</label>
                        <input
                          type="text" required placeholder="e.g. ICU-03"
                          value={newBedForm.bedId}
                          onChange={e => setNewBedForm({ ...newBedForm, bedId: e.target.value })}
                          className="w-full text-xs px-3 py-2 rounded-full border border-hairline bg-canvas"
                          style={{ borderRadius: '20px' }}
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="block text-ink uppercase mb-1 font-semibold text-[10px]">Ward / Section</label>
                          <select
                            value={newBedForm.wardId}
                            onChange={e => setNewBedForm({ ...newBedForm, wardId: e.target.value })}
                            className="w-full text-xs bg-canvas border border-hairline rounded-full px-3 py-2 outline-none cursor-pointer"
                            style={{ borderRadius: '20px' }}
                          >
                            <option value="WARD-ICU">ICU</option>
                            <option value="WARD-CCU">CCU</option>
                            <option value="WARD-GEN">General Ward</option>
                            <option value="WARD-PVT">Private Ward</option>
                          </select>
                        </div>
                        <div>
                          <label className="block text-ink uppercase mb-1 font-semibold text-[10px]">Bed Number</label>
                          <input
                            type="text" placeholder="e.g. 3"
                            value={newBedForm.bedNumber}
                            onChange={e => setNewBedForm({ ...newBedForm, bedNumber: e.target.value })}
                            className="w-full text-xs px-3 py-2 rounded-full border border-hairline bg-canvas"
                            style={{ borderRadius: '20px' }}
                          />
                        </div>
                      </div>
                      <button
                        type="submit"
                        className="w-full bg-ink hover:bg-ink-muted-80 text-canvas text-xs font-semibold py-2.5 rounded-full transition-colors uppercase cursor-pointer"
                        style={{ borderRadius: '20px' }}
                      >
                        Add Bed Location
                      </button>
                    </form>
                  </div>
                </div>

              </div>
            </div>
          )}

          {/* ==================== DOCTORS REGISTRY TAB ==================== */}
          {activeTab === 'doctors' && (
            <div className="space-y-8">
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                
                {/* Doctor Directory List Table */}
                <div 
                  className="lg:col-span-2 bg-canvas border border-hairline p-6"
                  style={{ borderRadius: '18px' }}
                >
                  <h3 className="text-xs text-ink-muted-48 tracking-widest uppercase mb-6 font-semibold font-sans">Clinical Consultants Directory</h3>
                  
                  {doctors.length === 0 ? (
                    <div className="text-xs text-ink-muted-48 py-12 text-center">No clinical doctors registered.</div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-left border-collapse text-xs">
                        <thead>
                          <tr className="border-b border-hairline text-ink-muted-48 uppercase font-semibold text-[10px]">
                            <th className="pb-3">Doctor ID</th>
                            <th className="pb-3">Doctor Name</th>
                            <th className="pb-3">Specialty</th>
                            <th className="pb-3">Department</th>
                            <th className="pb-3">Status</th>
                            <th className="pb-3 text-right">Actions</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-hairline">
                          {doctors.map(d => (
                            <tr key={d.doctorId} className="align-middle">
                              <td className="py-4 text-ink font-mono">{d.doctorId}</td>
                              <td className="py-4 font-semibold text-ink">
                                {d.name}
                                <span className="text-[10px] text-ink-muted-48 font-mono block mt-0.5">{d.phone || 'No Contact'}</span>
                              </td>
                              <td className="py-4 text-ink-muted-85">{d.specialty}</td>
                              <td className="py-4 text-ink-muted-85 uppercase font-semibold text-[10px]">{d.department || 'GENERAL'}</td>
                              <td className="py-4">
                                <span className={`text-[8px] uppercase font-bold px-2 py-0.5 rounded-full ${
                                  d.status === 'ACTIVE' ? 'bg-green-100 text-[#1f8a65]' : 'bg-gray-100 text-gray-500'
                                }`}>
                                  {d.status}
                                </span>
                              </td>
                              <td className="py-4 text-right">
                                <button
                                  onClick={() => handleDeleteDoctor(d.doctorId)}
                                  className="text-[10px] text-[#cf2d56] hover:underline uppercase font-bold cursor-pointer"
                                >
                                  Delete
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>

                {/* Register New Doctor Form */}
                <div 
                  className="bg-canvas border border-hairline p-6"
                  style={{ borderRadius: '18px' }}
                >
                  <h3 className="text-xs text-ink-muted-48 tracking-widest uppercase mb-4 font-semibold">Register Clinical Doctor</h3>
                  <form onSubmit={handleAddDoctor} className="space-y-4 text-xs">
                    <div>
                      <label className="block text-ink uppercase mb-1 font-semibold text-[10px]">Full Name</label>
                      <input
                        type="text" required placeholder="e.g. Dr. Ananya Iyer"
                        value={newDocForm.name}
                        onChange={e => setNewDocForm({ ...newDocForm, name: e.target.value })}
                        className="w-full text-xs px-3 py-2 rounded-full border border-hairline bg-canvas"
                        style={{ borderRadius: '20px' }}
                      />
                    </div>
                    <div>
                      <label className="block text-ink uppercase mb-1 font-semibold text-[10px]">Specialty / Area of Practice</label>
                      <input
                        type="text" required placeholder="e.g. Cardiologist"
                        value={newDocForm.specialty}
                        onChange={e => setNewDocForm({ ...newDocForm, specialty: e.target.value })}
                        className="w-full text-xs px-3 py-2 rounded-full border border-hairline bg-canvas"
                        style={{ borderRadius: '20px' }}
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-ink uppercase mb-1 font-semibold text-[10px]">Department</label>
                        <select
                          value={newDocForm.department}
                          onChange={e => setNewDocForm({ ...newDocForm, department: e.target.value })}
                          className="w-full text-xs bg-canvas border border-hairline rounded-full px-3 py-2 outline-none cursor-pointer"
                          style={{ borderRadius: '20px' }}
                        >
                          <option value="GENERAL">General Ward</option>
                          <option value="ICU">ICU</option>
                          <option value="OT">Operating Theater</option>
                          <option value="EMERGENCY">Emergency Room</option>
                          <option value="CARDIOLOGY">Cardiology</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-ink uppercase mb-1 font-semibold text-[10px]">Phone Number</label>
                        <div className="flex border border-hairline focus-within:border-hairline-strong rounded-full overflow-hidden bg-canvas transition-all" style={{ borderRadius: '20px' }}>
                          <div className="bg-canvas-card border-r border-hairline px-3.5 py-2 text-xs text-ink-muted-48 font-bold flex items-center shrink-0">
                            +91
                          </div>
                          <input
                            type="text" required placeholder="98765 43210"
                            value={newDocForm.phone}
                            onChange={e => setNewDocForm({ ...newDocForm, phone: e.target.value })}
                            className="w-full text-xs px-3 py-2 bg-transparent focus:outline-none border-none h-full font-mono"
                          />
                        </div>
                      </div>
                    </div>
                    <button
                      type="submit"
                      className="w-full bg-ink hover:bg-ink-muted-80 text-canvas text-xs font-semibold py-2.5 rounded-full transition-colors uppercase cursor-pointer"
                      style={{ borderRadius: '20px' }}
                    >
                      Register Doctor
                    </button>
                  </form>
                </div>

              </div>
            </div>
          )}

          {/* ==================== AMBULANCE CONTROL TAB ==================== */}
          {activeTab === 'ambulance' && (
            <div className="space-y-8">
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                
                {/* Left Area: Emergency Requests list */}
                <div 
                  className="lg:col-span-2 bg-canvas border border-hairline p-6"
                  style={{ borderRadius: '18px' }}
                >
                  <h3 className="text-xs text-ink-muted-48 tracking-widest uppercase mb-4 font-semibold font-sans">Emergency Dispatch Logs Queue</h3>
                  
                  {ambulanceRequests.length === 0 ? (
                    <div className="text-xs text-ink-muted-48 py-12 text-center">No ambulance requests registered.</div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-left border-collapse text-xs">
                        <thead>
                          <tr className="border-b border-hairline text-ink-muted-48 uppercase font-semibold text-[10px]">
                            <th className="pb-3">Request ID</th>
                            <th className="pb-3">Patient</th>
                            <th className="pb-3">Symptom</th>
                            <th className="pb-3">Location</th>
                            <th className="pb-3">Assigned Vehicle / Driver</th>
                            <th className="pb-3">Status</th>
                            <th className="pb-3 text-right">Actions</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-hairline">
                          {ambulanceRequests.map(a => {
                            const isRequested = a.status === 'REQUESTED' || a.status === 'Requested';
                            const isAssigned = a.status === 'ASSIGNED' || a.status === 'Assigned';
                            const isEnRoute = a.status === 'EN_ROUTE' || a.status === 'En Route';
                            const isArrived = a.status === 'ARRIVED' || a.status === 'Arrived';
                            const isCompleted = a.status === 'COMPLETED' || a.status === 'Completed';

                            return (
                              <tr key={a.requestId} className="align-middle">
                                <td className="py-4 text-ink font-mono">{a.requestId}</td>
                                <td className="py-4 font-semibold text-ink">
                                  {a.patientName || 'Anonymous'}
                                  <span className="text-[10px] text-ink-muted-48 font-mono block mt-0.5">{a.contact}</span>
                                </td>
                                <td className="py-4 text-ink-muted-85">{a.condition}</td>
                                <td className="py-4 text-ink-muted-85 max-w-[120px] truncate">{a.location}</td>
                                <td className="py-4">
                                  {a.driverName ? (
                                    <div>
                                      <div className="font-semibold text-ink">{a.driverName}</div>
                                      <div className="text-[10px] text-ink-muted-48 font-mono mt-0.5">{a.plateNumber} • {a.driverPhone}</div>
                                    </div>
                                  ) : (
                                    <span className="text-[10px] text-ink-muted-48 italic">Unassigned</span>
                                  )}
                                </td>
                                <td className="py-4">
                                  <span className={`text-[9px] uppercase font-semibold px-2 py-0.5 rounded-full ${
                                    isCompleted ? 'bg-green-100 text-[#1f8a65]' : 'bg-red-50 text-[#cf2d56] border border-red-200'
                                  }`}>
                                    {a.status}
                                  </span>
                                </td>
                                <td className="py-4 text-right">
                                  {isRequested && (
                                    <div className="flex gap-1.5 justify-end">
                                      <select
                                        value={dispatchVehicles[a.requestId] || ''}
                                        onChange={e => setDispatchVehicles({ ...dispatchVehicles, [a.requestId]: e.target.value })}
                                        className="text-[10px] bg-canvas border border-hairline rounded-full px-2 py-1 outline-none max-w-[140px]"
                                        style={{ borderRadius: '20px' }}
                                      >
                                        <option value="">-- Assign Vehicle --</option>
                                        {ambulanceVehicles.filter(v => v.status === 'AVAILABLE').map(v => (
                                          <option key={v.ambulanceId} value={v.ambulanceId}>
                                            {v.plateNumber} ({v.driverName})
                                          </option>
                                        ))}
                                      </select>
                                      <button 
                                        onClick={() => handleAmbulanceStatus(a.requestId, 'ASSIGNED', dispatchVehicles[a.requestId])}
                                        disabled={!dispatchVehicles[a.requestId]}
                                        className="text-[9px] font-bold bg-primary text-canvas px-3 py-1.5 rounded-full hover:bg-primary-focus cursor-pointer disabled:opacity-50"
                                        style={{ borderRadius: '20px' }}
                                      >
                                        Assign
                                      </button>
                                    </div>
                                  )}
                                  {isAssigned && (
                                    <button 
                                      onClick={() => handleAmbulanceStatus(a.requestId, 'EN_ROUTE')}
                                      className="text-[9px] font-bold bg-ink text-canvas px-3 py-1.5 rounded-full hover:bg-ink-muted-80 cursor-pointer"
                                      style={{ borderRadius: '20px' }}
                                    >
                                      Dispatch Fleet
                                    </button>
                                  )}
                                  {isEnRoute && (
                                    <button 
                                      onClick={() => handleAmbulanceStatus(a.requestId, 'ARRIVED')}
                                      className="text-[9px] font-bold bg-ink text-canvas px-3 py-1.5 rounded-full hover:bg-ink-muted-80 cursor-pointer"
                                      style={{ borderRadius: '20px' }}
                                    >
                                      Arrived
                                    </button>
                                  )}
                                  {isArrived && (
                                    <button 
                                      onClick={() => handleAmbulanceStatus(a.requestId, 'COMPLETED')}
                                      className="text-[9px] font-bold bg-primary text-canvas px-3 py-1.5 rounded-full hover:bg-primary-focus cursor-pointer"
                                      style={{ borderRadius: '20px' }}
                                    >
                                      Complete Log
                                    </button>
                                  )}
                                  {isCompleted && (
                                    <span className="text-[10px] text-ink-muted-48 uppercase pr-2">Archived</span>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>

                {/* Right Area: Registered vehicles & Register vehicle form */}
                <div className="space-y-6">
                  {/* Fleet registry list */}
                  <div 
                    className="bg-canvas border border-hairline p-5"
                    style={{ borderRadius: '18px' }}
                  >
                    <h4 className="text-xs text-ink-muted-48 uppercase font-bold tracking-widest border-b border-hairline pb-2 mb-3">Ambulance Fleet Directory</h4>
                    <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                      {ambulanceVehicles.map(v => (
                        <div key={v.ambulanceId} className="bg-canvas-parchment border border-hairline p-3 rounded-[11px] flex justify-between items-center text-xs">
                          <div>
                            <div className="font-semibold text-ink">{v.plateNumber}</div>
                            <div className="text-[10px] text-ink-muted-48 mt-0.5">Driver: {v.driverName} ({v.driverPhone})</div>
                            <span className={`text-[8px] uppercase font-bold px-1.5 py-0.5 rounded-full mt-1.5 inline-block ${
                              v.status === 'AVAILABLE' ? 'bg-green-100 text-[#1f8a65]' : v.status === 'DISPATCHED' ? 'bg-red-100 text-[#cf2d56]' : 'bg-gray-100 text-gray-500'
                            }`}>
                              {v.status}
                            </span>
                          </div>
                          {v.status !== 'DISPATCHED' && (
                            <button
                              onClick={() => handleDeleteVehicle(v.ambulanceId)}
                              className="text-[9px] text-[#cf2d56] hover:underline uppercase font-bold cursor-pointer"
                            >
                              Delete
                            </button>
                          )}
                        </div>
                      ))}
                      {ambulanceVehicles.length === 0 && (
                        <div className="text-xs text-ink-muted-48 italic py-4 text-center">No vehicles registered yet.</div>
                      )}
                    </div>
                  </div>

                  {/* Register new vehicle form */}
                  <div 
                    className="bg-canvas border border-hairline p-5"
                    style={{ borderRadius: '18px' }}
                  >
                    <h4 className="text-xs text-ink-muted-48 uppercase font-bold tracking-widest border-b border-hairline pb-2 mb-3">Register Ambulance Driver</h4>
                    <form onSubmit={handleAddVehicle} className="space-y-3 text-xs">
                      <div>
                        <label className="block text-ink uppercase mb-0.5 font-semibold text-[10px]">Plate Number</label>
                        <input
                          type="text" required placeholder="e.g. MH-12-AB-1234"
                          value={newVehForm.plateNumber}
                          onChange={e => setNewVehForm({ ...newVehForm, plateNumber: e.target.value })}
                          className="w-full text-xs px-3 py-2 rounded-full border border-hairline bg-canvas"
                          style={{ borderRadius: '20px' }}
                        />
                      </div>
                      <div>
                        <label className="block text-ink uppercase mb-0.5 font-semibold text-[10px]">Driver Full Name</label>
                        <input
                          type="text" required placeholder="e.g. Ramesh Kumar"
                          value={newVehForm.driverName}
                          onChange={e => setNewVehForm({ ...newVehForm, driverName: e.target.value })}
                          className="w-full text-xs px-3 py-2 rounded-full border border-hairline bg-canvas"
                          style={{ borderRadius: '20px' }}
                        />
                      </div>
                      <div>
                        <label className="block text-ink uppercase mb-0.5 font-semibold text-[10px]">Driver Phone Number</label>
                        <input
                          type="text" required placeholder="e.g. +91 99999 88888"
                          value={newVehForm.driverPhone}
                          onChange={e => setNewVehForm({ ...newVehForm, driverPhone: e.target.value })}
                          className="w-full text-xs px-3 py-2 rounded-full border border-hairline bg-canvas"
                          style={{ borderRadius: '20px' }}
                        />
                      </div>
                      <button
                        type="submit"
                        className="w-full bg-ink hover:bg-ink-muted-80 text-canvas text-xs font-semibold py-2.5 rounded-full transition-colors uppercase cursor-pointer"
                        style={{ borderRadius: '20px' }}
                      >
                        Register Driver Vehicle
                      </button>
                    </form>
                  </div>
                </div>

              </div>
            </div>
          )}

          {/* ==================== BLOOD BANK MANAGEMENT TAB ==================== */}
          {activeTab === 'blood' && (
            <div className="space-y-8">
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                
                {/* Stock List Table */}
                <div 
                  className="lg:col-span-2 bg-canvas border border-hairline p-6"
                  style={{ borderRadius: '18px' }}
                >
                  <h3 className="text-xs text-ink-muted-48 tracking-widest uppercase mb-6 font-semibold font-sans">Inventory Blood Group Storage</h3>
                  
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead>
                        <tr className="border-b border-hairline text-ink-muted-48 uppercase font-semibold text-[10px]">
                          <th className="pb-3">Blood Group</th>
                          <th className="pb-3">Available Units</th>
                          <th className="pb-3">Reserved Units</th>
                          <th className="pb-3">Status</th>
                          <th className="pb-3 text-right">Adjust Stock Quantity</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-hairline">
                        {bloodBank.map(b => {
                          const isCritical = b.unitsAvailable <= 1;
                          return (
                            <tr key={b.bloodGroup} className="align-middle">
                              <td className="py-4">
                                <span className="text-sm font-bold text-ink">{b.bloodGroup}</span>
                              </td>
                              <td className="py-4 text-xs font-semibold text-ink">
                                {b.unitsAvailable} Units
                              </td>
                              <td className="py-4 text-xs text-ink-muted-48">
                                {b.unitsReserved} Units
                              </td>
                              <td className="py-4">
                                <span className={`text-[9px] uppercase font-bold px-2 py-0.5 rounded-full ${
                                  isCritical ? 'bg-red-100 text-[#cf2d56]' : 'bg-green-100 text-[#1f8a65]'
                                }`}>
                                  {isCritical ? 'CRITICAL SHORTAGE' : 'STABLE STOCK'}
                                </span>
                              </td>
                              <td className="py-4 text-right">
                                <div className="flex justify-end items-center gap-2">
                                  <button
                                    onClick={() => handleUpdateBloodStock(b.bloodGroup, 'DECREMENT')}
                                    className="w-8 h-8 rounded-full border border-hairline bg-canvas hover:bg-canvas-parchment flex justify-center items-center font-bold text-ink cursor-pointer transition-colors"
                                  >
                                    -
                                  </button>
                                  <span className="text-xs font-mono font-semibold w-8 text-center">{b.unitsAvailable}</span>
                                  <button
                                    onClick={() => handleUpdateBloodStock(b.bloodGroup, 'INCREMENT')}
                                    className="w-8 h-8 rounded-full border border-hairline bg-canvas hover:bg-canvas-parchment flex justify-center items-center font-bold text-ink cursor-pointer transition-colors"
                                  >
                                    +
                                  </button>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Trigger request & outreach */}
                <div 
                  className="bg-canvas border border-hairline p-6 space-y-6"
                  style={{ borderRadius: '18px' }}
                >
                  <h3 className="text-xs text-ink-muted-48 tracking-widest uppercase font-semibold">Trigger Emergency Blood Check</h3>
                  
                  <form onSubmit={handleBloodRequest} className="space-y-4 text-xs">
                    <div>
                      <label className="block text-ink uppercase mb-1 font-semibold text-[10px]">Required Blood Group</label>
                      <select
                        required
                        value={bloodReq.group}
                        onChange={e => setBloodReq({ ...bloodReq, group: e.target.value })}
                        className="w-full text-xs h-11 bg-canvas border border-hairline rounded-full px-3 outline-none"
                        style={{ borderRadius: '20px' }}
                      >
                        <option value="">-- Select Blood Group --</option>
                        {['O-', 'O+', 'A-', 'A+', 'B-', 'B+', 'AB-', 'AB+'].map(g => (
                          <option key={g} value={g}>{g}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-ink uppercase mb-1 font-semibold text-[10px]">Required Units Quantity</label>
                      <input 
                        type="number" min="1" required value={bloodReq.units}
                        onChange={e => setBloodReq({ ...bloodReq, units: parseInt(e.target.value) || 1 })}
                        className="w-full text-xs px-3 py-2 rounded-full border border-hairline bg-canvas"
                        style={{ borderRadius: '20px' }}
                      />
                    </div>
                    <button
                      type="submit"
                      className="w-full bg-primary hover:bg-primary-focus text-canvas text-xs font-semibold py-3 rounded-full transition-colors uppercase cursor-pointer"
                    >
                      Verify Stock & Outreach
                    </button>
                  </form>

                  {/* Outreach list */}
                  {eligibleDonors.length > 0 && (
                    <div className="border-t border-hairline pt-4 space-y-3">
                      <h4 className="text-xs text-[#cf2d56] font-semibold uppercase flex items-center gap-1">
                        <AlertTriangle size={12} /> Matching Consenting Donors
                      </h4>
                      <p className="text-[11px] text-ink-muted-48 leading-relaxed">Donors who have consented to emergency outreach dispatches:</p>
                      
                      <div className="space-y-2 max-h-48 overflow-y-auto">
                        {eligibleDonors.map(d => (
                          <div key={d.donorId} className="bg-canvas-parchment border border-hairline rounded-[11px] p-3 text-xs">
                            <div className="font-semibold text-ink text-sm">{d.name}</div>
                            <div className="text-[10px] text-ink-muted-48 mt-1">
                              Phone: <strong className="text-ink">{d.phone}</strong>
                            </div>
                            <div className="text-[9px] text-[#1f8a65] font-bold uppercase mt-2">CONSENT VERIFIED • OUTREACH OK</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="pt-4 border-t border-hairline mt-4">
                    <button
                      onClick={() => setIsDonorModalOpen(true)}
                      className="w-full bg-canvas border border-hairline hover:border-hairline-strong text-ink text-xs font-bold py-3 rounded-full uppercase cursor-pointer transition-all flex items-center justify-center gap-2 bg-canvas-parchment"
                      style={{ borderRadius: '20px' }}
                    >
                      <Users size={14} /> Open Donors Registry Log
                    </button>
                  </div>
                </div>

              </div>
            </div>
          )}

          {/* ==================== INVENTORY SUPPLIES TAB ==================== */}
          {activeTab === 'inventory' && (
            <div className="space-y-8">
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                
                {/* Supplies table */}
                <div 
                  className="lg:col-span-2 bg-canvas border border-hairline p-6"
                  style={{ borderRadius: '18px' }}
                >
                  <h3 className="text-xs text-ink-muted-48 tracking-widest uppercase mb-4 font-semibold">Stock Ledger List</h3>
                  
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead>
                        <tr className="border-b border-hairline text-ink-muted-48 uppercase font-semibold">
                          <th className="pb-3 pr-6">SKU</th>
                          <th className="pb-3 pr-6 text-sm font-sans font-normal text-ink">Item Name</th>
                          <th className="pb-3 pr-6">Dept Category</th>
                          <th className="pb-3 pr-6">Stock Units</th>
                          <th className="pb-3 pr-6">Location</th>
                          <th className="pb-3 pr-6">Expiry Code</th>
                          <th className="pb-3 text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-hairline">
                        {inventory.map(i => (
                          <tr key={i.itemId} className="align-middle">
                            <td className="py-3 pr-6 text-ink-muted-85 font-mono">{i.sku}</td>
                            <td className="py-3 pr-6 text-sm font-semibold text-ink">
                              {i.name}
                              {i.quantity <= i.minStockLevel && (
                                <span className="ml-2 text-[9px] bg-red-100 text-[#cf2d56] font-bold px-2 py-0.5 rounded-full uppercase">
                                  Low
                                </span>
                              )}
                            </td>
                            <td className="py-3 pr-6 text-ink-muted-85">
                              <div className="flex items-center gap-1.5 uppercase text-[10px] font-semibold text-ink-muted-85">
                                {getCategoryIcon(i.category)}
                                <span>{i.category}</span>
                              </div>
                            </td>
                            <td className="py-3 pr-6 text-ink font-semibold">{i.quantity} {i.unit}</td>
                            <td className="py-3 pr-6 text-ink-muted-85">{i.location}</td>
                            <td className="py-3 pr-6 text-ink-muted-85">{i.expiryDate || 'N/A'}</td>
                            <td className="py-3 text-right">
                              <button
                                onClick={() => {
                                  setConfirmModal({
                                    isOpen: true,
                                    title: 'Delete Product SKU',
                                    message: `Are you sure you want to permanently delete SKU ${i.sku} (${i.name}) from the stock catalog?`,
                                    onConfirm: async () => {
                                      try {
                                        await api.delete(`/inventory/${i.itemId}`);
                                        addToast(`Deleted SKU ${i.sku} (${i.name})`, 'success');
                                        refreshData();
                                      } catch (err) {
                                        addToast(err.message, 'error');
                                      }
                                    }
                                  });
                                }}
                                className="text-[10px] text-[#cf2d56] border border-red-200 hover:border-red-500 hover:bg-red-50 px-2.5 py-1 rounded-full cursor-pointer font-bold uppercase transition-all"
                                style={{ borderRadius: '20px' }}
                              >
                                Delete
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Log stock movement & Add Catalog Product */}
                <div className="space-y-6">
                  {/* Log stock movement */}
                  <div 
                    className="bg-canvas border border-hairline p-6"
                    style={{ borderRadius: '18px' }}
                  >
                    <h3 className="text-xs text-ink-muted-48 tracking-widest uppercase mb-6 font-semibold">Log Stock Movement</h3>
                    
                    <form onSubmit={handleInventoryMovement} className="space-y-4 text-xs">
                      <div>
                        <label className="block text-ink uppercase mb-1 font-semibold text-[10px]">Select Product SKU</label>
                        <select
                          required
                          value={invMove.itemId}
                          onChange={e => setInvMove({ ...invMove, itemId: e.target.value })}
                          className="w-full text-xs h-11 bg-canvas border border-hairline rounded-full px-3 outline-none"
                          style={{ borderRadius: '20px' }}
                        >
                          <option value="">-- Select SKU --</option>
                          {inventory.map(i => (
                            <option key={i.itemId} value={i.itemId}>
                              {i.name} ({i.sku})
                            </option>
                          ))}
                        </select>
                      </div>
                      
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="block text-ink uppercase mb-1 font-semibold text-[10px]">Log Action</label>
                          <select
                            value={invMove.type}
                            onChange={e => setInvMove({ ...invMove, type: e.target.value })}
                            className="w-full text-xs bg-canvas border border-hairline rounded-full px-3 py-2 outline-none cursor-pointer"
                            style={{ borderRadius: '20px' }}
                          >
                            <option>Received</option>
                            <option>Issued</option>
                            <option>Wasted</option>
                          </select>
                        </div>
                        <div>
                          <label className="block text-ink uppercase mb-1 font-semibold text-[10px]">Units Qty</label>
                          <input 
                            type="number" min="1" required value={invMove.qty}
                            onChange={e => setInvMove({ ...invMove, qty: parseInt(e.target.value) || 1 })}
                            className="w-full text-xs px-3 py-2 rounded-full border border-hairline bg-canvas"
                            style={{ borderRadius: '20px' }}
                          />
                        </div>
                      </div>

                      <div>
                        <label className="block text-ink uppercase mb-1 font-semibold text-[10px]">Notes / Batch Code</label>
                        <input 
                          type="text" value={invMove.notes}
                          onChange={e => setInvMove({ ...invMove, notes: e.target.value })}
                          className="w-full text-xs px-3 py-2 rounded-full border border-hairline bg-canvas"
                          style={{ borderRadius: '20px' }}
                          placeholder="Logs explanation..."
                        />
                      </div>

                      <button
                        type="submit"
                        className="w-full bg-ink hover:bg-ink-muted-80 text-canvas text-xs font-semibold py-2.5 rounded-full transition-colors uppercase cursor-pointer"
                        style={{ borderRadius: '20px' }}
                      >
                        Commit Log Movement
                      </button>
                    </form>
                  </div>

                  {/* Add Catalog Item */}
                  <div 
                    className="bg-canvas border border-hairline p-6"
                    style={{ borderRadius: '18px' }}
                  >
                    <h3 className="text-xs text-ink-muted-48 tracking-widest uppercase mb-4 font-semibold">Add Catalog Product</h3>
                    <form onSubmit={handleAddInventoryItem} className="space-y-4 text-xs">
                      <div>
                        <label className="block text-ink uppercase mb-1 font-semibold text-[10px]">Product / Item Name</label>
                        <input
                          type="text" required placeholder="e.g. Paracetamol 650mg"
                          value={newInvForm.name}
                          onChange={e => setNewInvForm({ ...newInvForm, name: e.target.value })}
                          className="w-full text-xs px-3 py-2 rounded-full border border-hairline bg-canvas"
                          style={{ borderRadius: '20px' }}
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="block text-ink uppercase mb-1 font-semibold text-[10px]">Category</label>
                          <select
                            value={newInvForm.category}
                            onChange={e => setNewInvForm({ ...newInvForm, category: e.target.value })}
                            className="w-full text-xs bg-canvas border border-hairline rounded-full px-3 py-2 outline-none cursor-pointer"
                            style={{ borderRadius: '20px' }}
                          >
                            <option value="MEDICINE">Medicine</option>
                            <option value="CONSUMABLE">Consumable</option>
                            <option value="SURGICAL">Surgical</option>
                            <option value="LAB">Lab Supply</option>
                            <option value="EMERGENCY">Emergency Supply</option>
                            <option value="EQUIPMENT">Equipment</option>
                          </select>
                        </div>
                        <div>
                          <label className="block text-ink uppercase mb-1 font-semibold text-[10px]">Stock Unit</label>
                          <input
                            type="text" required placeholder="e.g. tablets, vials"
                            value={newInvForm.unit}
                            onChange={e => setNewInvForm({ ...newInvForm, unit: e.target.value })}
                            className="w-full text-xs px-3 py-2 rounded-full border border-hairline bg-canvas"
                            style={{ borderRadius: '20px' }}
                          />
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="block text-ink uppercase mb-1 font-semibold text-[10px]">Opening Stock</label>
                          <input
                            type="number" min="0" required
                            value={newInvForm.quantity}
                            onChange={e => setNewInvForm({ ...newInvForm, quantity: parseInt(e.target.value) || 0 })}
                            className="w-full text-xs px-3 py-2 rounded-full border border-hairline bg-canvas"
                            style={{ borderRadius: '20px' }}
                          />
                        </div>
                        <div>
                          <label className="block text-ink uppercase mb-1 font-semibold text-[10px]">Min Alert Level</label>
                          <input
                            type="number" min="0" required
                            value={newInvForm.minimumStock}
                            onChange={e => setNewInvForm({ ...newInvForm, minimumStock: parseInt(e.target.value) || 10 })}
                            className="w-full text-xs px-3 py-2 rounded-full border border-hairline bg-canvas"
                            style={{ borderRadius: '20px' }}
                          />
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="block text-ink uppercase mb-1 font-semibold text-[10px]">Storage Loc</label>
                          <select
                            value={newInvForm.location}
                            onChange={e => setNewInvForm({ ...newInvForm, location: e.target.value })}
                            className="w-full text-xs bg-canvas border border-hairline rounded-full px-3 py-2 outline-none cursor-pointer"
                            style={{ borderRadius: '20px' }}
                          >
                            <option value="PHARMACY">Pharmacy</option>
                            <option value="ICU">ICU Ward</option>
                            <option value="OT">Operation Theater</option>
                            <option value="EMERGENCY">Emergency Room</option>
                            <option value="GENERAL">General Ward</option>
                          </select>
                        </div>
                        <div>
                          <label className="block text-ink uppercase mb-1 font-semibold text-[10px]">Supplier Name</label>
                          <input
                            type="text" placeholder="e.g. Civimed Suppliers"
                            value={newInvForm.supplier}
                            onChange={e => setNewInvForm({ ...newInvForm, supplier: e.target.value })}
                            className="w-full text-xs px-3 py-2 rounded-full border border-hairline bg-canvas"
                            style={{ borderRadius: '20px' }}
                          />
                        </div>
                      </div>
                      <button
                        type="submit"
                        className="w-full bg-ink hover:bg-ink-muted-80 text-canvas text-xs font-semibold py-2.5 rounded-full transition-colors uppercase cursor-pointer"
                        style={{ borderRadius: '20px' }}
                      >
                        Create Catalog Entry
                      </button>
                    </form>
                  </div>
                </div>

              </div>
            </div>
          )}

          {/* ==================== OT SURGERY SCHEDULER TAB ==================== */}
          {activeTab === 'surgeries' && (
            <div className="space-y-8">
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                
                {/* Surgeries grid list */}
                <div 
                  className="lg:col-span-2 bg-canvas border border-hairline p-6"
                  style={{ borderRadius: '18px' }}
                >
                  <h3 className="text-xs text-ink-muted-48 tracking-widest uppercase mb-4 font-semibold">Active Surgery Allocations</h3>
                  
                  {surgeries.length === 0 ? (
                    <div className="text-xs text-ink-muted-48 py-12 text-center">No surgeries booked.</div>
                  ) : (
                    <div className="divide-y divide-hairline">
                      {surgeries.map(s => (
                        <div key={s.surgeryId} className="py-4 flex justify-between items-center">
                          <div>
                            <span className="text-xs text-ink-muted-48 uppercase block font-mono">{s.surgeryId}</span>
                            <h4 className="text-base font-semibold text-ink">{s.procedure}</h4>
                            <div className="text-xs text-ink-muted-85 mt-1">
                              Patient ID: <span className="font-mono">{s.patientId}</span> ({s.patientName}) • Doctor: {s.doctorName}
                            </div>
                          </div>
                          <div className="text-right">
                            <span className="text-xs font-semibold px-2.5 py-1 bg-canvas-parchment border border-hairline rounded-full">
                              {s.operatingTheatre}
                            </span>
                            <span className="text-[11px] text-ink-muted-48 block mt-2">{s.time}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Booking Form */}
                <div 
                  className="bg-canvas border border-hairline p-6"
                  style={{ borderRadius: '18px' }}
                >
                  <h3 className="text-xs text-ink-muted-48 tracking-widest uppercase mb-6 font-semibold">Book Operating Theatre</h3>
                  
                  <form onSubmit={handleRegisterSurgery} className="space-y-4">
                    <div>
                      <label className="block text-xs text-ink uppercase mb-1 font-semibold">Select Patient</label>
                      <select
                        required
                        value={surgForm.patientId}
                        onChange={e => setSurgForm({ ...surgForm, patientId: e.target.value })}
                        className="w-full text-sm h-11"
                      >
                        <option value="">-- Select Patient --</option>
                        {patients.map(p => (
                          <option key={p.patientId} value={p.patientId}>
                            {p.name} ({p.patientId})
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs text-ink uppercase mb-1 font-semibold">Procedure Name</label>
                      <input 
                        type="text" required value={surgForm.procedure}
                        onChange={e => setSurgForm({ ...surgForm, procedure: e.target.value })}
                        className="w-full text-sm" placeholder="e.g. Laparoscopic Appendectomy"
                      />
                    </div>

                    <div>
                      <label className="block text-xs text-ink uppercase mb-1 font-semibold">Consulting Surgeon</label>
                      <select
                        value={surgForm.doctorId}
                        onChange={e => setSurgForm({ ...surgForm, doctorId: e.target.value })}
                        className="w-full text-sm h-11"
                      >
                        {doctorsList.map(d => (
                          <option key={d.id || d._id} value={d.id || d._id}>
                            {d.name} ({d.specialty})
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs text-ink uppercase mb-1 font-semibold">Theatre (OT)</label>
                        <select
                          value={surgForm.theatre}
                          onChange={e => setSurgForm({ ...surgForm, theatre: e.target.value })}
                          className="w-full text-sm h-11"
                        >
                          <option>OT-01</option>
                          <option>OT-02</option>
                          <option>OT-03</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs text-ink uppercase mb-1 font-semibold">Schedule Time</label>
                        <input 
                          type="datetime-local" required value={surgForm.time}
                          onChange={e => setSurgForm({ ...surgForm, time: e.target.value })}
                          className="w-full text-xs px-3 py-2 rounded-full border border-hairline bg-canvas"
                          style={{ borderRadius: '20px' }}
                        />
                      </div>
                    </div>

                    <button
                      type="submit"
                      className="w-full bg-primary hover:bg-primary-focus text-canvas text-xs font-semibold py-3 rounded-full transition-colors uppercase cursor-pointer"
                    >
                      Book OT Schedule
                    </button>
                  </form>
                </div>

              </div>
            </div>
          )}

        </main>
      </div>

      {/* Premium Custom Confirmation Modal */}
      {confirmModal.isOpen && (
        <div className="fixed inset-0 bg-[#000000]/60 z-[100] flex justify-center items-center backdrop-blur-sm">
          <div 
            className="bg-white border border-[#e5e5e5] p-6 max-w-sm w-full mx-4 space-y-6 shadow-2xl"
            style={{ borderRadius: '20px' }}
          >
            <div>
              <h3 className="text-xs uppercase tracking-wider text-ink-muted-48 font-bold mb-2">{confirmModal.title}</h3>
              <p className="text-sm text-ink leading-relaxed font-semibold">{confirmModal.message}</p>
            </div>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setConfirmModal({ isOpen: false, title: '', message: '', onConfirm: null })}
                className="text-xs border border-hairline hover:border-hairline-strong px-4 py-2 rounded-full cursor-pointer font-bold uppercase transition-all bg-canvas-parchment text-ink"
                style={{ borderRadius: '20px' }}
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  if (confirmModal.onConfirm) confirmModal.onConfirm();
                  setConfirmModal({ isOpen: false, title: '', message: '', onConfirm: null });
                }}
                className="text-xs bg-[#cf2d56] hover:bg-[#b02245] text-canvas px-5 py-2 rounded-full cursor-pointer font-bold uppercase transition-colors"
                style={{ borderRadius: '20px' }}
              >
                Proceed Deletion
              </button>
            </div>
          </div>
        </div>
      )}

      {/* General Blood Donors Log Modal */}
      {isDonorModalOpen && (
        <div className="fixed inset-0 bg-[#000000]/60 z-[90] flex justify-center items-center backdrop-blur-sm">
          <div 
            className="bg-white border border-[#e5e5e5] p-6 max-w-2xl w-full mx-4 space-y-6 shadow-2xl flex flex-col max-h-[90vh]"
            style={{ borderRadius: '20px' }}
          >
            <div className="flex justify-between items-center border-b border-hairline pb-3 shrink-0">
              <div>
                <h3 className="text-xs uppercase tracking-widest text-ink-muted-48 font-bold">Blood Bank Module</h3>
                <h2 className="text-base font-semibold text-ink">General Blood Donors Log</h2>
              </div>
              <button 
                onClick={() => setIsDonorModalOpen(false)}
                className="text-xs text-ink-muted-48 hover:text-ink border border-hairline hover:border-hairline-strong px-3 py-1.5 rounded-full cursor-pointer font-bold uppercase transition-all bg-canvas-parchment"
                style={{ borderRadius: '20px' }}
              >
                Close Log
              </button>
            </div>

            {/* Donor Addition Form */}
            <form onSubmit={handleAddDonor} className="bg-canvas-parchment border border-hairline p-4 rounded-[14px] grid grid-cols-1 md:grid-cols-4 gap-3 items-end shrink-0 text-xs">
              <div className="md:col-span-2">
                <label className="block text-[10px] text-ink uppercase mb-1 font-bold">Full Name</label>
                <input 
                  type="text" required placeholder="John Doe"
                  value={newDonorForm.name}
                  onChange={e => setNewDonorForm({ ...newDonorForm, name: e.target.value })}
                  className="w-full text-xs px-3 py-2 rounded-full border border-hairline bg-canvas"
                  style={{ borderRadius: '20px' }}
                />
              </div>
              <div>
                <label className="block text-[10px] text-ink uppercase mb-1 font-bold">Blood Group</label>
                <select 
                  value={newDonorForm.bloodGroup}
                  onChange={e => setNewDonorForm({ ...newDonorForm, bloodGroup: e.target.value })}
                  className="w-full text-xs h-9 bg-canvas border border-hairline rounded-full px-2 outline-none"
                  style={{ borderRadius: '20px' }}
                >
                  {['O-', 'O+', 'A-', 'A+', 'B-', 'B+', 'AB-', 'AB+'].map(g => (
                    <option key={g} value={g}>{g}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-[10px] text-ink uppercase mb-1 font-bold">Phone Number</label>
                <div className="flex border border-hairline focus-within:border-hairline-strong rounded-full overflow-hidden bg-canvas transition-all" style={{ borderRadius: '20px' }}>
                  <div className="bg-canvas-card border-r border-hairline px-3.5 py-2 text-xs text-ink-muted-48 font-bold flex items-center shrink-0">
                    +91
                  </div>
                  <input 
                    type="text" required placeholder="9876543210"
                    value={newDonorForm.phone}
                    onChange={e => setNewDonorForm({ ...newDonorForm, phone: e.target.value })}
                    className="w-full text-xs px-3 py-2 bg-transparent focus:outline-none border-none h-full font-mono"
                  />
                </div>
              </div>
              <div className="md:col-span-2">
                <label className="block text-[10px] text-ink uppercase mb-1 font-bold">Location (City/State)</label>
                <input 
                  type="text" placeholder="Noida, UP"
                  value={newDonorForm.location}
                  onChange={e => setNewDonorForm({ ...newDonorForm, location: e.target.value })}
                  className="w-full text-xs px-3 py-2 rounded-full border border-hairline bg-canvas"
                  style={{ borderRadius: '20px' }}
                />
              </div>
              <div className="md:col-span-2">
                <button 
                  type="submit"
                  className="w-full bg-primary hover:bg-primary-focus text-canvas text-xs font-semibold py-2 rounded-full transition-colors uppercase cursor-pointer"
                  style={{ borderRadius: '20px' }}
                >
                  Add Blood Donor
                </button>
              </div>
            </form>

            {/* Donors List Table */}
            <div className="flex-grow overflow-y-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-hairline text-ink-muted-48 uppercase font-bold text-[9px] sticky top-0 bg-white z-10">
                    <th className="pb-2">Donor ID</th>
                    <th className="pb-2">Name</th>
                    <th className="pb-2">Group</th>
                    <th className="pb-2">Contact Details</th>
                    <th className="pb-2 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-hairline">
                  {donorsList.map(d => (
                    <tr key={d.donorId} className="align-middle">
                      <td className="py-2.5 font-mono font-semibold text-[10px] text-ink-muted-48">{d.donorId}</td>
                      <td className="py-2.5 font-semibold text-ink">{d.name}</td>
                      <td className="py-2.5">
                        <span className="bg-canvas border border-hairline text-ink px-2 py-0.5 rounded-full font-bold text-[10px]">
                          {d.bloodGroup}
                        </span>
                      </td>
                      <td className="py-2.5 text-ink-muted-85">
                        <div>{d.phone}</div>
                        <div className="text-[9px] text-ink-muted-48 mt-0.5">{d.location || 'Hospital Area'}</div>
                      </td>
                      <td className="py-2.5 text-right">
                        <button 
                          onClick={() => handleDeleteDonor(d.donorId, d.name)}
                          className="text-[10px] text-[#cf2d56] hover:text-[#b02244] border border-hairline hover:border-hairline-strong px-2.5 py-1 rounded-full cursor-pointer font-bold uppercase transition-all bg-canvas-parchment"
                          style={{ borderRadius: '20px' }}
                        >
                          Remove
                        </button>
                      </td>
                    </tr>
                  ))}
                  {donorsList.length === 0 && (
                    <tr>
                      <td colSpan="5" className="text-center py-6 text-ink-muted-48 italic">No registered blood donors found in log.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Full-Screen Super-Sized QR Code Zoom Modal */}
      {showQrZoom && (
        <div 
          className="fixed inset-0 bg-black/80 z-[100] flex justify-center items-center p-6 backdrop-blur-md cursor-pointer"
          onClick={() => setShowQrZoom(null)}
        >
          <div 
            className="bg-white p-8 rounded-3xl flex flex-col items-center max-w-md w-full shadow-2xl relative border border-hairline"
            onClick={e => e.stopPropagation()}
          >
            <button 
              onClick={() => setShowQrZoom(null)}
              className="absolute top-4 right-4 text-ink-muted-48 hover:text-ink text-xs font-bold bg-canvas-parchment border border-hairline px-3.5 py-1.5 rounded-full cursor-pointer"
            >
              ✕ Close
            </button>
            <span className="text-xs text-ink-muted-48 uppercase font-bold tracking-widest mb-1">High-Resolution Patient QR Pass</span>
            <h3 className="text-lg font-bold text-ink mb-4">{selectedPatient?.name || activeCardPatient?.name || 'Clinical QR Pass'}</h3>
            <div className="bg-white p-4 rounded-2xl border-2 border-hairline shadow-inner mb-4">
              <img src={showQrZoom} alt="Enlarged QR Code" className="w-72 h-72 md:w-80 md:h-80 object-contain" />
            </div>
            <p className="text-xs text-primary font-semibold text-center">
              📷 Ready for instant rear-camera scanning by Doctor PWA
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

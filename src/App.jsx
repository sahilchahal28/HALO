import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AppProvider, useApp } from './context/AppContext';
import RolePortal from './components/RolePortal';
import AdminDashboard from './admin/AdminDashboard';
import DoctorDashboard from './Doctor-PWA/DoctorDashboard';
import PatientDashboard from './Patient-PWA/PatientDashboard';

// Role Guard Component (Bypassed for Demo)
function ProtectedRoute({ children }) {
  return children;
}

// Universal Portal Selection Root.
// When running as an INSTALLED PWA (standalone), a device that wakes up on "/"
// is sent straight to its own portal — iOS ignores the manifest start_url and
// reopens the URL captured at install time, which can be "/" instead of
// /doctor or /patient. Browser tabs always see the normal role portal.
function PortalRoute() {
  const isStandalone =
    window.matchMedia('(display-mode: standalone)').matches ||
    window.navigator.standalone === true;

  if (isStandalone) {
    const lastRole = localStorage.getItem('halo_last_role');
    if (lastRole === 'DOCTOR') return <Navigate to="/doctor" replace />;
    if (lastRole === 'PATIENT') return <Navigate to="/patient" replace />;
  }
  return <RolePortal />;
}

function AppContent() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Universal Authentication Portal */}
        <Route path="/" element={<PortalRoute />} />

        {/* Protected Admin Command Route */}
        <Route 
          path="/admin/*" 
          element={
            <ProtectedRoute allowedRoles={['ADMIN']}>
              <AdminDashboard />
            </ProtectedRoute>
          } 
        />

        {/* Protected Doctor PWA Route */}
        <Route 
          path="/doctor/*" 
          element={
            <ProtectedRoute allowedRoles={['DOCTOR']}>
              <DoctorDashboard />
            </ProtectedRoute>
          } 
        />

        {/* Protected Patient PWA Route */}
        <Route 
          path="/patient/*" 
          element={
            <ProtectedRoute allowedRoles={['PATIENT']}>
              <PatientDashboard />
            </ProtectedRoute>
          } 
        />

        {/* Fallback Redirect */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default function App() {
  return (
    <AppProvider>
      <AppContent />
    </AppProvider>
  );
}

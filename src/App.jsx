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

// Universal Portal Selection Root
function PortalRoute() {
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

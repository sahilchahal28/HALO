import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { ShieldAlert, Stethoscope, UserRound, Activity } from 'lucide-react';

export default function RolePortal() {
  const { language, setLanguage, t } = useApp();
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-canvas-parchment flex flex-col justify-between py-12 px-4 sm:px-6 lg:px-8">
      {/* Top Header */}
      <div className="max-w-4xl mx-auto w-full flex justify-between items-center border-b border-hairline pb-4">
        <div className="flex items-center gap-2 select-none">
          <span className="w-6 h-6 bg-primary rounded-full flex items-center justify-center text-canvas">
            <Activity size={13} strokeWidth={3} />
          </span>
          <span className="text-ink text-sm font-semibold tracking-tight">HALO SYSTEM</span>
        </div>
        
        {/* Language Switcher */}
        <div className="flex gap-2 text-xs">
          <button 
            onClick={() => setLanguage('en')} 
            className={`px-3 py-1 border border-hairline rounded-full cursor-pointer transition-all ${language === 'en' ? 'bg-ink text-canvas border-ink font-semibold' : 'text-ink bg-canvas hover:border-hairline-strong'}`}
          >
            ENGLISH
          </button>
          <button 
            onClick={() => setLanguage('hi')} 
            className={`px-3 py-1 border border-hairline rounded-full cursor-pointer transition-all ${language === 'hi' ? 'bg-ink text-canvas border-ink font-semibold' : 'text-ink bg-canvas hover:border-hairline-strong'}`}
          >
            हिंदी
          </button>
        </div>
      </div>

      {/* Main Core Section */}
      <div className="max-w-4xl mx-auto w-full my-auto py-8">
        <div className="text-center mb-16 select-none">
          <h1 className="text-5xl md:text-6xl font-semibold text-ink tracking-tight leading-[1.07] mb-6">
            {t('portalTitle')}
          </h1>
          <p className="text-[17px] text-ink font-light leading-relaxed max-w-xl mx-auto">
            {t('portalSubtitle')}
          </p>
        </div>

        <div>
          <h2 className="text-center text-xs text-ink-muted-48 tracking-widest uppercase mb-8 select-none font-semibold">
            {t('selectRole')}
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            
            {/* ADMIN CARD */}
            <button
              onClick={() => navigate('/admin')}
              className="bg-canvas border border-hairline hover:border-hairline-strong p-8 rounded-lg text-left transition-all duration-200 group flex flex-col justify-between h-72 cursor-pointer"
              style={{ borderRadius: '18px' }} // rounded.lg
            >
              <div className="w-12 h-12 rounded-full bg-canvas-parchment flex items-center justify-center text-primary border border-hairline">
                <ShieldAlert size={20} />
              </div>
              <div className="mt-8">
                <h3 className="text-lg font-semibold text-ink group-hover:text-primary transition-colors">
                  {t('adminPortal')}
                </h3>
                <p className="text-sm text-ink-muted-48 mt-3 leading-relaxed">
                  Manage patient registers, admit wards, coordinate ambulance services, and view real-time operations dashboards.
                </p>
              </div>
            </button>

            {/* DOCTOR CARD */}
            <button
              onClick={() => navigate('/doctor')}
              className="bg-canvas border border-hairline hover:border-hairline-strong p-8 rounded-lg text-left transition-all duration-200 group flex flex-col justify-between h-72 cursor-pointer"
              style={{ borderRadius: '18px' }} // rounded.lg
            >
              <div className="w-12 h-12 rounded-full bg-canvas-parchment flex items-center justify-center text-primary border border-hairline">
                <Stethoscope size={20} />
              </div>
              <div className="mt-8">
                <h3 className="text-lg font-semibold text-ink group-hover:text-primary transition-colors">
                  {t('doctorPortal')}
                </h3>
                <p className="text-sm text-ink-muted-48 mt-3 leading-relaxed">
                  Clinical schedule rounds, patient file review by QR scan, digitized handwritten prescriptions, and notification mailboxes.
                </p>
              </div>
            </button>

            {/* PATIENT CARD */}
            <button
              onClick={() => navigate('/patient')}
              className="bg-canvas border border-hairline hover:border-hairline-strong p-8 rounded-lg text-left transition-all duration-200 group flex flex-col justify-between h-72 cursor-pointer"
              style={{ borderRadius: '18px' }} // rounded.lg
            >
              <div className="w-12 h-12 rounded-full bg-canvas-parchment flex items-center justify-center text-primary border border-hairline">
                <UserRound size={20} />
              </div>
              <div className="mt-8">
                <h3 className="text-lg font-semibold text-ink group-hover:text-primary transition-colors">
                  {t('patientPortal')}
                </h3>
                <p className="text-sm text-ink-muted-48 mt-3 leading-relaxed">
                  Access virtual patient card, review prescriptions and lab results, view treatment journeys, and request ambulance coordinates.
                </p>
              </div>
            </button>

          </div>
        </div>
      </div>

      {/* Spacer to balance vertical alignment since footer is removed */}
      <div className="h-6" />
    </div>
  );
}

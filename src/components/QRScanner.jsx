import React, { useEffect, useState, useRef } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import { Camera, Search, UserCheck, Upload, AlertTriangle, RefreshCw } from 'lucide-react';
import { api } from '../utils/api';
import { useApp } from '../context/AppContext';

export default function QRScanner({ onPatientFound }) {
  const { addToast, patients } = useApp();
  const [manualId, setManualId] = useState('');
  const [scanning, setScanning] = useState(false);
  const [cameraError, setCameraError] = useState('');
  const [camerasList, setCamerasList] = useState([]);
  const [selectedCameraId, setSelectedCameraId] = useState('');
  
  const qrCodeInstanceRef = useRef(null);
  const fileInputRef = useRef(null);
  const scanLockRef = useRef(false);

  const handleScanSuccess = async (decodedText) => {
    // Synchronous guard against burst frames
    if (scanLockRef.current) return;
    scanLockRef.current = true;

    // Immediately stop camera frame polling
    if (qrCodeInstanceRef.current) {
      try {
        if (qrCodeInstanceRef.current.isScanning) {
          qrCodeInstanceRef.current.stop().catch(() => {});
        }
      } catch (_) {}
    }

    const cleanText = String(decodedText || '').trim();
    if (!cleanText) {
      scanLockRef.current = false;
      return;
    }

    addToast('QR scan successful. Resolving identity...', 'success');

    let token = cleanText;
    let patientId = null;

    if (cleanText.startsWith('http://') || cleanText.startsWith('https://')) {
      try {
        const parsed = new URL(cleanText);
        token = parsed.searchParams.get('token') || parsed.searchParams.get('qr') || cleanText;
        patientId = parsed.searchParams.get('patientId') || parsed.searchParams.get('id');
      } catch (_) {}
    } else if (cleanText.startsWith('{') && cleanText.endsWith('}')) {
      try {
        const parsed = JSON.parse(cleanText);
        token = parsed.token || parsed.qrCodeToken || cleanText;
        patientId = parsed.patientId || parsed.id;
      } catch (_) {}
    }

    await resolvePatient(token, patientId);
  };

  const resolvePatient = async (token, patientId) => {
    try {
      let patientData = null;
      if (token) {
        try {
          patientData = await api.get(`/patients/lookup?token=${encodeURIComponent(token)}`);
        } catch (err) {
          if (!patientId) throw err;
        }
      }
      if (!patientData && patientId) {
        patientData = await api.get(`/patients/lookup?patientId=${encodeURIComponent(patientId)}`);
      }
      const resolved = patientData?.patient || patientData;
      if (!resolved || (!resolved.patientId && !resolved._id)) {
        throw new Error('Patient record not found.');
      }
      const displayName = resolved.name || resolved.fullName || resolved.patientId;
      onPatientFound(resolved);
      addToast(`Access authorized & assigned: ${displayName}`, 'success');
      // Keep lock active to prevent rescanning while viewing patient
    } catch (err) {
      if (!err?.isTransient) {
        addToast(err.message || 'Verification failed. Access Denied.', 'error');
      }
      // Release lock after cooldown so user can scan again
      setTimeout(() => {
        scanLockRef.current = false;
      }, 1500);
    }
  };

  const handleManualSearch = (e) => {
    e.preventDefault();
    if (!manualId.trim()) return;
    
    const query = manualId.trim().toLowerCase();
    const found = (patients || []).find(pt => 
      pt.patientId.toLowerCase() === query || 
      pt.name.toLowerCase().includes(query)
    );
    
    if (found) {
      resolvePatient(found.qrCodeToken, null);
    } else {
      resolvePatient(null, manualId.trim());
    }
  };

  const stopScanner = async () => {
    if (qrCodeInstanceRef.current) {
      try {
        if (qrCodeInstanceRef.current.isScanning) {
          await qrCodeInstanceRef.current.stop();
        }
        await qrCodeInstanceRef.current.clear();
      } catch (err) {
        console.warn('Stop scanner error (ignorable):', err);
      }
      qrCodeInstanceRef.current = null;
    }
    setScanning(false);
  };

  const startScanner = async (overrideCameraId = null) => {
    scanLockRef.current = false;
    setCameraError('');
    setScanning(true);

    // Stop any existing instance
    if (qrCodeInstanceRef.current) {
      try {
        if (qrCodeInstanceRef.current.isScanning) {
          await qrCodeInstanceRef.current.stop();
        }
        await qrCodeInstanceRef.current.clear();
      } catch (_) {}
      qrCodeInstanceRef.current = null;
    }

    // Give DOM time to render #qr-reader
    let attempts = 0;
    const checkDomAndStart = async () => {
      const container = document.getElementById('qr-reader');
      if (!container && attempts < 10) {
        attempts++;
        setTimeout(checkDomAndStart, 100);
        return;
      }

      if (!container) {
        setCameraError('Camera container element not found.');
        setScanning(false);
        return;
      }

      try {
        const html5QrCode = new Html5Qrcode('qr-reader');
        qrCodeInstanceRef.current = html5QrCode;

        // Try getting cameras list first
        let targetCamera = overrideCameraId || selectedCameraId;
        try {
          const devices = await Html5Qrcode.getCameras();
          if (devices && devices.length > 0) {
            setCamerasList(devices);
            if (!targetCamera) {
              // Pick rear / environment camera if available
              const backCam = devices.find(d => 
                /back|rear|environment|facing\s*back/i.test(d.label)
              );
              targetCamera = backCam ? backCam.id : devices[devices.length - 1].id;
              setSelectedCameraId(targetCamera);
            }
          }
        } catch (e) {
          console.warn('Could not enumerate cameras, falling back to facingMode:', e);
        }

        const cameraConfig = targetCamera ? targetCamera : { facingMode: 'environment' };
        
        await html5QrCode.start(
          cameraConfig,
          {
            fps: 10,
            qrbox: { width: 250, height: 250 }
          },
          (decodedText) => {
            handleScanSuccess(decodedText);
          },
          () => {} // safe frame error ignore
        );
      } catch (err) {
        console.error('Primary camera start failed:', err);
        
        // Fallback attempt: Try simple facingMode: environment
        try {
          if (qrCodeInstanceRef.current) {
            await qrCodeInstanceRef.current.start(
              { facingMode: 'environment' },
              { fps: 10, qrbox: { width: 250, height: 250 } },
              (decodedText) => handleScanSuccess(decodedText),
              () => {}
            );
            return;
          }
        } catch (fallbackErr) {
          console.error('Fallback camera start failed:', fallbackErr);
        }

        // Second fallback: Any camera
        try {
          if (qrCodeInstanceRef.current) {
            await qrCodeInstanceRef.current.start(
              { facingMode: 'user' },
              { fps: 10, qrbox: { width: 250, height: 250 } },
              (decodedText) => handleScanSuccess(decodedText),
              () => {}
            );
            return;
          }
        } catch (_) {}

        setCameraError(
          'Could not start live camera feed. Please ensure camera permissions are granted in your browser, or use the "Capture Photo" option below.'
        );
        addToast('Camera access blocked. Use photo capture or manual search.', 'error');
        setScanning(false);
      }
    };

    setTimeout(checkDomAndStart, 100);
  };

  const handleFileScan = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      addToast('Scanning uploaded QR image...', 'info');
      // Create temporary scanner instance for file scanning
      const html5QrCode = new Html5Qrcode('qr-reader-temp');
      const decodedText = await html5QrCode.scanFile(file, true);
      await html5QrCode.clear();
      handleScanSuccess(decodedText);
    } catch (err) {
      console.error('File scan error:', err);
      addToast('No valid QR code found in photo. Try another picture.', 'error');
    } finally {
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (qrCodeInstanceRef.current) {
        const instance = qrCodeInstanceRef.current;
        if (instance.isScanning) {
          instance.stop().then(() => instance.clear()).catch(() => {});
        }
      }
    };
  }, []);

  const filteredPatients = (patients || []).filter(pt => 
    pt.name?.toLowerCase().includes(manualId.toLowerCase()) || 
    pt.patientId?.toLowerCase().includes(manualId.toLowerCase())
  );

  const isSecure = typeof window !== 'undefined' && (
    window.isSecureContext || 
    window.location.hostname === 'localhost' || 
    window.location.hostname === '127.0.0.1' ||
    window.location.protocol === 'https:'
  );

  return (
    <div className="my-6">
      
      {/* Hidden container for file scanning */}
      <div id="qr-reader-temp" style={{ display: 'none' }}></div>

      {/* Hidden file input for native camera capture */}
      <input 
        type="file" 
        ref={fileInputRef} 
        onChange={handleFileScan} 
        accept="image/*" 
        capture="environment" 
        className="hidden" 
      />

      {/* Full-width Scanner and Manual Input */}
      <div 
        className="bg-canvas border border-hairline p-6 flex flex-col justify-between"
        style={{ borderRadius: '18px' }}
      >
        <div>
          <h2 className="text-xl font-semibold text-ink mb-2">Patient Scan Coordinator</h2>
          <p className="text-sm text-ink-muted-48 mb-4 leading-relaxed">
            Authorize patient file lookup by scanning their secure digital card QR, capturing a photo, or manual ID lookup.
          </p>

          {!isSecure && (
            <div className="mb-4 p-3 bg-amber-500/10 border border-amber-500/30 text-amber-600 dark:text-amber-400 rounded-xl text-xs flex items-start gap-2">
              <AlertTriangle size={16} className="shrink-0 mt-0.5" />
              <div>
                <strong>Insecure HTTP Context:</strong> Live camera streaming requires HTTPS or Localhost. If live video does not start, use the <strong>"Capture Photo"</strong> button below.
              </div>
            </div>
          )}

          {cameraError && (
            <div className="mb-4 p-3 bg-red-500/10 border border-red-500/30 text-red-600 dark:text-red-400 rounded-xl text-xs flex items-start gap-2">
              <AlertTriangle size={16} className="shrink-0 mt-0.5" />
              <div>{cameraError}</div>
            </div>
          )}
        </div>

        {/* Camera Scanner Box */}
        <div className="flex flex-col items-center justify-center border border-hairline rounded-[11px] bg-canvas-parchment p-6 mb-6 min-h-[300px]">
          {scanning ? (
            <div className="w-full max-w-sm">
              <div id="qr-reader" className="w-full overflow-hidden rounded-[11px] border border-hairline bg-canvas aspect-square"></div>
              
              <div className="mt-4 flex gap-2">
                <button
                  onClick={stopScanner}
                  className="flex-1 bg-ink text-canvas text-xs font-semibold py-2.5 rounded-full hover:bg-ink-muted-80 transition-colors uppercase cursor-pointer"
                >
                  Cancel Scanning
                </button>

                {camerasList.length > 1 && (
                  <button
                    onClick={() => {
                      const currentIndex = camerasList.findIndex(c => c.id === selectedCameraId);
                      const nextIndex = (currentIndex + 1) % camerasList.length;
                      const nextCamId = camerasList[nextIndex].id;
                      setSelectedCameraId(nextCamId);
                      startScanner(nextCamId);
                    }}
                    className="px-3 bg-canvas border border-hairline text-ink text-xs font-semibold rounded-full hover:bg-divider-soft transition-colors flex items-center gap-1 cursor-pointer"
                    title="Switch Camera"
                  >
                    <RefreshCw size={14} /> Flip
                  </button>
                )}
              </div>
            </div>
          ) : (
            <div className="text-center space-y-3">
              <div className="w-16 h-16 rounded-full bg-canvas border border-hairline flex items-center justify-center mx-auto mb-2 text-ink">
                <Camera size={24} />
              </div>
              
              <div className="flex flex-col sm:flex-row gap-2 justify-center">
                <button
                  onClick={() => startScanner()}
                  className="bg-primary hover:bg-primary-focus text-canvas text-sm font-semibold py-3 px-6 rounded-full transition-colors uppercase flex items-center justify-center gap-2 cursor-pointer shadow-sm"
                >
                  <Camera size={18} />
                  Activate Rear Camera
                </button>

                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="bg-canvas border border-hairline hover:bg-divider-soft text-ink text-sm font-semibold py-3 px-6 rounded-full transition-colors uppercase flex items-center justify-center gap-2 cursor-pointer"
                >
                  <Upload size={18} />
                  Capture Photo / QR
                </button>
              </div>

              <p className="text-xs text-ink-muted-48 mt-2">
                Live stream or direct camera snapshot encrypted.
              </p>
            </div>
          )}
        </div>

        {/* Manual lookup input */}
        <form onSubmit={handleManualSearch} className="flex gap-2">
          <div className="relative flex-grow">
            <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 text-ink-muted-48" size={16} />
            <input
              type="text"
              value={manualId}
              onChange={(e) => setManualId(e.target.value)}
              placeholder="Search by Patient Name or ID (e.g. Rahul)"
              className="w-full pl-11 py-3 bg-canvas border border-hairline text-sm rounded-full"
            />
          </div>
          <button
            type="submit"
            className="bg-ink hover:bg-ink-muted-80 text-canvas text-xs font-semibold px-6 rounded-full transition-colors uppercase cursor-pointer"
          >
            Lookup
          </button>
        </form>
      </div>

    </div>
  );
}

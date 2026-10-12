import React, { useState, useEffect } from 'react';
import { Server, Wifi, WifiOff, CheckCircle2, AlertCircle, RefreshCw, X, HardDrive } from 'lucide-react';
import { getApiBase, setServerUrl, clearServerUrl } from '../utils/api';

/**
 * ServerConfigModal
 *
 * Allows Doctor and Patient PWAs running on any device (phone, tablet, laptop)
 * to configure and verify the connection to the HALO server running on the user's host machine.
 *
 * Uploaded medical records are stored directly on the host machine under:
 *   server/storage/users/records/<patientId>/<file>
 */

// Browsers block http:// API calls from an https:// page (mixed content),
// so an http:// LAN address can never work there — same-origin only.
const IS_HTTPS_PAGE = typeof window !== 'undefined' && window.location.protocol === 'https:';
const isUnusableHttp = (url) => {
  if (!IS_HTTPS_PAGE) return false;
  const v = String(url || '').trim();
  if (!/^http:\/\//i.test(v)) return false;
  return !/^http:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?(\/|$)/i.test(v);
};

export default function ServerConfigModal({ isOpen, onClose, addToast }) {
  const [currentBase, setCurrentBase] = useState(() => getApiBase());
  const [inputUrl, setInputUrl] = useState(() => getApiBase() || '');
  const [detectedLanIp, setDetectedLanIp] = useState('');
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(null); // { success: boolean, message: string }

  // Detect server LAN IP on mount
  useEffect(() => {
    if (!isOpen) return;

    setCurrentBase(getApiBase());
    setInputUrl(getApiBase() || '');
    setTestResult(null);

    // Probe server-info to discover the host's actual LAN IP
    fetch(`${getApiBase()}/api/server-info`)
      .then(r => r.json())
      .then(data => {
        if (data.lanIp) {
          setDetectedLanIp(data.lanIp);
          // If no custom URL is saved and we're not on localhost, suggest http://<lanIp>:5001
          // — but never on an https:// page, where browsers block http:// outright.
          if (!IS_HTTPS_PAGE && !getApiBase() && typeof window !== 'undefined' && window.location.hostname !== 'localhost') {
            setInputUrl(`http://${data.lanIp}:5001`);
          }
        }
      })
      .catch(() => {
        // Fallback to current hostname on port 5001 if available
        if (typeof window !== 'undefined' && window.location.hostname !== 'localhost') {
          setDetectedLanIp(window.location.hostname);
        }
      });
  }, [isOpen]);

  if (!isOpen) return null;

  const handleTestConnection = async (urlToTest) => {
    const target = (urlToTest !== undefined ? urlToTest : inputUrl).trim().replace(/\/$/, '');
    setTesting(true);
    setTestResult(null);

    try {
      const probeUrl = target ? `${target}/health` : '/health';
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 4000);

      const res = await fetch(probeUrl, { signal: controller.signal });
      clearTimeout(timeoutId);

      if (res.ok) {
        const data = await res.json();
        setTestResult({
          success: true,
          message: `Connected successfully! HALO Server is online (DB: ${data.db?.state || 'active'}).`
        });
        if (addToast) addToast('Server connection verified!', 'success');
      } else {
        setTestResult({
          success: false,
          message: `Server responded with status ${res.status}. Check server URL.`
        });
      }
    } catch (err) {
      setTestResult({
        success: false,
        message: err.name === 'AbortError' 
          ? 'Connection timed out. Ensure the server computer and this device are on the same Wi-Fi.'
          : 'Unable to reach HALO server. Make sure "npm run dev" or the backend is running on your computer.'
      });
    } finally {
      setTesting(false);
    }
  };

  const handleSave = () => {
    const trimmed = inputUrl.trim().replace(/\/$/, '');
    if (trimmed) {
      if (isUnusableHttp(trimmed)) {
        setTestResult({
          success: false,
          message: 'This app is served over HTTPS, so browsers block http:// server addresses. Leave the field blank to use the secure built-in connection.'
        });
        return;
      }
      setServerUrl(trimmed);
      setCurrentBase(trimmed);
      if (addToast) addToast(`Server address set to: ${trimmed}`, 'success');
    } else {
      clearServerUrl();
      setCurrentBase('');
      if (addToast) addToast('Server address reset to default same-origin.', 'info');
    }
    onClose();
    // Soft reload to re-init connections
    setTimeout(() => {
      window.location.reload();
    }, 400);
  };

  const handleReset = () => {
    clearServerUrl();
    setInputUrl('');
    setCurrentBase('');
    setTestResult(null);
    if (addToast) addToast('Server address reset to default same-origin.', 'info');
  };

  return (
    <div className="fixed inset-0 z-[120] bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div 
        className="w-full max-w-md bg-canvas border border-hairline p-6 flex flex-col apple-product-shadow space-y-4 animate-in fade-in zoom-in-95 duration-200" 
        style={{ borderRadius: '24px' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-hairline pb-3">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center text-primary">
              <Server size={18} />
            </div>
            <div>
              <h3 className="text-sm font-bold text-ink">Host Server Settings</h3>
              <p className="text-[11px] text-ink-muted-48">Configure storage destination machine</p>
            </div>
          </div>
          <button 
            type="button" 
            onClick={onClose}
            className="p-1 rounded-full text-ink-muted-48 hover:text-ink hover:bg-canvas-parchment cursor-pointer"
          >
            <X size={18} />
          </button>
        </div>

        {/* Current Destination Info */}
        <div className="bg-canvas-parchment border border-hairline p-3.5 rounded-2xl space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="text-ink-muted-48 font-medium">Storage Destination:</span>
            <span className="font-mono font-bold text-primary text-[11px]">
              {currentBase || 'Localhost / Same-Origin (:5001)'}
            </span>
          </div>

          <div className="flex items-start gap-2 pt-1 border-t border-hairline text-[11px] text-ink-muted-85">
            <HardDrive size={13} className="shrink-0 mt-0.5 text-primary" />
            <span>Files are uploaded directly to your device disk under <code>server/storage/users/</code>.</span>
          </div>
        </div>

        {/* Server Address Input */}
        <div className="space-y-1.5">
          <label className="text-[11px] text-ink-muted-48 uppercase font-bold tracking-wider block">
            Server IP / URL
          </label>
          <div className="flex items-center gap-2">
            <input 
              type="text" 
              placeholder="e.g. http://192.168.1.15:5001"
              value={inputUrl}
              onChange={e => setInputUrl(e.target.value)}
              className="flex-1 px-3.5 py-2.5 text-xs bg-canvas-parchment border border-hairline rounded-full focus:outline-none focus:border-primary font-mono"
            />
            <button
              type="button"
              disabled={testing}
              onClick={() => handleTestConnection()}
              className="px-3 py-2.5 bg-canvas-parchment border border-hairline hover:bg-canvas text-ink text-xs font-semibold rounded-full flex items-center gap-1.5 cursor-pointer disabled:opacity-50 shrink-0"
            >
              {testing ? <RefreshCw size={13} className="animate-spin text-primary" /> : <Wifi size={13} />}
              Test
            </button>
          </div>
          <p className="text-[10px] text-ink-muted-48">
            {IS_HTTPS_PAGE
              ? 'Leave blank to use the secure built-in connection. Only enter an https:// address here — plain http:// addresses are blocked by browsers on secure pages.'
              : <>Leave blank if running directly on the same computer. Enter <code>http://&lt;your-computer-ip&gt;:5001</code> when accessing from a mobile phone on Wi-Fi.</>}
          </p>
        </div>

        {/* Detected LAN Quick Pick */}
        {detectedLanIp && (
          <div className="bg-primary/5 border border-primary/20 rounded-xl p-2.5 flex items-center justify-between text-xs">
            <div className="flex items-center gap-2">
              <span className="text-[11px] text-ink font-medium">Detected host IP:</span>
              <code className="text-primary font-bold text-[11px]">{detectedLanIp}:5001</code>
            </div>
            {IS_HTTPS_PAGE ? (
              <span className="text-[10px] text-ink-muted-48 font-medium text-right leading-tight">
                Blocked over HTTPS —<br />use the built-in connection
              </span>
            ) : (
              <button
                type="button"
                onClick={() => {
                  const target = `http://${detectedLanIp}:5001`;
                  setInputUrl(target);
                  handleTestConnection(target);
                }}
                className="text-[10px] text-primary underline font-semibold cursor-pointer hover:opacity-80"
              >
                Use This
              </button>
            )}
          </div>
        )}

        {/* HTTPS notice: http:// overrides can never work on an https:// page */}
        {IS_HTTPS_PAGE && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-[11px] text-amber-900 leading-snug flex items-start gap-2">
            <AlertCircle size={14} className="shrink-0 mt-0.5 text-amber-600" />
            <span>
              This page is served over <strong>HTTPS</strong>, so browsers block plain <code>http://</code> server
              addresses. Leave the field blank and use <strong>Reset Default</strong> — the built-in connection
              reaches your Mac securely through the tunnel.
            </span>
          </div>
        )}

        {/* Test Result Message */}
        {testResult && (
          <div className={`p-3 rounded-xl border text-xs flex items-start gap-2 ${
            testResult.success 
              ? 'bg-emerald-50 text-emerald-800 border-emerald-200' 
              : 'bg-rose-50 text-rose-800 border-rose-200'
          }`}>
            {testResult.success ? (
              <CheckCircle2 size={15} className="shrink-0 mt-0.5 text-emerald-600" />
            ) : (
              <AlertCircle size={15} className="shrink-0 mt-0.5 text-rose-600" />
            )}
            <span className="leading-tight">{testResult.message}</span>
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex items-center gap-2 pt-2">
          <button
            type="button"
            onClick={handleReset}
            className="flex-1 py-2.5 bg-canvas-parchment border border-hairline hover:bg-canvas text-ink text-xs font-semibold rounded-full cursor-pointer"
          >
            Reset Default
          </button>
          <button
            type="button"
            onClick={handleSave}
            className="flex-1 py-2.5 bg-primary hover:bg-primary-focus text-canvas text-xs font-semibold rounded-full cursor-pointer transition-colors shadow-none"
          >
            Save &amp; Connect
          </button>
        </div>
      </div>
    </div>
  );
}

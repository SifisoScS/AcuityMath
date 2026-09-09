import React, { useState } from 'react';
import { ShieldCheck, X, FileText, CheckCircle2, Trash2, Download, AlertTriangle } from 'lucide-react';
import { apiService } from '../services/api';
import { playClickSound, playSuccessSound, playErrorSound } from '../utils/audio';

interface CoppaConsentModalProps {
  isOpen: boolean;
  onClose: () => void;
  parentName: string;
  parentEmail: string;
  hasConsented: boolean;
  onConsentUpdated: () => void;
  students: Array<{ id: string; name: string; age: number }>;
}

export const CoppaConsentModal: React.FC<CoppaConsentModalProps> = ({
  isOpen,
  onClose,
  parentName,
  parentEmail,
  hasConsented,
  onConsentUpdated,
  students
}) => {
  const [method, setMethod] = useState<'email_plus_verification' | 'signed_form' | 'credit_card_auth'>('email_plus_verification');
  const [signature, setSignature] = useState(parentName || '');
  const [agreed, setAgreed] = useState(hasConsented);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);
  const [selectedStudentToPurge, setSelectedStudentToPurge] = useState<string>('');
  const [purgePin, setPurgePin] = useState('');
  const [isPurging, setIsPurging] = useState(false);

  if (!isOpen) return null;

  const handleSaveConsent = async () => {
    if (!signature.trim()) {
      setMessage({ text: 'Please enter your digital signature full name.', type: 'error' });
      playErrorSound();
      return;
    }
    setIsSubmitting(true);
    setMessage(null);
    try {
      const res = await apiService.updateCoppaConsent('parent_sarah_1', agreed, method, signature);
      if (res.success) {
        playSuccessSound();
        setMessage({ text: 'Verifiable Parental Consent successfully recorded on server.', type: 'success' });
        onConsentUpdated();
      } else {
        playErrorSound();
        setMessage({ text: res.error || 'Failed to save consent.', type: 'error' });
      }
    } catch {
      playErrorSound();
      setMessage({ text: 'Network error updating consent record.', type: 'error' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handlePurge = async () => {
    if (!selectedStudentToPurge || !purgePin) {
      setMessage({ text: 'Select a student and provide your parent PIN to purge.', type: 'error' });
      playErrorSound();
      return;
    }
    setIsPurging(true);
    try {
      const res = await apiService.purgeStudentData(selectedStudentToPurge, 'parent_sarah_1', purgePin);
      if (res.success) {
        playSuccessSound();
        setMessage({ text: res.message || 'Student data purged under COPPA Right to be Forgotten.', type: 'success' });
        setSelectedStudentToPurge('');
        setPurgePin('');
        onConsentUpdated();
      } else {
        playErrorSound();
        setMessage({ text: res.error || 'Failed to purge student data.', type: 'error' });
      }
    } catch {
      playErrorSound();
      setMessage({ text: 'Server error during data erasure.', type: 'error' });
    } finally {
      setIsPurging(false);
    }
  };

  const handleExportData = () => {
    playClickSound();
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify({
      parent: { name: parentName, email: parentEmail, coppaVerified: true },
      students,
      policy: "COPPA / FERPA Verified Math Telemetry Export",
      timestamp: new Date().toISOString()
    }, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute("href", dataStr);
    downloadAnchor.setAttribute("download", `AcuityMath_COPPA_Data_Export_${new Date().toISOString().slice(0,10)}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
    setMessage({ text: 'Student data JSON exported to your device.', type: 'success' });
  };

  return (
    <div
      role="dialog"
      aria-label="Parental consent"
      tabIndex={-1}
      className="fixed inset-0 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fadeIn">
      <div className="bg-white rounded-3xl max-w-xl w-full p-6 shadow-2xl border border-slate-200 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center border border-emerald-200">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-extrabold text-slate-900">
                COPPA & FERPA Compliance Management
              </h3>
              <p className="text-[11px] text-slate-500 font-semibold">
                Verifiable Parental Consent (VPC) & Child Data Safeguards (16 CFR Part 312)
              </p>
            </div>
          </div>
          <button
            onClick={() => {
              playClickSound();
              onClose();
            }}
            className="p-1 rounded-full text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Message Banner */}
        {message && (
          <div className={`mt-4 p-3 rounded-2xl text-xs font-bold flex items-center gap-2 ${
            message.type === 'success' ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' : 'bg-rose-50 text-rose-800 border border-rose-200'
          }`}>
            {message.type === 'success' ? <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" /> : <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />}
            <span>{message.text}</span>
          </div>
        )}

        {/* Section 1: Privacy Guarantees */}
        <div className="mt-5 p-4 rounded-2xl bg-slate-50 border border-slate-200">
          <h4 className="text-xs font-black uppercase tracking-wider text-slate-700 mb-2 flex items-center gap-1.5">
            <FileText className="w-4 h-4 text-indigo-600" />
            <span>Child Data Minimization Standards</span>
          </h4>
          <ul className="text-xs text-slate-600 space-y-1.5 list-disc pl-4">
            <li><strong>Zero PII Collected:</strong> Children do not enter full names, email addresses, phone numbers, or geolocations.</li>
            <li><strong>No Voice Storage:</strong> Audio synthesis is processed locally; no voice audio is recorded or stored on remote servers.</li>
            <li><strong>No Commercial Profiling:</strong> AcuityMath does not serve advertisements or sell student learning telemetries.</li>
          </ul>
        </div>

        {/* Section 2: Verifiable Consent Form */}
        <div className="mt-5 space-y-3">
          <h4 className="text-xs font-black uppercase tracking-wider text-slate-700">
            Parental Consent Status
          </h4>

          <div className="p-3.5 rounded-2xl border border-indigo-100 bg-indigo-50/50 space-y-3">
            <label className="flex items-start gap-2.5 cursor-pointer">
              <input
                type="checkbox"
                checked={agreed}
                onChange={(e) => setAgreed(e.target.checked)}
                className="mt-0.5 rounded text-indigo-600 focus:ring-indigo-500 w-4 h-4 cursor-pointer"
              />
              <span className="text-xs text-slate-700 font-semibold leading-relaxed">
                As the legal guardian of registered minor profiles, I authorize AcuityMath to collect adaptive math problem responses and screen time duration to personalize learning.
              </span>
            </label>

            <div>
              <label className="block text-[11px] font-bold text-slate-600 mb-1">
                Verification Method
              </label>
              <select
                value={method}
                onChange={(e) => setMethod(e.target.value as unknown as typeof method)}
                className="w-full text-xs font-bold p-2.5 rounded-xl border border-slate-300 bg-white text-slate-800"
              >
                <option value="email_plus_verification">Email-Plus Verification (Verified Parent Email)</option>
                <option value="signed_form">Digitally Signed Parental Consent</option>
                <option value="credit_card_auth">Micro-Auth Credit Card Verification</option>
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-600 mb-1">
                Digital Signature (Guardian Full Legal Name)
              </label>
              <input
                type="text"
                value={signature}
                onChange={(e) => setSignature(e.target.value)}
                placeholder="e.g. Sarah Jenkins"
                className="w-full text-xs p-2.5 rounded-xl border border-slate-300 bg-white text-slate-800 font-bold"
              />
            </div>

            <button
              onClick={handleSaveConsent}
              disabled={isSubmitting}
              className="w-full py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs transition cursor-pointer shadow-xs"
            >
              {isSubmitting ? 'Saving Consent...' : 'Update & Certify Consent on Server'}
            </button>
          </div>
        </div>

        {/* Section 3: Data Rights & Erasure (Right to be Forgotten) */}
        <div className="mt-6 pt-5 border-t border-slate-200">
          <h4 className="text-xs font-black uppercase tracking-wider text-slate-700 mb-2">
            Parental Data Rights & Erasure
          </h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <button
              onClick={handleExportData}
              className="flex items-center justify-center gap-2 p-3 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-700 text-xs font-bold transition cursor-pointer"
            >
              <Download className="w-4 h-4 text-indigo-600" />
              <span>Export Child Data (JSON)</span>
            </button>

            <div className="p-3 rounded-xl border border-rose-200 bg-rose-50/40">
              <div className="flex items-center gap-1.5 text-rose-700 text-xs font-bold mb-1.5">
                <Trash2 className="w-3.5 h-3.5" />
                <span>Right to be Forgotten</span>
              </div>
              <select
                value={selectedStudentToPurge}
                onChange={(e) => setSelectedStudentToPurge(e.target.value)}
                className="w-full text-[11px] font-bold p-1.5 rounded-lg border border-slate-300 bg-white mb-2"
              >
                <option value="">Select Child to Purge...</option>
                {students.map(s => (
                  <option key={s.id} value={s.id}>{s.name} (Age {s.age})</option>
                ))}
              </select>
              <input
                type="password"
                maxLength={4}
                value={purgePin}
                onChange={(e) => setPurgePin(e.target.value)}
                placeholder="Parent PIN (1234)"
                className="w-full text-[11px] p-1.5 rounded-lg border border-slate-300 bg-white mb-2 font-mono"
              />
              <button
                onClick={handlePurge}
                disabled={isPurging || !selectedStudentToPurge}
                className="w-full py-1.5 rounded-lg bg-rose-600 hover:bg-rose-700 disabled:opacity-50 text-white font-bold text-[11px] transition cursor-pointer"
              >
                {isPurging ? 'Purging...' : 'Purge All Records'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

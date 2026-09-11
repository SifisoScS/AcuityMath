/**
 * Parental consent.
 *
 * ## What this replaces
 *
 * The previous version posted to `/api/auth/coppa-consent` with a hardcoded
 * `'parent_sarah_1'`, writing to a gitignored JSON file that nothing migrated
 * read, while `consent_events` went unwritten. It told a parent their consent
 * was recorded, and it was not.
 *
 * It also:
 *
 *   - offered the **verification method as a dropdown**, including "Micro-Auth
 *     Credit Card Verification", when nothing charges a card. The method records
 *     what the operator did to verify; letting a parent pick it writes a record
 *     of a verification that never happened.
 *   - showed the disclosure as **one sentence of JSX with no version**, so any
 *     edit would have left existing records referring to text nobody could
 *     reconstruct.
 *   - offered a **data purge** behind a PIN compared in plaintext on an
 *     unauthenticated route, which is deleted.
 *   - exported a file asserting `coppaVerified: true` regardless.
 *
 * The parent now chooses two things — whether they agree, and the name they
 * attest with. Everything else is the server's: the guardian, the children, the
 * policy version, its hash, and how they were verified.
 */

import React, { useState } from 'react';
import { ShieldCheck, X, FileText, CheckCircle2, AlertTriangle, Clock } from 'lucide-react';

import { playClickSound, playSuccessSound, playErrorSound } from '../utils/audio';
import { useModalA11y } from '../hooks/useModalA11y';
import type { ConsentState, FamilyConsent } from '../hooks/useConsent';
import type { UserProfile } from '../types';

interface CoppaConsentModalProps {
  isOpen: boolean;
  onClose: () => void;
  parentName: string;
  parentEmail: string;
  /** The children on the account, for naming who a decision covers. */
  students: UserProfile[];
  consent: FamilyConsent;
  /** Opens the PIN prompt. This surface is elevated and can expire while open. */
  onRequestStepUp: () => void;
}

/** How a child's consent reads to a parent. */
function describe(status: ConsentState['status']): { label: string; tone: 'ok' | 'warn' } {
  switch (status) {
    case 'granted':
      return { label: 'Covered', tone: 'ok' };
    case 'withdrawn':
      return { label: 'Consent withdrawn', tone: 'warn' };
    case 'superseded':
      return { label: 'Terms have changed since you agreed', tone: 'warn' };
    default:
      return { label: 'Not yet covered', tone: 'warn' };
  }
}

export const CoppaConsentModal: React.FC<CoppaConsentModalProps> = ({
  isOpen,
  onClose,
  parentName,
  parentEmail,
  students,
  consent,
  onRequestStepUp
}) => {
  const panelRef = useModalA11y(isOpen, onClose);
  const [attestedName, setAttestedName] = useState(parentName || '');
  const [agreed, setAgreed] = useState(false);
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);
  const [showWithdrawn, setShowWithdrawn] = useState(false);

  if (!isOpen) return null;

  const nameFor = (learnerId: number) =>
    students.find(s => s.learnerId === learnerId)?.name ?? `Learner ${learnerId}`;

  const submit = async (decision: 'granted' | 'withdrawn') => {
    if (decision === 'granted' && !agreed) {
      setMessage({ text: 'Please tick the box to confirm you agree to the terms.', type: 'error' });
      playErrorSound();
      return;
    }
    if (!attestedName.trim() || attestedName.trim().length < 2) {
      setMessage({ text: 'Please type your full name.', type: 'error' });
      playErrorSound();
      return;
    }

    setMessage(null);
    try {
      await consent.record({ decision, attestedName: attestedName.trim() });
    } catch (error) {
      playErrorSound();
      setMessage({
        text: error instanceof Error ? error.message : 'That could not be saved. Nothing was recorded.',
        type: 'error'
      });
      return;
    }

    playSuccessSound();
    if (decision === 'withdrawn') {
      setShowWithdrawn(true);
      setMessage(null);
    } else {
      setMessage({
        text: `Recorded for ${students.length === 1 ? 'your child' : `all ${students.length} children`} on this account.`,
        type: 'success'
      });
    }
  };

  /*
   * The roster comes from `students`, not from the consent query.
   *
   * `consent.forFamily` is elevated, so before the parent enters their PIN it
   * returns nothing — and an earlier version of this component read the child
   * list from it, which meant a household with four children was told "there
   * are no children on this account yet". Conflating "cannot see it" with "it is
   * empty" is the fail-open default in a new place, wearing the opposite sign.
   *
   * `students` comes from `learners.list`, which needs only a session. So the
   * children are always named; their consent status is shown only when it can
   * actually be read.
   */
  const canSeeStatus = !consent.isLoading && !consent.needsStepUp;
  const roster = students.map(student => ({
    student,
    state: student.learnerId === undefined
      ? undefined
      : consent.byProfileId[`learner-${student.learnerId}`],
  }));

  return (
    <div
      ref={panelRef}
      role="dialog"
      aria-modal="true"
      aria-label="Parental consent"
      tabIndex={-1}
      className="fixed inset-0 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fadeIn">
      <div className="bg-white rounded-3xl max-w-xl w-full p-6 shadow-2xl border border-slate-200 max-h-[90vh] overflow-y-auto space-y-4">

        <div className="flex items-center justify-between pb-4 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-slate-100 text-slate-700 flex items-center justify-center border border-slate-200">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              {/*
                This read "COPPA & FERPA Compliance Management" over
                "Verifiable Parental Consent (VPC) & Child Data Safeguards
                (16 CFR Part 312)" — citing a regulation as though the product
                had been assessed against it. It describes what the screen does.
              */}
              <h3 className="text-base font-extrabold text-slate-900">
                Permission to record your child&apos;s progress
              </h3>
              <p className="text-[11px] text-slate-500 font-semibold">
                What we keep, why, and how to change your mind
              </p>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700" aria-label="Close">
            <X className="w-5 h-5" />
          </button>
        </div>

        {consent.needsStepUp && (
          /*
           * A way to do it, not just an instruction to.
           *
           * The first version of this said "Enter your parent PIN to see or
           * change this" and offered no control — telling somebody what is
           * required and giving them no means to supply it, which is the same
           * shape as an error message that does not say how to fix it.
           */
          <div role="alert" className="text-xs bg-amber-50 border border-amber-200 rounded-xl p-3 flex items-center justify-between gap-3">
            <span className="font-semibold text-amber-900">
              Confirm it is you before seeing or changing this.
            </span>
            <button
              onClick={() => { playClickSound(); onRequestStepUp(); }}
              className="shrink-0 px-3 py-1.5 bg-amber-900 hover:bg-amber-950 text-white font-bold rounded-lg text-[11px]"
            >
              Enter PIN
            </button>
          </div>
        )}

        {showWithdrawn ? (
          /*
           * Decision D. Recording the withdrawal honestly is not enough on its
           * own: a withdrawal right with no deletion path is the same problem in
           * a new place. Automated deletion is a later change, so the remedy is
           * named rather than implied.
           */
          <div className="space-y-3">
            <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-2">
              <div className="flex items-center gap-2 font-bold text-slate-900 text-sm">
                <CheckCircle2 className="w-5 h-5 text-slate-500" />
                <span>Your consent has been withdrawn</span>
              </div>
              <p className="text-xs text-slate-600 leading-relaxed">
                We have recorded that you withdrew permission, and when. We have <strong>not</strong>{' '}
                yet deleted what was already recorded — that is not automatic.
              </p>
              <p className="text-xs text-slate-600 leading-relaxed">
                To have your child&apos;s records erased, email{' '}
                <a href="mailto:privacy@acuitymath.local" className="font-bold text-indigo-700 underline">
                  privacy@acuitymath.local
                </a>{' '}
                from <strong>{parentEmail}</strong>. We will confirm within 5 working days and
                complete the erasure within 30 days.
              </p>
            </div>
            <button
              onClick={() => { setShowWithdrawn(false); setAgreed(false); }}
              className="w-full py-2.5 bg-slate-200 hover:bg-slate-300 text-slate-800 font-bold rounded-xl text-xs"
            >
              Back
            </button>
          </div>
        ) : (
          <>
            {/* Who this covers — decision C. */}
            <section className="space-y-2">
              <h4 className="text-[11px] font-bold text-slate-600 uppercase tracking-wide">
                This covers {students.length === 1 ? 'your child' : `all ${students.length} children on this account`}
              </h4>
              {students.length === 0 ? (
                <p className="text-xs text-slate-500">
                  There are no children on this account yet. Add one first — there is nothing to
                  give permission about.
                </p>
              ) : (
                <ul className="space-y-1.5">
                  {roster.map(({ student, state }) => {
                    const { label, tone } = describe(state?.status ?? 'none');
                    return (
                      <li
                        key={student.id}
                        className="flex items-center justify-between gap-3 text-xs p-2.5 rounded-xl border border-slate-200 bg-slate-50/60"
                      >
                        <span className="font-bold text-slate-800">{student.name}</span>
                        {canSeeStatus ? (
                          <span className={`font-semibold flex items-center gap-1.5 ${tone === 'ok' ? 'text-emerald-700' : 'text-amber-800'}`}>
                            {tone === 'ok' ? <CheckCircle2 className="w-3.5 h-3.5" /> : <Clock className="w-3.5 h-3.5" />}
                            {label}
                          </span>
                        ) : (
                          /* Not "not covered": we have not been allowed to look. */
                          <span className="font-semibold text-slate-400">
                            {consent.isLoading ? 'Checking…' : 'Hidden until you enter your PIN'}
                          </span>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
              {canSeeStatus && consent.uncovered.length > 0 && students.length > 0 && (
                <p className="text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded-xl p-2.5">
                  {/* A child added after consent has none. Saying so beats leaving the gap silent. */}
                  {consent.uncovered.length === students.length
                    ? 'None of them are covered yet.'
                    : `${consent.uncovered.length} of them ${consent.uncovered.length === 1 ? 'is' : 'are'} not covered yet.`}
                </p>
              )}
            </section>

            {/* The disclosure, from the server, versioned. */}
            <section className="space-y-2">
              <h4 className="text-[11px] font-bold text-slate-600 uppercase tracking-wide flex items-center gap-1.5">
                <FileText className="w-3.5 h-3.5" />
                What we record
              </h4>
              {consent.policy ? (
                <>
                  <ul className="space-y-1.5 text-xs text-slate-700 leading-relaxed list-disc pl-4">
                    {consent.policy.clauses.map(clause => <li key={clause}>{clause}</li>)}
                  </ul>
                  <p className="text-[10px] font-mono text-slate-400">
                    Terms version {consent.policy.version}
                  </p>
                </>
              ) : (
                <p className="text-xs text-slate-500">Loading the terms…</p>
              )}
            </section>

            {/* How they were verified — stated, not chosen. */}
            {consent.policy && (
              <section className="p-3 rounded-xl bg-slate-50 border border-slate-200">
                <h4 className="text-[11px] font-bold text-slate-600 uppercase tracking-wide mb-1">
                  How we know it is you
                </h4>
                {/*
                  A dropdown stood here offering three verification methods. The
                  method records what the operator did; a parent does not choose
                  how they were verified.
                */}
                <p className="text-xs text-slate-700 leading-relaxed">{consent.policy.verification}</p>
                <p className="text-[11px] text-slate-500 mt-1.5">
                  Signed in as <strong className="text-slate-700">{parentEmail}</strong>
                </p>
              </section>
            )}

            <label className="flex items-start gap-2.5 text-xs text-slate-800 cursor-pointer">
              <input
                type="checkbox"
                checked={agreed}
                onChange={e => setAgreed(e.target.checked)}
                className="mt-0.5 rounded text-indigo-600 focus:ring-indigo-500"
              />
              <span className="leading-relaxed">{consent.policy?.summary ?? ''}</span>
            </label>

            <div>
              <label htmlFor="attested-name" className="block text-[11px] font-bold text-slate-600 mb-1">
                Your full name
              </label>
              <input
                id="attested-name"
                type="text"
                value={attestedName}
                onChange={e => setAttestedName(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl border border-slate-300 text-sm font-medium"
                placeholder="First and last name"
              />
            </div>

            {message && (
              <p
                role="alert"
                className={`text-xs font-semibold rounded-xl p-2.5 border ${
                  message.type === 'success'
                    ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                    : 'bg-rose-50 border-rose-200 text-rose-900'
                }`}
              >
                {message.text}
              </p>
            )}

            <div className="flex gap-2 pt-1">
              <button
                onClick={() => { playClickSound(); void submit('granted'); }}
                disabled={consent.isRecording || students.length === 0}
                className="flex-1 py-3 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 text-white font-bold rounded-xl text-xs transition"
              >
                {consent.isRecording ? 'Saving…' : 'I give permission'}
              </button>
              {consent.allCovered && (
                <button
                  onClick={() => { playClickSound(); void submit('withdrawn'); }}
                  disabled={consent.isRecording}
                  className="py-3 px-4 bg-white hover:bg-rose-50 text-rose-700 border border-rose-200 font-bold rounded-xl text-xs transition flex items-center gap-1.5"
                >
                  <AlertTriangle className="w-3.5 h-3.5" />
                  Withdraw
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
};

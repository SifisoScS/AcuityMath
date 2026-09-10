/**
 * Signing in.
 *
 * One field and one button. There is no password to choose, forget, or reuse
 * from somewhere else — which for a service holding children's records is a
 * feature rather than a simplification.
 *
 * The panel deliberately says the same thing whether or not the address has an
 * account: "check your email". Anything else turns this form into a way to ask
 * whether a particular parent uses the service.
 */

import React, { useState } from 'react';
import { KeyRound, Mail, ShieldCheck, X } from 'lucide-react';

import { useModalA11y } from '../hooks/useModalA11y';

interface SignInPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

type Phase = 'form' | 'sent' | 'error';

export const SignInPanel: React.FC<SignInPanelProps> = ({ isOpen, onClose }) => {
  const [email, setEmail] = useState('');
  const [phase, setPhase] = useState<Phase>('form');
  const [message, setMessage] = useState('');
  const [devLink, setDevLink] = useState<string | null>(null);
  const [isSending, setIsSending] = useState(false);

  const panelRef = useModalA11y(isOpen, onClose);

  if (!isOpen) return null;

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (isSending) return;

    setIsSending(true);
    setMessage('');

    try {
      const response = await fetch('/api/auth/request-link', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ email }),
      });
      const body = await response.json();

      if (!response.ok) {
        setPhase('error');
        setMessage(body.error ?? 'Could not send a sign-in link. Try again shortly.');
        return;
      }

      setPhase('sent');
      // Present only when the server had no mail configured, so a developer is
      // never left waiting for an email that was never sent.
      setDevLink(body.devLink ?? null);
    } catch {
      setPhase('error');
      setMessage('Could not reach the server. Check your connection and try again.');
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fadeIn">
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="signin-heading"
        tabIndex={-1}
        className="bg-white rounded-3xl max-w-sm w-full p-6 shadow-2xl border border-slate-200 outline-hidden"
      >
        <div className="flex items-center justify-between pb-3 border-b border-slate-100">
          <div className="flex items-center gap-2 text-indigo-700 font-extrabold text-sm uppercase tracking-wider">
            <ShieldCheck className="w-4 h-4 text-indigo-600" />
            <span>Parent &amp; Educator Sign In</span>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="p-1 rounded-full text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {phase === 'sent' ? (
          <div className="text-center mt-6">
            <div className="w-12 h-12 rounded-2xl bg-emerald-50 border border-emerald-100 text-emerald-600 flex items-center justify-center mx-auto mb-3">
              <Mail className="w-6 h-6" />
            </div>
            <h2 id="signin-heading" className="text-lg font-black text-slate-900 tracking-tight">
              Check your email
            </h2>
            <p className="text-xs text-slate-500 mt-2 max-w-xs mx-auto">
              If <strong>{email}</strong> has an account, a sign-in link is on its way. It works once
              and expires in 15 minutes.
            </p>

            {devLink && (
              <div className="mt-5 text-left bg-amber-50 border border-amber-200 rounded-xl p-3">
                <p className="text-[11px] font-extrabold uppercase tracking-wider text-amber-700 mb-1">
                  Development only
                </p>
                <p className="text-[11px] text-amber-800 mb-2">
                  No mail server is configured, so nothing was sent. Use this link:
                </p>
                <a
                  href={devLink}
                  className="text-[11px] font-bold text-indigo-700 underline break-all"
                >
                  {devLink}
                </a>
              </div>
            )}
          </div>
        ) : (
          <form onSubmit={submit} className="mt-6">
            <div className="text-center mb-5">
              <div className="w-12 h-12 rounded-2xl bg-indigo-50 border border-indigo-100 text-indigo-600 flex items-center justify-center mx-auto mb-3">
                <KeyRound className="w-6 h-6" />
              </div>
              <h2 id="signin-heading" className="text-lg font-black text-slate-900 tracking-tight">
                Sign in to AcuityMath
              </h2>
              <p className="text-xs text-slate-500 mt-1 max-w-xs mx-auto">
                We will email you a link. There is no password to remember.
              </p>
            </div>

            <label htmlFor="signin-email" className="text-xs font-bold text-slate-600">
              Email address
            </label>
            <input
              id="signin-email"
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={event => setEmail(event.target.value)}
              placeholder="you@example.com"
              className="mt-1 w-full px-4 py-3 rounded-xl border-2 border-slate-200 focus:border-indigo-500 text-sm font-semibold text-slate-900 outline-hidden transition"
            />

            {phase === 'error' && (
              <p role="alert" className="mt-2 text-xs font-bold text-rose-700">
                {message}
              </p>
            )}

            <button
              type="submit"
              disabled={isSending || !email.trim()}
              className="mt-4 w-full px-6 py-3 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white rounded-xl font-bold text-sm transition cursor-pointer"
            >
              {isSending ? 'Sending…' : 'Email me a sign-in link'}
            </button>

            <p className="mt-4 text-[11px] text-slate-400 text-center">
              Children do not sign in. A parent signs in, then chooses whose turn it is.
            </p>
          </form>
        )}
      </div>
    </div>
  );
};

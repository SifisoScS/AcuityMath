/**
 * What a platform administrator needs to connect an LMS to this instance.
 *
 * **Everything this modal showed before E5 was invented.** Three of its four
 * endpoints pointed at routes that do not exist; it printed a client id, a
 * deployment id and a live-looking secret (`sec_live_…`) that belong to no
 * platform; it offered an LTI 1.1 cartridge under an LTI 1.3 heading; and its
 * "Test LMS Handshake" button was a 1,200ms `setTimeout` that reported *HTTP
 * 200 OK · RSA-256 JWT Signed · AGS v2.0 Passback Active* regardless of the
 * state of anything at all.
 *
 * The layout was worth keeping and the data under it was not — the same
 * judgement E1 made about the district dashboard. Endpoints now come from
 * `server/lti/toolConfiguration.ts`, which is also what `routes.ts` mounts, so
 * the advertisement and the route cannot drift apart again. The checks are real
 * reads, they can fail, and the one thing they cannot establish — whether a
 * platform can actually reach us — is printed beside them rather than implied
 * by a row of ticks.
 */

import React, { useState } from 'react';
import {
  ShieldCheck,
  Check,
  Copy,
  Download,
  RefreshCw,
  X,
  HelpCircle,
  Server,
  CheckCircle2,
  AlertTriangle,
} from 'lucide-react';
import { playClickSound, playSuccessSound } from '../utils/audio';
import { useModalA11y } from '../hooks/useModalA11y';
import { trpc } from '../lib/trpc';

interface LtiOnboardingWizardModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type Tab = 'endpoints' | 'guides' | 'oneroster' | 'checks';

export const LtiOnboardingWizardModal: React.FC<LtiOnboardingWizardModalProps> = ({
  isOpen,
  onClose,
}) => {
  /*
   * Every hook runs before the early return below.
   *
   * It did not: `if (!isOpen) return null` sat above four `useState` calls, so
   * opening the modal rendered more hooks than the render before it — the
   * condition React refuses outright. It survived because nothing ever mounted
   * this component in a test.
   */
  const panelRef = useModalA11y(isOpen, onClose);
  const [activeTab, setActiveTab] = useState<Tab>('endpoints');
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const config = trpc.lti.toolConfiguration.useQuery(undefined, { enabled: isOpen });

  if (!isOpen) return null;

  /*
   * With `APP_BASE_URL` unset the server returns paths rather than a guessed
   * host, so the browser's own origin fills them in — and the checks tab says
   * that is what happened. This address is a fact about where the reader is
   * standing; the server inventing a hostname would be the thing E5 undid.
   */
  const origin = typeof window === 'undefined' ? '' : window.location.origin;
  const absolute = (url: string) =>
    config.data?.baseUrlConfigured ? url : `${origin}${url}`;

  const endpoints = config.data
    ? [
        {
          key: 'oidc',
          label: 'OpenID Connect initiation URL',
          value: absolute(config.data.endpoints.loginUrl),
          note: 'Accepts GET and POST — platforms disagree about which they send.',
        },
        {
          key: 'target',
          label: 'Target link URI (launch URL)',
          value: absolute(config.data.endpoints.launchUrl),
          note: 'Deep linking arrives here too. It is told apart by its message type, not by a separate URL.',
        },
        {
          key: 'jwks',
          label: 'Public keyset URL',
          value: absolute(config.data.endpoints.jwksUrl),
          note: 'Fetched by the platform to verify anything we sign.',
        },
      ]
    : [];

  const handleCopy = (text: string, keyName: string) => {
    playClickSound();
    void navigator.clipboard.writeText(text);
    setCopiedKey(keyName);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  /**
   * The LTI 1.3 tool configuration, as JSON.
   *
   * The XML cartridge this replaced was `imslticc_v1p0` — **an LTI 1.1
   * document** offered under a 1.3 heading, which no 1.3 platform reads. It is
   * gone rather than fixed; there is nothing to fix it into.
   *
   * No `custom_fields` and no client id: those are issued by the platform
   * during registration, and the previous version's invented pair
   * (`dep_district_lincoln_2026`, a `sec_live_…` secret) read as credentials
   * somebody might try to use.
   */
  const handleDownloadJson = () => {
    if (!config.data) return;
    playClickSound();
    const document_ = {
      title: 'AcuityMath',
      description: 'Adaptive K–12 mathematics practice',
      oidc_initiation_url: absolute(config.data.endpoints.loginUrl),
      target_link_uri: absolute(config.data.endpoints.launchUrl),
      public_jwk_url: absolute(config.data.endpoints.jwksUrl),
      extensions: [
        {
          platform: 'canvas.instructure.com',
          privacy_level: 'public',
          settings: {
            placements: [
              { placement: 'course_navigation', message_type: 'LtiResourceLinkRequest' },
              {
                placement: 'assignment_selection',
                message_type: 'LtiDeepLinkingRequest',
                target_link_uri: absolute(config.data.endpoints.launchUrl),
              },
            ],
          },
        },
      ],
    };

    const blob = new Blob([JSON.stringify(document_, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'acuitymath-lti13-config.json';
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    playSuccessSound();
  };

  const tab = (id: Tab, label: string) => (
    <button
      key={id}
      type="button"
      role="tab"
      aria-selected={activeTab === id}
      onClick={() => {
        playClickSound();
        setActiveTab(id);
      }}
      className={`px-3 py-2 rounded-xl text-xs font-bold transition cursor-pointer ${
        activeTab === id
          ? 'bg-indigo-600 text-white shadow-sm'
          : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
      }`}
    >
      {label}
    </button>
  );

  return (
    <div
      ref={panelRef}
      role="dialog"
      aria-modal="true"
      aria-label="Learning management system setup"
      tabIndex={-1}
      className="fixed inset-0 z-50 bg-slate-900/70 backdrop-blur-xs flex items-center justify-center p-3 sm:p-5 overflow-y-auto"
    >
      <div className="bg-white w-full max-w-3xl rounded-3xl p-6 sm:p-7 shadow-2xl border border-slate-200 space-y-5 my-auto max-h-[92vh] flex flex-col">
        <div className="flex items-start justify-between pb-4 border-b border-slate-100 shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-indigo-600 text-white rounded-2xl shadow-sm">
              <Server className="w-6 h-6" />
            </div>
            <div>
              <h3 className="font-extrabold text-lg sm:text-xl text-slate-900">
                Connect a learning management system
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                LTI 1.3 Advantage — Core, Names and Roles, Assignment and Grade Services, and
                Deep Linking.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="p-2 rounded-xl hover:bg-slate-100 text-slate-400 hover:text-slate-700 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div role="tablist" className="flex flex-wrap gap-2 shrink-0">
          {tab('endpoints', 'Endpoints')}
          {tab('guides', 'How to register')}
          {tab('oneroster', 'OneRoster')}
          {tab('checks', 'Check this instance')}
        </div>

        <div className="overflow-y-auto grow">
          {config.isLoading ? <p className="text-sm text-slate-500">Loading…</p> : null}

          {config.error ? (
            <p role="alert" className="text-sm text-rose-700">
              {config.error.message}
            </p>
          ) : null}

          {activeTab === 'endpoints' && config.data ? (
            <div className="space-y-3">
              {!config.data.baseUrlConfigured ? (
                <p className="p-3 rounded-2xl bg-amber-50 border border-amber-200 text-xs text-amber-900">
                  <strong>This server has no public address configured.</strong> The addresses
                  below use the one your browser is on, which is almost certainly not what a
                  platform should be given. See <em>Check this instance</em>.
                </p>
              ) : null}

              {endpoints.map(endpoint => (
                <div
                  key={endpoint.key}
                  className="p-3 rounded-2xl bg-slate-50 border border-slate-200"
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-xs font-bold text-slate-900">{endpoint.label}</span>
                    <button
                      type="button"
                      onClick={() => handleCopy(endpoint.value, endpoint.key)}
                      aria-label={`Copy ${endpoint.label}`}
                      className="p-1.5 rounded-lg hover:bg-slate-200 text-slate-500 transition cursor-pointer shrink-0"
                    >
                      {copiedKey === endpoint.key ? (
                        <Check className="w-3.5 h-3.5 text-emerald-600" />
                      ) : (
                        <Copy className="w-3.5 h-3.5" />
                      )}
                    </button>
                  </div>
                  <code className="block mt-1 text-xs font-mono text-slate-800 break-all select-all">
                    {endpoint.value}
                  </code>
                  <p className="mt-1 text-[11px] text-slate-500">{endpoint.note}</p>
                </div>
              ))}

              <button
                type="button"
                onClick={handleDownloadJson}
                className="px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs flex items-center gap-2 cursor-pointer transition"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Download LTI 1.3 configuration (JSON)</span>
              </button>
            </div>
          ) : null}

          {activeTab === 'guides' ? (
            <div className="space-y-3 text-xs text-slate-600 leading-relaxed">
              <p className="flex items-start gap-2">
                <HelpCircle className="w-4 h-4 text-indigo-600 shrink-0 mt-0.5" />
                <span>
                  Registration happens in your LMS. Paste the three addresses from{' '}
                  <em>Endpoints</em>, or import the JSON. Your platform then issues a{' '}
                  <strong>client id</strong> and a <strong>deployment id</strong>.
                </span>
              </p>
              <p>
                Send those two values, along with your platform&rsquo;s own authorization, token
                and keyset URLs, to whoever administers this instance — they are registered here
                before a launch can succeed. This modal does not show them because they belong
                to your platform, not to this tool.
              </p>
              <p>
                A launch will only place pupils in your district once an institutional agreement
                is recorded for it. Until then a pupil launching is refused with an explanation
                rather than admitted without consent.
              </p>
            </div>
          ) : null}

          {activeTab === 'oneroster' && config.data ? (
            <div className="space-y-3 text-xs">
              {config.data.oneRosterAvailable ? (
                <p className="text-slate-600">OneRoster is available on this instance.</p>
              ) : (
                <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-2">
                  <p className="font-bold text-slate-900 flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-amber-600" />
                    OneRoster is not available yet
                  </p>
                  <p className="text-slate-600 leading-relaxed">
                    This tab used to print a OneRoster 1.2 base URL, a consumer key and a
                    secret. Nothing served that address — an administrator who configured it
                    would have got a 404 on every sync.
                  </p>
                  <p className="text-slate-600 leading-relaxed">
                    Rostering works today through <strong>Names and Roles</strong> over LTI: once
                    a course has launched, an administrator can synchronise its roster from the
                    district console without any separate credentials.
                  </p>
                </div>
              )}
            </div>
          ) : null}

          {activeTab === 'checks' && config.data ? (
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <h4 className="font-extrabold text-sm text-slate-900">This instance</h4>
                <button
                  type="button"
                  onClick={() => {
                    playClickSound();
                    void config.refetch();
                  }}
                  disabled={config.isFetching}
                  className="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs flex items-center gap-2 cursor-pointer transition disabled:opacity-50"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${config.isFetching ? 'animate-spin' : ''}`} />
                  <span>{config.isFetching ? 'Checking…' : 'Check again'}</span>
                </button>
              </div>

              <ul className="space-y-2">
                {config.data.checks.map(check => (
                  <li
                    key={check.id}
                    className={`p-3 rounded-2xl border flex items-start gap-3 ${
                      check.state === 'pass'
                        ? 'bg-emerald-50 border-emerald-200'
                        : 'bg-rose-50 border-rose-200'
                    }`}
                  >
                    {check.state === 'pass' ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                    ) : (
                      <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                    )}
                    <div className="space-y-0.5">
                      <span
                        className={`block text-xs font-black ${
                          check.state === 'pass' ? 'text-emerald-950' : 'text-rose-950'
                        }`}
                      >
                        {/*
                          * The state in words, not only in colour.
                          *
                          * A tick and a green panel say "passed" to somebody who
                          * can see both. Found by mutation: swapping the icon for
                          * an unconditional tick changed nothing any test — or any
                          * screen reader — could observe.
                          */}
                        <span className="sr-only">
                          {check.state === 'pass' ? 'Passed: ' : 'Failed: '}
                        </span>
                        {check.label}
                      </span>
                      <p
                        className={`text-[11px] leading-relaxed ${
                          check.state === 'pass' ? 'text-emerald-800' : 'text-rose-800'
                        }`}
                      >
                        {check.detail}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>

              {/*
                * The limit, next to the results rather than under them.
                *
                * These checks run on this server's own network. A platform
                * reaches it across somebody else's, and no local read can tell a
                * correctly configured tool behind a firewall from a reachable
                * one. The version of this screen that claimed otherwise printed
                * "HTTP 200 OK" without making a request.
                */}
              <p className="text-[11px] text-slate-500 leading-relaxed">
                These are checks this server can make about itself. <strong>They cannot tell
                you whether your platform can reach it</strong> — that depends on DNS, firewalls
                and certificates outside this application. The first launch is what establishes
                it, and a failure there will name its own cause.
              </p>
            </div>
          ) : null}
        </div>

        <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-xs shrink-0">
          <span className="flex items-center gap-1.5 text-slate-400 text-[11px]">
            <ShieldCheck className="w-3.5 h-3.5 text-indigo-600" />
            Launches are signed RS256 and validated against your platform&rsquo;s keyset.
          </span>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold transition cursor-pointer"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};

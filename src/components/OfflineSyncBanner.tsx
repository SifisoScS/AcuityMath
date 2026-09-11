/**
 * What is unsent, and whether the last attempt to send it worked.
 *
 * The version this replaces read its state from a `syncState` object that
 * `triggerCloudSync` emptied on a timer. It therefore said:
 *
 *   - "Cloud Connected" whenever a simulation toggle was off, having never
 *     checked whether the server was reachable;
 *   - "All math progress synced" whenever the queue was empty, which it always
 *     became whether or not the request had succeeded;
 *   - a journal in which every entry rendered a green tick, because the only
 *     status ever written was `'synced'`;
 *   - "Local-first queue with cloud conflict resolution", of which the conflict
 *     resolution did not exist.
 *
 * Every figure here now comes from the queue itself.
 */

import React, { useState } from 'react';
import { Wifi, WifiOff, RefreshCw, CheckCircle2, AlertTriangle, History, X, Clock } from 'lucide-react';

import { playClickSound } from '../utils/audio';
import type { Connectivity } from '../offline/useConnectivity';
import type { QueuedAttempt } from '../offline/queue';

interface OfflineSyncBannerProps {
  status: Connectivity;
  pendingCount: number;
  pending: QueuedAttempt[];
  lastSyncedAt: number | null;
  lastError: string | null;
  isSyncing: boolean;
  onSetSimulatedOffline: (simulated: boolean) => void;
  onTriggerSync: () => void;
}

function when(at: number): string {
  const seconds = Math.max(0, Math.round((Date.now() - at) / 1000));
  if (seconds < 60) return 'just now';
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min${minutes === 1 ? '' : 's'} ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  return new Date(at).toLocaleDateString();
}

export const OfflineSyncBanner: React.FC<OfflineSyncBannerProps> = ({
  status,
  pendingCount,
  pending,
  lastSyncedAt,
  lastError,
  isSyncing,
  onSetSimulatedOffline,
  onTriggerSync
}) => {
  const [showDetail, setShowDetail] = useState(false);
  const simulated = status === 'simulated-offline';
  const offline = status !== 'online';

  /*
   * Three states, not two. "Simulated" is kept distinct from genuinely offline
   * because telling somebody they have no connection when they pressed a demo
   * button is a small lie, and the distinction costs one branch.
   */
  const connectionLabel = simulated
    ? 'Offline simulation'
    : status === 'offline'
      ? 'Cannot reach the server'
      : 'Connected';

  /*
   * What the queue actually says. "All progress synced" is claimed only when
   * nothing is waiting *and* a reconciliation has actually completed this
   * session — an empty queue on a fresh load means nothing was left over, not
   * that anything was sent.
   */
  const queueLabel = lastError
    ? `${pendingCount} answer${pendingCount === 1 ? '' : 's'} waiting — last attempt failed`
    : pendingCount > 0
      ? `${pendingCount} answer${pendingCount === 1 ? '' : 's'} waiting to be saved`
      : lastSyncedAt
        ? `All answers saved (${when(lastSyncedAt)})`
        : 'Nothing waiting to be saved';

  return (
    <>
      <div className="bg-slate-900 text-white px-4 py-2 text-xs flex items-center justify-between border-b border-slate-800">
        <div className="flex items-center gap-3">
          <button
            onClick={() => {
              playClickSound();
              onSetSimulatedOffline(!simulated);
            }}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full font-bold text-[11px] transition cursor-pointer border ${
              offline
                ? 'bg-amber-950/80 text-amber-300 border-amber-500/50'
                : 'bg-emerald-950/80 text-emerald-300 border-emerald-500/50'
            }`}
            title={
              simulated
                ? 'Turn off the offline simulation'
                : 'Simulate losing the connection, to see the queue work'
            }
          >
            {offline ? (
              <WifiOff className="w-3.5 h-3.5 text-amber-400" />
            ) : (
              <Wifi className="w-3.5 h-3.5 text-emerald-400" />
            )}
            <span>{connectionLabel}</span>
          </button>

          <span
            className={`hidden sm:inline ${
              lastError ? 'text-amber-300' : pendingCount > 0 ? 'text-slate-300' : 'text-slate-400'
            }`}
          >
            {queueLabel}
          </span>
        </div>

        <div className="flex items-center gap-2">
          {pendingCount > 0 && (
            <button
              onClick={() => {
                playClickSound();
                onTriggerSync();
              }}
              disabled={isSyncing}
              className="flex items-center gap-1.5 px-3 py-1 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-lg transition text-[11px] shadow-sm cursor-pointer disabled:opacity-50"
            >
              <RefreshCw className={`w-3 h-3 ${isSyncing ? 'animate-spin' : ''}`} />
              <span>{isSyncing ? 'Saving…' : 'Save now'}</span>
            </button>
          )}

          <button
            onClick={() => {
              playClickSound();
              setShowDetail(true);
            }}
            className="text-slate-400 hover:text-slate-200 p-1 rounded transition cursor-pointer"
            title="What is waiting to be saved"
            aria-label={
              pendingCount > 0
                ? `What is waiting to be saved, ${pendingCount} answers`
                : 'What is waiting to be saved, none'
            }
          >
            <History className="w-4 h-4" />
          </button>
        </div>
      </div>

      {showDetail && (
        <div
          role="dialog"
          aria-label="Answers waiting to be saved"
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/80 backdrop-blur-sm p-4"
        >
          <div className="bg-white rounded-3xl p-6 max-w-md w-full shadow-2xl border border-slate-200 text-slate-900 space-y-4">
            <div className="flex justify-between items-start border-b border-slate-200 pb-3">
              <div>
                <h3 className="text-base font-extrabold flex items-center gap-2">
                  <History className="w-4 h-4 text-indigo-600" />
                  Answers waiting to be saved
                </h3>
                {/*
                  This subtitle said "Local-first queue with cloud conflict
                  resolution". There is no conflict resolution — an answer is
                  sent once, and the server ignores a repeat of one it already
                  has.
                */}
                <p className="text-xs text-slate-500">
                  Kept on this device until the server confirms each one.
                </p>
              </div>
              <button
                onClick={() => setShowDetail(false)}
                className="text-slate-400 hover:text-slate-600 font-bold"
                aria-label="Close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {lastError && (
              <p
                role="alert"
                className="p-2.5 rounded-xl bg-amber-50 border border-amber-200 text-xs font-semibold text-amber-900 flex items-start gap-2"
              >
                <AlertTriangle className="w-4 h-4 shrink-0 mt-px" />
                <span>
                  The last attempt to save failed: {lastError} Nothing was lost — these are still
                  here and will be sent again.
                </span>
              </p>
            )}

            <div className="p-3 bg-slate-50 rounded-2xl border border-slate-200 text-xs flex items-center justify-between">
              <div>
                <span className="text-slate-500 block">Waiting:</span>
                <span className="font-bold text-slate-800">
                  {pendingCount} answer{pendingCount === 1 ? '' : 's'}
                </span>
              </div>
              <button
                onClick={onTriggerSync}
                disabled={isSyncing || pendingCount === 0}
                className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold text-xs shadow-sm transition disabled:opacity-40"
              >
                {isSyncing ? 'Saving…' : 'Save now'}
              </button>
            </div>

            <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
              {pending.length === 0 ? (
                <p className="text-xs text-slate-400 text-center py-4 flex flex-col items-center gap-1.5">
                  <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                  <span>
                    {lastSyncedAt
                      ? `Everything has been saved (${when(lastSyncedAt)}).`
                      : 'Nothing is waiting.'}
                  </span>
                </p>
              ) : (
                pending.map(item => (
                  <div
                    key={item.clientId}
                    className="p-2.5 rounded-xl border border-slate-200 bg-white text-xs flex items-center justify-between gap-2"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      {/*
                        A clock, not a tick. The old journal drew a green
                        CheckCircle2 beside every row because the only status it
                        ever stored was 'synced'.
                      */}
                      <Clock className="w-4 h-4 text-amber-600 shrink-0" />
                      <div className="min-w-0">
                        <span className="font-semibold text-slate-800 block truncate">
                          Answered “{item.answer}”
                        </span>
                        {item.attempts > 0 && (
                          <span className="text-[10px] text-amber-700">
                            {item.attempts} failed attempt{item.attempts === 1 ? '' : 's'}
                            {item.lastError ? ` — ${item.lastError}` : ''}
                          </span>
                        )}
                      </div>
                    </div>
                    <span className="text-[10px] font-mono text-slate-400 shrink-0">
                      {when(item.answeredAt)}
                    </span>
                  </div>
                ))
              )}
            </div>

            <button
              onClick={() => setShowDetail(false)}
              className="w-full py-2 bg-slate-200 hover:bg-slate-300 text-slate-800 font-bold rounded-xl text-xs transition cursor-pointer"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}
    </>
  );
};

import React, { useState } from 'react';
import { OfflineSyncState } from '../types';
import { Wifi, WifiOff, RefreshCw, CheckCircle2, History, X } from 'lucide-react';
import { playClickSound, playSuccessSound } from '../utils/audio';

interface OfflineSyncBannerProps {
  syncState: OfflineSyncState;
  onToggleOfflineMode: (offline: boolean) => void;
  onTriggerSync: () => void;
  isSyncing: boolean;
}

export const OfflineSyncBanner: React.FC<OfflineSyncBannerProps> = ({
  syncState,
  onToggleOfflineMode,
  onTriggerSync,
  isSyncing
}) => {
  const [showLogModal, setShowLogModal] = useState(false);

  return (
    <>
      <div className="bg-slate-900 text-white px-4 py-2 text-xs flex items-center justify-between border-b border-slate-800">
        <div className="flex items-center gap-3">
          {/* Connectivity toggle badge */}
          <button
            onClick={() => {
              playClickSound();
              onToggleOfflineMode(!syncState.isOffline);
            }}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full font-bold text-[11px] transition cursor-pointer border ${
              syncState.isOffline
                ? 'bg-amber-950/80 text-amber-300 border-amber-500/50'
                : 'bg-emerald-950/80 text-emerald-300 border-emerald-500/50'
            }`}
            title="Click to simulate Online / Offline network switch"
          >
            {syncState.isOffline ? (
              <>
                <WifiOff className="w-3.5 h-3.5 text-amber-400" />
                <span>Offline Simulation Active</span>
              </>
            ) : (
              <>
                <Wifi className="w-3.5 h-3.5 text-emerald-400" />
                <span>Cloud Connected</span>
              </>
            )}
          </button>

          {/* Pending items indicator */}
          {syncState.pendingActions.length > 0 ? (
            <span className="hidden sm:inline text-slate-300">
              <strong className="text-amber-400">{syncState.pendingActions.length} actions</strong> queued offline (auto-sync ready)
            </span>
          ) : (
            <span className="hidden sm:inline text-slate-400">
              All math progress synced ({syncState.lastSyncedAt})
            </span>
          )}
        </div>

        {/* Sync Actions */}
        <div className="flex items-center gap-2">
          {syncState.pendingActions.length > 0 && (
            <button
              onClick={() => {
                playClickSound();
                onTriggerSync();
              }}
              disabled={isSyncing}
              className="flex items-center gap-1.5 px-3 py-1 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-lg transition text-[11px] shadow-sm cursor-pointer disabled:opacity-50"
            >
              <RefreshCw className={`w-3 h-3 ${isSyncing ? 'animate-spin' : ''}`} />
              <span>{isSyncing ? 'Syncing...' : 'Sync to Cloud'}</span>
            </button>
          )}

          <button
            onClick={() => {
              playClickSound();
              setShowLogModal(true);
            }}
            className="text-slate-400 hover:text-slate-200 p-1 rounded transition cursor-pointer"
            title="View Sync History"
          >
            <History className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Sync Log Modal */}
      {showLogModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/80 backdrop-blur-sm p-4">
          <div className="bg-white rounded-3xl p-6 max-w-md w-full shadow-2xl border border-slate-200 text-slate-900 space-y-4">
            <div className="flex justify-between items-start border-b border-slate-200 pb-3">
              <div>
                <h3 className="text-base font-extrabold flex items-center gap-2">
                  <History className="w-4 h-4 text-indigo-600" />
                  Offline Progress Sync Journal
                </h3>
                <p className="text-xs text-slate-500">Local-first queue with cloud conflict resolution</p>
              </div>
              <button
                onClick={() => setShowLogModal(false)}
                className="text-slate-400 hover:text-slate-600 font-bold"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Status card */}
            <div className="p-3 bg-slate-50 rounded-2xl border border-slate-200 text-xs flex items-center justify-between">
              <div>
                <span className="text-slate-500 block">Queue Status:</span>
                <span className="font-bold text-slate-800">
                  {syncState.pendingActions.length} Pending Local Items
                </span>
              </div>
              <button
                onClick={() => {
                  onTriggerSync();
                  playSuccessSound();
                }}
                disabled={isSyncing || syncState.pendingActions.length === 0}
                className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold text-xs shadow-sm transition disabled:opacity-40"
              >
                {isSyncing ? 'Syncing...' : 'Sync Now'}
              </button>
            </div>

            {/* Sync logs list */}
            <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
              {syncState.syncLogs.length === 0 ? (
                <p className="text-xs text-slate-400 text-center py-4">No recent sync events logged.</p>
              ) : (
                syncState.syncLogs.map(log => (
                  <div
                    key={log.id}
                    className="p-2.5 rounded-xl border border-slate-200 bg-white text-xs flex items-center justify-between"
                  >
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                      <span className="font-semibold text-slate-800">{log.action}</span>
                    </div>
                    <span className="text-[10px] font-mono text-slate-400">{log.timestamp}</span>
                  </div>
                ))
              )}
            </div>

            <button
              onClick={() => setShowLogModal(false)}
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

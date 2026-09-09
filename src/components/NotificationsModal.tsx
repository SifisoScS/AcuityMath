import React, { useState } from 'react';
import { NotificationItem } from '../types';
import { Bell, Check, Sparkles, BookOpen, Flame, Award, X, CheckCheck } from 'lucide-react';
import { playClickSound } from '../utils/audio';

interface NotificationsModalProps {
  notifications: NotificationItem[];
  onClose: () => void;
  onMarkAllAsRead: () => void;
  onClearNotifications: () => void;
  onToggleRead: (id: string) => void;
}

export const NotificationsModal: React.FC<NotificationsModalProps> = ({
  notifications,
  onClose,
  onMarkAllAsRead,
  onClearNotifications,
  onToggleRead
}) => {
  const [filter, setFilter] = useState<'all' | 'milestone' | 'assignment' | 'streak'>('all');

  const filtered = notifications.filter(n => filter === 'all' || n.type === filter);
  const unreadCount = notifications.filter(n => !n.read).length;

  const getTypeIcon = (type: NotificationItem['type']) => {
    switch (type) {
      case 'milestone':
        return <Sparkles className="w-4 h-4 text-amber-500" />;
      case 'assignment':
        return <BookOpen className="w-4 h-4 text-indigo-500" />;
      case 'streak':
        return <Flame className="w-4 h-4 text-rose-500" />;
      default:
        return <Award className="w-4 h-4 text-purple-500" />;
    }
  };

  return (
    <div
      role="dialog"
      aria-label="Notifications"
      tabIndex={-1}
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/80 backdrop-blur-sm p-3 sm:p-6 overflow-y-auto">
      <div className="relative w-full max-w-lg bg-white rounded-3xl shadow-2xl border border-slate-200 flex flex-col overflow-hidden my-auto max-h-[85vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-slate-50">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-indigo-100 text-indigo-600 flex items-center justify-center">
              <Bell className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                Notifications & Milestones
                {unreadCount > 0 && (
                  <span className="text-xs bg-indigo-600 text-white font-bold px-2 py-0.5 rounded-full">
                    {unreadCount} new
                  </span>
                )}
              </h3>
              <p className="text-xs text-slate-500">Upcoming assignments & learning achievements</p>
            </div>
          </div>

          <button
            onClick={() => {
              playClickSound();
              onClose();
            }}
            className="p-1.5 hover:bg-slate-200 text-slate-500 rounded-xl transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Filter Pills */}
        <div className="flex items-center justify-between px-6 py-2.5 bg-white border-b border-slate-100 text-xs">
          <div className="flex gap-1">
            {(['all', 'milestone', 'assignment', 'streak'] as const).map(f => (
              <button
                key={f}
                onClick={() => {
                  playClickSound();
                  setFilter(f);
                }}
                className={`px-2.5 py-1 rounded-lg font-bold capitalize transition ${
                  filter === f
                    ? 'bg-slate-900 text-white'
                    : 'text-slate-500 hover:bg-slate-100'
                }`}
              >
                {f}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2 text-[11px] font-semibold text-indigo-600">
            <button
              onClick={onMarkAllAsRead}
              className="hover:underline flex items-center gap-1 cursor-pointer"
            >
              <CheckCheck className="w-3.5 h-3.5" />
              <span>Mark all read</span>
            </button>
          </div>
        </div>

        {/* Notifications List */}
        <div className="p-4 sm:p-6 overflow-y-auto flex-1 space-y-3 max-h-[50vh]">
          {filtered.length === 0 ? (
            <div className="py-12 text-center text-slate-400 text-xs">
              No notifications in this category.
            </div>
          ) : (
            filtered.map(item => (
              <div
                key={item.id}
                onClick={() => onToggleRead(item.id)}
                className={`p-3.5 rounded-2xl border transition cursor-pointer flex items-start gap-3.5 ${
                  item.read
                    ? 'bg-white border-slate-200 opacity-75'
                    : 'bg-indigo-50/40 border-indigo-200 shadow-xs'
                }`}
              >
                <div className="w-9 h-9 rounded-xl bg-white border border-slate-200 flex items-center justify-center shrink-0 shadow-xs mt-0.5">
                  {getTypeIcon(item.type)}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-bold text-slate-900 truncate">{item.title}</h4>
                    <span className="text-[10px] text-slate-400 shrink-0 ml-2">{item.timestamp}</span>
                  </div>
                  <p className="text-xs text-slate-600 mt-0.5 leading-relaxed">{item.message}</p>
                </div>

                {!item.read && (
                  <span className="w-2 h-2 rounded-full bg-indigo-600 shrink-0 mt-1.5" />
                )}
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 bg-slate-50 border-t border-slate-200 flex items-center justify-between text-xs">
          <button
            onClick={onClearNotifications}
            className="text-slate-400 hover:text-rose-600 font-semibold transition cursor-pointer"
          >
            Clear all notifications
          </button>
          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-slate-900 hover:bg-slate-800 text-white font-bold rounded-xl transition cursor-pointer"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};

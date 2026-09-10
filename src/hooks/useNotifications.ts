/**
 * The bell, from the server.
 *
 * Replaces `INITIAL_NOTIFICATIONS` — four invented items about children who do
 * not exist ("Alex Rivera achieved Level 8", "Leo Chen is on a 7-day streak"),
 * one of them repeating the invented analytics deleted in B3f-1 ("Maya practiced
 * 145 minutes this week with 94% accuracy").
 *
 * ## Two queries, one bell
 *
 * A family device has an adult signed in and a child selected, and both have
 * things they are told. The server keeps them apart — `forMe` is guarded by the
 * session, `forLearner` by `learnerProcedure` — and they are merged here rather
 * than server-side, so neither procedure has to take an optional argument and
 * check entitlement by hand.
 */

import { useMemo } from 'react';

import { trpc } from '../lib/trpc';
import type { NotificationItem } from '../types';

interface ServerNotification {
  id: number;
  type: 'milestone' | 'assignment';
  title: string;
  message: string;
  createdAt: string | Date;
  read: boolean;
  aboutLearnerId: number | null;
  conceptId: string | null;
  assignmentId: number | null;
}

/**
 * "3 hours ago", from a real timestamp.
 *
 * The invented notifications carried strings — `'15 mins ago'`, `'2 days ago'` —
 * which never changed however long the page stayed open, and were written to
 * localStorage as-is, so a notification saved on Monday still said "15 mins ago"
 * on Friday.
 */
export function relativeTime(at: Date, now: Date = new Date()): string {
  const seconds = Math.max(0, Math.round((now.getTime() - at.getTime()) / 1000));
  if (seconds < 60) return 'Just now';

  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min${minutes === 1 ? '' : 's'} ago`;

  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;

  const days = Math.round(hours / 24);
  if (days < 7) return `${days} day${days === 1 ? '' : 's'} ago`;

  return at.toLocaleDateString();
}

export function toNotificationItem(row: ServerNotification): NotificationItem {
  return {
    id: String(row.id),
    title: row.title,
    message: row.message,
    type: row.type,
    timestamp: relativeTime(new Date(row.createdAt)),
    read: row.read,
    targetId: row.aboutLearnerId === null ? undefined : `learner-${row.aboutLearnerId}`,
  };
}

/**
 * Merges the adult's bell and the selected child's, newest first.
 *
 * Sorted on the real timestamps rather than the rendered strings: "2 days ago"
 * and "2 hours ago" do not sort sensibly as text, and that is the sort a list
 * ordered by its own labels would get.
 */
export function mergeNotifications(
  mine: ServerNotification[],
  child: ServerNotification[],
): NotificationItem[] {
  return [...mine, ...child]
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .map(toNotificationItem);
}

export interface NotificationsState {
  notifications: NotificationItem[];
  unreadCount: number;
  markAllRead: () => Promise<void>;
  clear: () => Promise<void>;
  toggleRead: (id: string) => Promise<void>;
}

export function useNotifications(learnerId: number | null, enabled: boolean): NotificationsState {
  const utils = trpc.useUtils();

  const mine = trpc.notifications.forMe.useQuery(undefined, { enabled, retry: false });
  const child = trpc.notifications.forLearner.useQuery(
    { learnerId: learnerId ?? 0 },
    { enabled: enabled && learnerId !== null, retry: false },
  );

  const refresh = () => {
    void utils.notifications.forMe.invalidate();
    void utils.notifications.forLearner.invalidate();
  };

  const setRead = trpc.notifications.setRead.useMutation({ onSuccess: refresh });
  const markAll = trpc.notifications.markAllRead.useMutation({ onSuccess: refresh });
  const clearAll = trpc.notifications.clear.useMutation({ onSuccess: refresh });

  const notifications = useMemo(
    () =>
      mergeNotifications(
        (mine.data as ServerNotification[] | undefined) ?? [],
        (child.data as ServerNotification[] | undefined) ?? [],
      ),
    [mine.data, child.data],
  );

  return {
    notifications,
    unreadCount: notifications.filter(item => !item.read).length,
    markAllRead: async () => {
      await markAll.mutateAsync();
    },
    clear: async () => {
      await clearAll.mutateAsync();
    },
    toggleRead: async (id: string) => {
      const current = notifications.find(item => item.id === id);
      if (!current) return;
      await setRead.mutateAsync({ notificationId: Number(id), read: !current.read });
    },
  };
}

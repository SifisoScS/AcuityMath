/**
 * The bell's client side: two lists into one, and real timestamps.
 *
 * The invented notifications carried their timestamps as prose — `'15 mins
 * ago'`, `'2 days ago'` — which never changed however long the page stayed open,
 * and were written to localStorage verbatim, so one saved on Monday still said
 * "15 mins ago" on Friday.
 */

import { describe, expect, it } from 'vitest';

import { mergeNotifications, relativeTime, toNotificationItem } from './useNotifications';

const at = (iso: string) => new Date(iso);

const row = (over: Partial<Parameters<typeof toNotificationItem>[0]> = {}) => ({
  id: 1,
  type: 'milestone' as const,
  title: 'Concept mastered',
  message: 'You have mastered Number Bonds.',
  createdAt: at('2026-09-10T12:00:00Z'),
  read: false,
  aboutLearnerId: 12,
  conceptId: 'number-bonds',
  assignmentId: null,
  ...over,
});

describe('relative time', () => {
  const now = at('2026-09-10T12:00:00Z');

  it('says "Just now" inside the first minute', () => {
    expect(relativeTime(at('2026-09-10T11:59:30Z'), now)).toBe('Just now');
  });

  it('counts minutes, then hours, then days', () => {
    expect(relativeTime(at('2026-09-10T11:45:00Z'), now)).toBe('15 mins ago');
    expect(relativeTime(at('2026-09-10T09:00:00Z'), now)).toBe('3 hours ago');
    expect(relativeTime(at('2026-09-08T12:00:00Z'), now)).toBe('2 days ago');
  });

  it('says one thing in the singular', () => {
    expect(relativeTime(at('2026-09-10T11:59:00Z'), now)).toBe('1 min ago');
    expect(relativeTime(at('2026-09-10T11:00:00Z'), now)).toBe('1 hour ago');
    expect(relativeTime(at('2026-09-09T12:00:00Z'), now)).toBe('1 day ago');
  });

  it('gives a date once a week has passed', () => {
    // "37 days ago" is not what anybody wants to read.
    expect(relativeTime(at('2026-08-01T12:00:00Z'), now)).toMatch(/\d/);
    expect(relativeTime(at('2026-08-01T12:00:00Z'), now)).not.toMatch(/ago/);
  });

  it('does not report the future as time elapsed', () => {
    // Clock skew between the browser and the server, not a bug worth crashing
    // over — but "-3 mins ago" is not a thing.
    expect(relativeTime(at('2026-09-10T12:05:00Z'), now)).toBe('Just now');
  });
});

describe('mapping a notification', () => {
  it('carries the id as a string the list can key on', () => {
    expect(toNotificationItem(row({ id: 7 })).id).toBe('7');
  });

  it('points at the child it concerns using a profile id', () => {
    // Everything client-side speaks in profile ids; the server speaks in learner
    // ids. Getting that join wrong crashed the parent dashboard in B3f-1.
    expect(toNotificationItem(row({ aboutLearnerId: 12 })).targetId).toBe('learner-12');
  });

  it('leaves the target out when it concerns no one child', () => {
    expect(toNotificationItem(row({ aboutLearnerId: null })).targetId).toBeUndefined();
  });

  it('accepts a timestamp that arrived over the wire as a string', () => {
    // tRPC's JSON transport hands back an ISO string, not a Date.
    const item = toNotificationItem(row({ createdAt: '2026-09-10T12:00:00Z' }));
    expect(item.timestamp).toBeTruthy();
    expect(item.timestamp).not.toContain('Invalid');
  });
});

describe('merging the two bells', () => {
  it('orders by when things happened, not by the labels', () => {
    // "2 days ago" and "2 hours ago" do not sort sensibly as text, which is the
    // order a list sorted by its own rendered labels would end up in.
    const merged = mergeNotifications(
      [row({ id: 1, createdAt: at('2026-09-08T12:00:00Z'), message: 'older' })],
      [row({ id: 2, createdAt: at('2026-09-10T11:00:00Z'), message: 'newer' })],
    );
    expect(merged.map(item => item.message)).toEqual(['newer', 'older']);
  });

  it('keeps both audiences', () => {
    const merged = mergeNotifications([row({ id: 1 })], [row({ id: 2 })]);
    expect(merged).toHaveLength(2);
    expect(new Set(merged.map(item => item.id))).toEqual(new Set(['1', '2']));
  });

  it('is empty rather than absent when nothing has happened', () => {
    expect(mergeNotifications([], [])).toEqual([]);
  });
});

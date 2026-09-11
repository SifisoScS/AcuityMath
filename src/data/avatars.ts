/**
 * The companion avatars, and what they cost.
 *
 * In its own module because the server reads it. The catalogue used to live only
 * in `curriculumData.ts` and `RewardsView` passed the price it had read from
 * there into the purchase — so the price a learner paid was the price their
 * browser said, and a child with a console could have had the phoenix for
 * nothing.
 *
 * Now the client reads this to draw the shop, and the server reads the same list
 * to decide what to charge. The one the server reads is the one that counts.
 *
 * The `unlocked` field is gone with it: it described which avatars were free at
 * one point, which is what `price === 0` already says, and having both meant a
 * `price: 75, unlocked: true` row that gave away a paid avatar.
 */

import type { AgeTier } from '../types';

export interface StoreAvatar {
  id: string;
  name: string;
  icon: string;
  /** Star Coins. Zero means it is free to everyone from the start. */
  price: number;
  tier: AgeTier;
}

export const STORE_AVATARS: StoreAvatar[] = [
  { id: 'av-owl', name: 'Professor Archimedes', icon: '🦉', price: 0, tier: 'early' },
  { id: 'av-fox', name: 'Nova the Swift Fox', icon: '🦊', price: 50, tier: 'early' },
  { id: 'av-robot', name: 'Compute-O-Matic', icon: '🤖', price: 75, tier: 'elementary' },
  { id: 'av-astronaut', name: 'Cosmo Vector', icon: '🧑‍🚀', price: 100, tier: 'elementary' },
  { id: 'av-wizard', name: 'Archmage Euler', icon: '🧙‍♂️', price: 150, tier: 'middle' },
  { id: 'av-dragon', name: 'Matrix Drake', icon: '🐉', price: 200, tier: 'middle' },
  { id: 'av-einstein', name: 'Quantum Pioneer', icon: '⚛️', price: 250, tier: 'high' },
  { id: 'av-phoenix', name: 'Infinitum Bird', icon: '🔥', price: 300, tier: 'high' },
];

export function avatarById(id: string): StoreAvatar | undefined {
  return STORE_AVATARS.find(avatar => avatar.id === id);
}

/** Avatars that cost nothing, and so are available without being bought. */
export const FREE_AVATAR_IDS = STORE_AVATARS.filter(a => a.price === 0).map(a => a.id);

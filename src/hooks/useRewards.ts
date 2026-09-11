/**
 * Buying and equipping companion avatars.
 *
 * `RewardsView` did both in local state: `handleBuyAvatar` called
 * `onUpdateUser({ coins: user.coins - price, unlockedAvatars: [...] })`, which
 * reached `handleUpdateActiveUser` in `App` — a function that discards its
 * argument and re-reads from the server. So a child could press buy, watch the
 * fanfare, and find nothing had changed.
 *
 * The price is no longer sent. It is read from the catalogue server-side, so
 * what a learner pays is not what their browser believed.
 */

import { trpc } from '../lib/trpc';
import { STORE_AVATARS, type StoreAvatar } from '../data/avatars';

export interface RewardsState {
  /** The shop, from the server, so prices drawn match prices charged. */
  catalogue: StoreAvatar[];
  buyAvatar: (avatarId: string) => Promise<void>;
  equipAvatar: (avatarId: string) => Promise<void>;
  isBusy: boolean;
  /** Why the last purchase failed — not enough coins, usually. */
  error: string | null;
}

export function useRewards(learnerId: number | null): RewardsState {
  const utils = trpc.useUtils();
  const catalogue = trpc.curriculum.avatars.useQuery(undefined, { retry: false });

  const refresh = () => {
    // Coins and the owned list both moved, and both live on the learner summary.
    void utils.learners.list.invalidate();
    void utils.learners.snapshot.invalidate();
  };

  const buy = trpc.learners.buyAvatar.useMutation({ onSuccess: refresh });
  const equip = trpc.learners.setAvatar.useMutation({ onSuccess: refresh });

  return {
    // The bundled list is the fallback while the query is in flight. It is the
    // same file the server imports, so the two agree unless a deploy is
    // half-finished.
    catalogue: (catalogue.data as StoreAvatar[] | undefined) ?? STORE_AVATARS,
    buyAvatar: async (avatarId: string) => {
      if (learnerId === null) throw new Error('No learner selected.');
      await buy.mutateAsync({ learnerId, avatarId });
    },
    equipAvatar: async (avatarId: string) => {
      if (learnerId === null) throw new Error('No learner selected.');
      await equip.mutateAsync({ learnerId, avatarId });
    },
    isBusy: buy.isPending || equip.isPending,
    error: buy.error?.message ?? equip.error?.message ?? null,
  };
}

import confetti from 'canvas-confetti';

/**
 * Trigger celebratory confetti burst.
 */
export function fireConfettiBurst() {
  try {
    confetti({
      particleCount: 60,
      spread: 70,
      origin: { y: 0.65 },
      colors: ['#2a6df4', '#f59e0b', '#10b981', '#8b5cf6', '#ec4899']
    });
  } catch (err) {
    console.debug('Confetti not triggered:', err);
  }
}

/**
 * Trigger extra festive fireworks style confetti for milestones and level-ups.
 */
export function fireMilestoneConfetti() {
  try {
    const count = 200;
    const defaults = {
      origin: { y: 0.7 }
    };

    function fire(particleRatio: number, opts: confetti.Options) {
      confetti({
        ...defaults,
        ...opts,
        particleCount: Math.floor(count * particleRatio)
      });
    }

    fire(0.25, {
      spread: 26,
      startVelocity: 55,
      colors: ['#2a6df4', '#38bdf8']
    });
    fire(0.2, {
      spread: 60,
      colors: ['#f59e0b', '#fbbf24']
    });
    fire(0.35, {
      spread: 100,
      decay: 0.91,
      scalar: 0.8,
      colors: ['#10b981', '#8b5cf6']
    });
    fire(0.1, {
      spread: 120,
      startVelocity: 25,
      decay: 0.92,
      scalar: 1.2
    });
    fire(0.1, {
      spread: 120,
      startVelocity: 45
    });
  } catch (err) {
    console.debug('Milestone confetti error:', err);
  }
}

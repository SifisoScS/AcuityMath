// @vitest-environment node

/**
 * Sealing a credential that opens somebody else's building.
 *
 * The thing under test is not the arithmetic of AES — Node's crypto does that —
 * but the **refusals**: that a deployment without a key cannot store a secret at
 * all, that a tampered row fails rather than decodes, and that nothing here ever
 * quotes the plaintext back.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  CredentialKeyMissing,
  CredentialUnreadable,
  open,
  sameSecret,
  seal,
  sealingAvailable,
  sealingKey,
} from './credentials';

const KEY = Buffer.alloc(32, 7).toString('base64');
const OTHER_KEY = Buffer.alloc(32, 9).toString('base64');

describe('holding a district’s SIS secret', () => {
  let original: string | undefined;

  beforeEach(() => {
    original = process.env.ONEROSTER_CREDENTIAL_KEY;
    process.env.ONEROSTER_CREDENTIAL_KEY = KEY;
  });

  afterEach(() => {
    if (original === undefined) delete process.env.ONEROSTER_CREDENTIAL_KEY;
    else process.env.ONEROSTER_CREDENTIAL_KEY = original;
  });

  describe('failing closed', () => {
    it('refuses to store anything when no key is configured', () => {
      /*
       * **The decision this module exists for.** A deployment that cannot
       * protect a district's credential must not accept one. The alternative is
       * a plaintext SIS password in a table, which is silent until it is a
       * breach notification.
       */
      delete process.env.ONEROSTER_CREDENTIAL_KEY;
      expect(() => seal('sis-secret')).toThrow(CredentialKeyMissing);
    });

    it('says how to make one, because the next step is otherwise a search', () => {
      delete process.env.ONEROSTER_CREDENTIAL_KEY;
      expect(() => sealingKey()).toThrow(/openssl rand -base64 32/);
    });

    it('refuses a key of the wrong length rather than padding it', () => {
      // A short key silently truncated or padded is a key that looks configured
      // and is not, which is the worst of both states.
      process.env.ONEROSTER_CREDENTIAL_KEY = Buffer.alloc(16, 1).toString('base64');
      expect(() => seal('sis-secret')).toThrow(CredentialKeyMissing);
    });

    it('can be asked whether storing is possible, before somebody types a secret', () => {
      expect(sealingAvailable()).toBe(true);
      delete process.env.ONEROSTER_CREDENTIAL_KEY;
      expect(sealingAvailable()).toBe(false);
    });

    it('refuses an empty secret', () => {
      expect(() => seal('   ')).toThrow(CredentialUnreadable);
    });
  });

  describe('the round trip', () => {
    it('opens what it sealed', () => {
      expect(open(seal('sis-secret'))).toBe('sis-secret');
    });

    it('never stores the secret in the clear', () => {
      const sealed = seal('sis-secret');
      expect(sealed).not.toContain('sis-secret');
      expect(Buffer.from(sealed).toString('utf8')).not.toContain('sis-secret');
    });

    it('produces different ciphertext each time', () => {
      /*
       * A fresh IV per seal, which is **not optional** for GCM: reusing one
       * under the same key does not merely weaken the ciphertext, it exposes
       * the plaintext of both messages. Identical output here would be the
       * visible symptom of that mistake.
       */
      expect(seal('sis-secret')).not.toBe(seal('sis-secret'));
    });

    it('carries the authentication tag it was sealed with', () => {
      /*
       * **How the tag is proved load-bearing.** Skipping `setAuthTag` on the
       * way out is an *equivalent* mutation — Node refuses to finalise a GCM
       * decryption without one either way. Storing a constant tag is the
       * mutation that shows, because then nothing opens at all.
       */
      const sealed = seal('sis-secret');
      const [iv, , cipher] = sealed.split('.');
      const wrongTag = Buffer.alloc(16, 0).toString('base64');
      expect(() => open([iv, wrongTag, cipher].join('.'))).toThrow(CredentialUnreadable);
      expect(open(sealed)).toBe('sis-secret');
    });

    it('handles a secret with the separator in it', () => {
      // The stored form is `iv.tag.ciphertext`; a secret containing dots must
      // not be able to confuse the parse.
      expect(open(seal('a.b.c.d'))).toBe('a.b.c.d');
    });

    it('handles a long secret and one with awkward characters', () => {
      const awkward = `${'x'.repeat(400)}:+/=&? ${String.fromCodePoint(0x1f510)}`;
      expect(open(seal(awkward))).toBe(awkward);
    });
  });

  describe('when the row cannot be trusted', () => {
    it('refuses a tampered ciphertext rather than returning rubbish', () => {
      /*
       * What GCM's tag buys. Without authentication a flipped bit produces a
       * different secret, which is then sent to a district's SIS — a failed
       * login they investigate rather than a refusal we report.
       */
      const sealed = seal('sis-secret');
      const [iv, tag, cipher] = sealed.split('.');
      const flipped = Buffer.from(cipher, 'base64');
      flipped[0] ^= 0xff;
      expect(() => open([iv, tag, flipped.toString('base64')].join('.'))).toThrow(
        CredentialUnreadable,
      );
    });

    it('refuses when the key has changed', () => {
      const sealed = seal('sis-secret');
      process.env.ONEROSTER_CREDENTIAL_KEY = OTHER_KEY;
      expect(() => open(sealed)).toThrow(CredentialUnreadable);
    });

    it('answers both failures with the same actionable sentence', () => {
      /*
       * **Re-aimed after a mutation went silent.** The original name claimed
       * this module hid *which* failure occurred; it does not — Node reports
       * both identically, so that property was never ours to guard.
       *
       * What is ours: the crypto library's wording never reaches the reader.
       * "Unsupported state or unable to authenticate data" tells an
       * administrator nothing, and they are the person who can issue a new
       * secret from the SIS.
       */
      const sealed = seal('sis-secret');
      const [iv, tag, cipher] = sealed.split('.');
      const flipped = Buffer.from(cipher, 'base64');
      flipped[0] ^= 0xff;

      let tampered = '';
      try {
        open([iv, tag, flipped.toString('base64')].join('.'));
      } catch (error) {
        tampered = (error as Error).message;
      }

      process.env.ONEROSTER_CREDENTIAL_KEY = OTHER_KEY;
      let wrongKey = '';
      try {
        open(sealed);
      } catch (error) {
        wrongKey = (error as Error).message;
      }

      expect(tampered).toBe(wrongKey);
      expect(tampered).toMatch(/Re-enter the secret from your SIS/);
      expect(tampered).not.toMatch(/unable to authenticate|Unsupported state/i);
    });

    it('refuses a row that is not in the stored form', () => {
      expect(() => open('not-sealed-at-all')).toThrow(CredentialUnreadable);
    });

    it('never quotes the ciphertext in a refusal', () => {
      // A refusal travels to a log. The row should not travel with it.
      const sealed = seal('sis-secret');
      process.env.ONEROSTER_CREDENTIAL_KEY = OTHER_KEY;
      try {
        open(sealed);
        throw new Error('expected a refusal');
      } catch (error) {
        expect((error as Error).message).not.toContain(sealed.split('.')[2]);
      }
    });
  });

  describe('comparing two secrets', () => {
    it('matches an identical pair and rejects a different one', () => {
      expect(sameSecret('abcd', 'abcd')).toBe(true);
      expect(sameSecret('abcd', 'abce')).toBe(false);
    });

    it('rejects a different length without throwing', () => {
      // `timingSafeEqual` throws on a length mismatch, which would turn "they
      // rotated the secret" into a crash.
      expect(sameSecret('abcd', 'abcdefgh')).toBe(false);
    });
  });
});

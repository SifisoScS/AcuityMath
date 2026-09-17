/**
 * Holding somebody else's secret.
 *
 * LTI never required this. There we hold a private key, publish the public half
 * at our keyset URL, and a platform verifies what we signed — a database dump
 * would give an attacker rows that authorise nothing. OneRoster reverses it: a
 * district's SIS issues us a **shared secret** and expects it back on every
 * call. That credential opens a system holding far more about their pupils than
 * this product ever will — their addresses, their guardians, their attendance,
 * often their medical flags.
 *
 * So it is sealed before it is stored, and this module **fails closed** when
 * there is no key to seal it with. Refusing to accept a credential we cannot
 * protect is the whole design: an unset key is a deployment that cannot
 * onboard a district, which is loud, rather than one that stores their SIS
 * password in plaintext, which is silent until it is a breach notification.
 *
 * This is not a claim of at-rest encryption for the product as a whole — the
 * roadmap is straight about that gap and it stays open. It is the narrower
 * claim that **this** column is not readable from a dump of the database alone.
 */

import { createCipheriv, createDecipheriv, randomBytes, timingSafeEqual } from 'node:crypto';

/** AES-256-GCM: authenticated, so a tampered ciphertext fails rather than decodes. */
const ALGORITHM = 'aes-256-gcm';
const IV_BYTES = 12;
const KEY_BYTES = 32;

export class CredentialKeyMissing extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CredentialKeyMissing';
  }
}

export class CredentialUnreadable extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CredentialUnreadable';
  }
}

/**
 * The sealing key, or a refusal that says what to do.
 *
 * Follows `session.ts`'s rule about `JWT_SECRET` and for a sharper reason. A
 * key invented at startup would seal a district's credential into ciphertext
 * nothing could ever open again — every restart would silently break every
 * roster sync, and the rows would look intact.
 */
export function sealingKey(): Buffer {
  const configured = process.env.ONEROSTER_CREDENTIAL_KEY;
  if (!configured) {
    throw new CredentialKeyMissing(
      'ONEROSTER_CREDENTIAL_KEY must be set before a OneRoster credential can be stored. ' +
        'It seals the client secret a district issues us, which opens their student ' +
        'information system. Generate one with `openssl rand -base64 32`.',
    );
  }

  const key = Buffer.from(configured, 'base64');
  if (key.length !== KEY_BYTES) {
    throw new CredentialKeyMissing(
      `ONEROSTER_CREDENTIAL_KEY must decode to ${KEY_BYTES} bytes; this one is ${key.length}. ` +
        'Generate one with `openssl rand -base64 32`.',
    );
  }
  return key;
}

/** Whether a credential could be stored right now. For surfaces that ask first. */
export function sealingAvailable(): boolean {
  try {
    sealingKey();
    return true;
  } catch {
    return false;
  }
}

/**
 * Seals a secret for storage.
 *
 * A fresh IV every time, which is not optional for GCM: reusing one under the
 * same key does not merely weaken the ciphertext, it exposes the plaintexts of
 * both messages. Stored as `iv.tag.ciphertext` in base64 so the row carries
 * everything needed to open it except the key.
 */
export function seal(secret: string): string {
  if (secret.trim() === '') {
    throw new CredentialUnreadable('Refusing to store an empty client secret.');
  }

  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, sealingKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(secret, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();

  return [iv.toString('base64'), tag.toString('base64'), ciphertext.toString('base64')].join('.');
}

/**
 * Opens a sealed secret.
 *
 * Every failure is the same refusal with a different cause, and none of them
 * quotes the ciphertext. A wrong key, a truncated row and a tampered one all
 * mean "this credential cannot be used", and the administrator's next step is
 * the same in each case: issue a new one from the SIS.
 */
export function open(sealed: string): string {
  const parts = sealed.split('.');
  if (parts.length !== 3) {
    throw new CredentialUnreadable(
      'The stored credential is not in the expected form. Re-enter it from your SIS.',
    );
  }

  const [ivPart, tagPart, cipherPart] = parts;
  try {
    const decipher = createDecipheriv(ALGORITHM, sealingKey(), Buffer.from(ivPart, 'base64'));
    decipher.setAuthTag(Buffer.from(tagPart, 'base64'));
    const plain = Buffer.concat([
      decipher.update(Buffer.from(cipherPart, 'base64')),
      decipher.final(),
    ]);
    return plain.toString('utf8');
  } catch (error) {
    if (error instanceof CredentialKeyMissing) throw error;
    /*
     * `decipher.final()` throws when the tag does not match, which covers both
     * a tampered row and the wrong key — and Node gives the *same* message for
     * both, so not distinguishing them is not this module's doing. What is:
     * the crypto library's wording never reaches the reader. "Unsupported state
     * or unable to authenticate data" tells an administrator nothing they can
     * act on, and they are the person who can issue a new secret.
     */
    throw new CredentialUnreadable(
      'The stored credential could not be opened. Either the sealing key has changed or ' +
        'the row has been altered. Re-enter the secret from your SIS.',
    );
  }
}

/**
 * Whether two secrets match, without leaking which byte differed.
 *
 * Used when re-registering a provider, to tell "they typed the same secret
 * again" from "they rotated it" without a comparison whose duration answers the
 * question for anybody timing it.
 */
export function sameSecret(a: string, b: string): boolean {
  const left = Buffer.from(a, 'utf8');
  const right = Buffer.from(b, 'utf8');
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

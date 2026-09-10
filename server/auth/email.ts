/**
 * Sending the sign-in link.
 *
 * Two modes, and the difference between them is deliberate rather than
 * incidental.
 *
 * With SMTP configured, the link is emailed. Without it, in development, the
 * link is written to the server log and the response says so. What does *not*
 * happen is the third option: quietly succeeding without sending anything. A
 * sign-in flow that reports success and delivers nothing is indistinguishable
 * from a spam-filtered email, and the hour spent looking in the wrong place is
 * the reason this file says which mode it is in, every time.
 *
 * In production, missing SMTP is a hard failure. A deployment that cannot send
 * the only credential it issues is broken, and should say so at the first
 * request rather than to the first parent.
 */

import { createTransport, type Transporter } from 'nodemailer';

export type DeliveryMode = 'smtp' | 'logged';

export interface DeliveryResult {
  mode: DeliveryMode;
  /** Present only in `logged` mode, so a developer can click through. */
  link?: string;
}

let transporter: Transporter | null = null;

interface SmtpConfig {
  host: string;
  port: number;
  secure: boolean;
  user?: string;
  pass?: string;
  from: string;
}

function readSmtpConfig(): SmtpConfig | null {
  const host = process.env.SMTP_HOST;
  const from = process.env.EMAIL_FROM;
  if (!host || !from) return null;

  return {
    host,
    port: Number(process.env.SMTP_PORT ?? 587),
    // Implicit TLS on 465; STARTTLS on 587, which nodemailer negotiates when
    // `secure` is false. Getting this backwards produces a connection that
    // hangs rather than one that errors.
    secure: process.env.SMTP_SECURE === 'true',
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
    from,
  };
}

function getTransporter(config: SmtpConfig): Transporter {
  transporter ??= createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: config.user ? { user: config.user, pass: config.pass } : undefined,
  });
  return transporter;
}

/** Reset between tests, so one test's stub does not leak into the next. */
export function resetTransporter(): void {
  transporter = null;
}

export async function sendMagicLink(email: string, link: string): Promise<DeliveryResult> {
  const config = readSmtpConfig();

  if (!config) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error(
        'SMTP_HOST and EMAIL_FROM must be set in production. Sign-in is by emailed link, ' +
          'so a deployment without mail cannot sign anybody in.',
      );
    }

    console.log(
      `\n  [AcuityMath] No SMTP configured, so nothing was emailed.\n` +
        `  Sign-in link for ${email}:\n\n    ${link}\n`,
    );
    return { mode: 'logged', link };
  }

  await getTransporter(config).sendMail({
    from: config.from,
    to: email,
    subject: 'Your AcuityMath sign-in link',
    text: signInText(link),
    html: signInHtml(link),
  });

  return { mode: 'smtp' };
}

/**
 * Plain text first, and it says the same thing as the HTML.
 *
 * A parent reading this on a locked-down school mail client, or with images
 * off, gets the whole message. The fifteen-minute expiry is stated because a
 * link that has quietly gone stale is the most common reason a sign-in "does
 * not work".
 */
function signInText(link: string): string {
  return [
    'Sign in to AcuityMath',
    '',
    'Open this link to sign in. It works once and expires in 15 minutes:',
    '',
    link,
    '',
    'If you did not ask to sign in, you can ignore this email — nobody can use',
    'the link without opening it, and it will expire on its own.',
  ].join('\n');
}

function signInHtml(link: string): string {
  // Deliberately plain. Mail clients are a hostile rendering target, and the
  // one thing that must survive is the link.
  return `
    <div style="font-family: -apple-system, Segoe UI, sans-serif; font-size: 15px; color: #16211f;">
      <h1 style="font-size: 18px; margin: 0 0 12px;">Sign in to AcuityMath</h1>
      <p style="margin: 0 0 16px;">Open this link to sign in. It works once and expires in 15 minutes.</p>
      <p style="margin: 0 0 20px;">
        <a href="${link}" style="background: #4f46e5; color: #fff; padding: 10px 18px; border-radius: 8px; text-decoration: none; font-weight: 700;">Sign in</a>
      </p>
      <p style="margin: 0 0 8px; font-size: 13px; color: #4a5654;">Or paste this into your browser:</p>
      <p style="margin: 0 0 20px; font-size: 13px; word-break: break-all; color: #4a5654;">${link}</p>
      <p style="margin: 0; font-size: 13px; color: #77817f;">
        If you did not ask to sign in, you can ignore this email — nobody can use the link
        without opening it, and it will expire on its own.
      </p>
    </div>
  `;
}

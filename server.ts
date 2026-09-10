import { createExpressMiddleware } from '@trpc/server/adapters/express';
import 'dotenv/config';
import express from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';

import { apiRouter } from './server/api';
import { authRouter } from './server/auth/routes';
import { createContext } from './server/trpc';
import { appRouter } from './server/trpc/routers';

async function startServer() {
  const app = express();
  const PORT = 3000;

  // JSON Body Parsing
  app.use(express.json());

  /**
   * The typed API. Everything new goes here.
   *
   * `/api` below is the original REST surface over the JSON-file store. It is
   * still mounted because the client still calls it; it comes out when the
   * client is moved across, not before, so the app is never half-migrated at
   * runtime.
   */
  app.use(
    '/trpc',
    createExpressMiddleware({
      router: appRouter,
      createContext: ({ req, res }) =>
        createContext(
          { cookie: req.headers.cookie, authorization: req.headers.authorization },
          // Appended rather than replaced: a single response may set both the
          // elevation cookie and anything else a procedure needs.
          value => res.append('Set-Cookie', value),
        ),
      onError({ error, path: procedure }) {
        // A 500 from a procedure is a server fault worth seeing in the log; a
        // 401 or 404 is the authorization layer working and would only be noise.
        if (error.code === 'INTERNAL_SERVER_ERROR') {
          console.error(`[trpc] ${procedure ?? 'unknown'} failed:`, error.cause ?? error);
        }
      },
    }),
  );

  // Sign-in, before the legacy REST surface so `/api/auth/*` reaches it.
  app.use('/api/auth', authRouter);

  // API Routes FIRST before SPA / Vite middleware
  app.use('/api', apiRouter);

  // Vite middleware for development
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[AcuityMath] Server running on http://localhost:${PORT}`);
    reportConfiguration();
  });
}

/**
 * Says plainly what the server can and cannot do.
 *
 * Both of these are startup-time facts that otherwise surface as a confusing
 * runtime failure — a 500 on the first practice request, or a session that
 * belongs to nobody. Neither is fatal on its own: the front end and the legacy
 * `/api` surface still work without a database, and that is worth keeping while
 * the migration is in progress.
 */
function reportConfiguration() {
  if (!process.env.DATABASE_URL) {
    console.warn(
      '[AcuityMath] DATABASE_URL is not set. /trpc procedures will fail until it is. ' +
        'See .env.example for a local Docker one-liner.',
    );
  }

  if (!process.env.JWT_SECRET && !process.env.DEV_AUTH_EMAIL) {
    console.warn(
      '[AcuityMath] JWT_SECRET is not set. Sessions cannot be issued or verified, ' +
        'so sign-in will fail. Generate one with `openssl rand -base64 48`.',
    );
  }

  if (!process.env.SMTP_HOST && process.env.NODE_ENV !== 'production') {
    console.warn(
      '[AcuityMath] No SMTP configured. Sign-in links will be written to this log ' +
        'rather than emailed.',
    );
  }

  if (process.env.DEV_AUTH_EMAIL) {
    console.warn(
      `[AcuityMath] DEV_AUTH_EMAIL is set — every request is authenticated as ` +
        `${process.env.DEV_AUTH_EMAIL}. This bypasses sign-in entirely and is refused in production builds.`,
    );
  }
}

startServer().catch(err => {
  console.error('[Server] Fatal startup error:', err);
  process.exit(1);
});

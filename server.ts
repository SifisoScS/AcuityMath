import express from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { apiRouter } from './server/api';

async function startServer() {
  const app = express();
  const PORT = 3000;

  // JSON Body Parsing
  app.use(express.json());

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
    console.log(`[AcuityMath Phase 1] Server running on http://localhost:${PORT}`);
  });
}

startServer().catch(err => {
  console.error('[Server] Fatal startup error:', err);
  process.exit(1);
});

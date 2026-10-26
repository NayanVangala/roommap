import type { IncomingMessage } from 'node:http';
import { defineConfig, loadEnv, type Plugin } from 'vite';

/**
 * Dev-only API. The Gemini key stays on this server and never reaches the browser.
 *   GET  /api/status   -> { mode: 'mock' | 'argon' }
 *   POST /api/extract  -> ExtractResult (see server/extract.ts)
 */
function roommapApi(): Plugin {
  const MAX_BODY = 8_000_000;

  function readBody(req: IncomingMessage): Promise<string> {
    return new Promise((resolve, reject) => {
      let size = 0;
      const chunks: Buffer[] = [];
      req.on('data', (chunk: Buffer) => {
        size += chunk.length;
        if (size > MAX_BODY) {
          reject(new Error('Request too large.'));
          req.destroy();
          return;
        }
        chunks.push(chunk);
      });
      req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
      req.on('error', reject);
    });
  }

  return {
    name: 'roommap-api',
    configureServer(server) {
      const env = loadEnv(server.config.mode, process.cwd(), '');
      const apiKey = env.GEMINI_API_KEY?.trim() || undefined;
      const model = env.GEMINI_MODEL?.trim() || 'gemini-4-argon';

      server.middlewares.use('/api/status', (_req, res) => {
        res.setHeader('content-type', 'application/json');
        res.end(JSON.stringify({ mode: apiKey ? 'argon' : 'mock' }));
      });

      server.middlewares.use('/api/extract', async (req, res) => {
        res.setHeader('content-type', 'application/json');
        if (req.method !== 'POST') {
          res.statusCode = 405;
          res.end(JSON.stringify({ ok: false, error: 'Use POST.' }));
          return;
        }
        try {
          const body = JSON.parse(await readBody(req)) as { notes?: unknown; image?: { mimeType?: unknown; data?: unknown } };
          if (typeof body.notes !== 'string') throw new Error('notes must be a string.');
          const image =
            body.image && typeof body.image.mimeType === 'string' && typeof body.image.data === 'string'
              ? { mimeType: body.image.mimeType, data: body.image.data }
              : undefined;
          const { extractEvent } = (await server.ssrLoadModule('/server/extract.ts')) as typeof import('./server/extract');
          const result = await extractEvent({ notes: body.notes, image, apiKey, model });
          res.end(JSON.stringify(result));
        } catch (error) {
          res.statusCode = 400;
          res.end(JSON.stringify({ ok: false, mode: apiKey ? 'argon' : 'mock', rounds: [], error: error instanceof Error ? error.message : 'Bad request.' }));
        }
      });
    },
  };
}

export default defineConfig({
  plugins: [roommapApi()],
  server: { port: 5173 },
});

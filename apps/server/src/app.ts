import cookie from '@fastify/cookie';
import rateLimit from '@fastify/rate-limit';
import Fastify, { type FastifyInstance } from 'fastify';
import { ZodError } from 'zod';
import { AuthError } from './auth/service.ts';
import type { Config } from './config.ts';
import type { Pool } from './db/pool.ts';
import { authRoutes } from './routes/auth.ts';

export interface AppOptions {
  config: Config;
  pool: Pool;
  /** Disable in tests that hammer the auth endpoints. */
  rateLimit?: boolean;
  logger?: boolean;
}

export async function buildApp(opts: AppOptions): Promise<FastifyInstance> {
  const { config, pool } = opts;
  const app = Fastify({
    logger: opts.logger ?? config.nodeEnv !== 'test',
    // Behind Caddy in production so req.ip is the real client.
    trustProxy: config.nodeEnv === 'production',
    bodyLimit: 64 * 1024,
  });

  await app.register(cookie);
  if (opts.rateLimit ?? true) {
    await app.register(rateLimit, { global: false });
  }

  // CSRF defence in depth on top of SameSite=Lax: state-changing requests must come from our origin.
  app.addHook('onRequest', async (req, reply) => {
    if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') return;
    const origin = req.headers.origin;
    if (origin && config.allowedOrigin && origin !== config.allowedOrigin) {
      return reply.code(403).send({ error: 'forbidden_origin' });
    }
  });

  app.setErrorHandler((err, _req, reply) => {
    if (err instanceof AuthError) {
      return reply.code(err.status).send({ error: err.code, message: err.message });
    }
    if (err instanceof ZodError) {
      return reply.code(400).send({ error: 'invalid_input', issues: err.issues });
    }
    const status = (err as { statusCode?: number }).statusCode;
    if (status && status < 500) {
      return reply.code(status).send({ error: 'bad_request', message: (err as Error).message });
    }
    app.log.error(err);
    return reply.code(500).send({ error: 'internal_error' });
  });

  app.get('/health', async () => {
    await pool.query('SELECT 1');
    return { ok: true };
  });

  await app.register(authRoutes, { config, pool });
  return app;
}

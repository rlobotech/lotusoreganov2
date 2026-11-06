import { loginSchema, registerSchema } from '@game/shared';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import {
  createSession,
  deleteSession,
  getSessionUser,
  loginUser,
  registerUser,
} from '../auth/service.ts';
import type { Config } from '../config.ts';
import type { Pool } from '../db/pool.ts';

export const SESSION_COOKIE = 'sid';

interface Deps {
  config: Config;
  pool: Pool;
}

const authLimit = { rateLimit: { max: 10, timeWindow: '1 minute' } };

export async function authRoutes(app: FastifyInstance, { config, pool }: Deps): Promise<void> {
  const ctxOf = (req: FastifyRequest) => ({ ip: req.ip, userAgent: req.headers['user-agent'] });

  async function startSession(req: FastifyRequest, reply: FastifyReply, userId: string) {
    const { token, expiresAt } = await createSession(
      pool,
      userId,
      req.headers['user-agent'],
      config.sessionTtlDays,
    );
    reply.setCookie(SESSION_COOKIE, token, {
      httpOnly: true,
      secure: config.cookieSecure,
      sameSite: 'lax',
      path: '/',
      expires: expiresAt,
    });
  }

  app.post('/auth/register', { config: authLimit }, async (req, reply) => {
    const input = registerSchema.parse(req.body);
    const user = await registerUser(pool, input, ctxOf(req));
    await startSession(req, reply, user.id);
    return reply.code(201).send({ user });
  });

  app.post('/auth/login', { config: authLimit }, async (req, reply) => {
    const input = loginSchema.parse(req.body);
    const user = await loginUser(pool, input, ctxOf(req));
    await startSession(req, reply, user.id);
    return { user };
  });

  app.post('/auth/logout', async (req, reply) => {
    const token = req.cookies[SESSION_COOKIE];
    if (token) await deleteSession(pool, token);
    reply.clearCookie(SESSION_COOKIE, { path: '/' });
    return { ok: true };
  });

  app.get('/auth/me', async (req, reply) => {
    const token = req.cookies[SESSION_COOKIE];
    const user = token ? await getSessionUser(pool, token) : null;
    if (!user) return reply.code(401).send({ error: 'unauthenticated' });
    return { user };
  });
}

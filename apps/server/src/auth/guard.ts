import type { PublicUser } from '@game/shared';
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { Pool } from '../db/pool.ts';
import { SESSION_COOKIE } from '../routes/auth.ts';
import { getSessionUser } from './service.ts';

declare module 'fastify' {
  interface FastifyRequest {
    user?: PublicUser;
  }
}

/** preHandler that requires a valid session and exposes the user as `req.user`. */
export function authenticate(pool: Pool) {
  return async (req: FastifyRequest, reply: FastifyReply) => {
    const token = req.cookies[SESSION_COOKIE];
    const user = token ? await getSessionUser(pool, token) : null;
    if (!user) return reply.code(401).send({ error: 'unauthenticated' });
    req.user = user;
  };
}

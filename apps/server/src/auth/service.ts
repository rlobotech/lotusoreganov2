import type { LoginInput, PublicUser, RegisterInput } from '@game/shared';
import type { Pool } from '../db/pool.ts';
import {
  getDummyHash,
  hashPassword,
  hashToken,
  newSessionToken,
  verifyPassword,
} from './crypto.ts';

export class AuthError extends Error {
  readonly status: number;
  readonly code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

interface UserRow {
  id: string;
  email: string;
  username: string;
  email_verified_at: Date | null;
}

function toPublic(row: UserRow): PublicUser {
  return {
    id: row.id,
    username: row.username,
    email: row.email,
    emailVerified: row.email_verified_at !== null,
  };
}

export interface RequestContext {
  ip: string | undefined;
  userAgent: string | undefined;
}

async function logEvent(
  pool: Pool,
  userId: string | null,
  kind: string,
  ctx: RequestContext,
): Promise<void> {
  await pool.query('INSERT INTO auth_events (user_id, kind, ip, user_agent) VALUES ($1,$2,$3,$4)', [
    userId,
    kind,
    ctx.ip ?? null,
    ctx.userAgent?.slice(0, 300) ?? null,
  ]);
}

export async function registerUser(
  pool: Pool,
  input: RegisterInput,
  ctx: RequestContext,
): Promise<PublicUser> {
  const passwordHash = await hashPassword(input.password);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // Atomically consume one use of the invite (race-safe).
    const invite = await client.query(
      `UPDATE invite_codes SET uses_left = uses_left - 1
       WHERE code = $1 AND uses_left > 0 AND (expires_at IS NULL OR expires_at > now())
       RETURNING code`,
      [input.inviteCode],
    );
    if (invite.rowCount === 0) {
      throw new AuthError(400, 'invalid_invite', 'Invite code is invalid, used up or expired');
    }
    let row: UserRow;
    try {
      const res = await client.query<UserRow>(
        `INSERT INTO users (email, username, password_hash) VALUES ($1,$2,$3)
         RETURNING id, email, username, email_verified_at`,
        [input.email, input.username, passwordHash],
      );
      row = res.rows[0]!;
    } catch (err) {
      if ((err as { code?: string }).code === '23505') {
        throw new AuthError(409, 'taken', 'Email or username is already in use');
      }
      throw err;
    }
    await client.query('INSERT INTO invite_redemptions (code, user_id) VALUES ($1,$2)', [
      input.inviteCode,
      row.id,
    ]);
    await client.query('COMMIT');
    await logEvent(pool, row.id, 'register', ctx);
    return toPublic(row);
  } catch (err) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw err;
  } finally {
    client.release();
  }
}

export async function loginUser(
  pool: Pool,
  input: LoginInput,
  ctx: RequestContext,
): Promise<PublicUser> {
  const res = await pool.query<UserRow & { password_hash: string }>(
    `SELECT id, email, username, email_verified_at, password_hash
     FROM users WHERE lower(email) = $1`,
    [input.email],
  );
  const row = res.rows[0];
  const ok = await verifyPassword(row?.password_hash ?? (await getDummyHash()), input.password);
  if (!row || !ok) {
    await logEvent(pool, row?.id ?? null, 'login_failed', ctx);
    throw new AuthError(401, 'bad_credentials', 'Wrong email or password');
  }
  await logEvent(pool, row.id, 'login', ctx);
  return toPublic(row);
}

export async function createSession(
  pool: Pool,
  userId: string,
  userAgent: string | undefined,
  ttlDays: number,
): Promise<{ token: string; expiresAt: Date }> {
  const { token, tokenHash } = newSessionToken();
  const expiresAt = new Date(Date.now() + ttlDays * 24 * 60 * 60 * 1000);
  await pool.query(
    'INSERT INTO sessions (user_id, token_hash, user_agent, expires_at) VALUES ($1,$2,$3,$4)',
    [userId, tokenHash, userAgent?.slice(0, 300) ?? null, expiresAt],
  );
  return { token, expiresAt };
}

export async function getSessionUser(pool: Pool, token: string): Promise<PublicUser | null> {
  const res = await pool.query<UserRow>(
    `UPDATE sessions s SET last_used_at = now()
     FROM users u
     WHERE s.token_hash = $1 AND s.expires_at > now() AND u.id = s.user_id
     RETURNING u.id, u.email, u.username, u.email_verified_at`,
    [hashToken(token)],
  );
  const row = res.rows[0];
  return row ? toPublic(row) : null;
}

export async function deleteSession(pool: Pool, token: string): Promise<void> {
  await pool.query('DELETE FROM sessions WHERE token_hash = $1', [hashToken(token)]);
}

/** Housekeeping: remove expired sessions. Safe to call periodically. */
export async function purgeExpiredSessions(pool: Pool): Promise<number> {
  const res = await pool.query('DELETE FROM sessions WHERE expires_at <= now()');
  return res.rowCount ?? 0;
}

import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.ts';
import { loadConfig } from '../src/config.ts';
import { createPool, type Pool } from '../src/db/pool.ts';

const DATABASE_URL = process.env.TEST_DATABASE_URL!;

let pool: Pool;
let app: FastifyInstance;

const user = {
  email: 'Hero@Example.com',
  username: 'Hero_One',
  password: 'correct horse battery',
  inviteCode: 'BETA-1',
};

async function seedInvite(code = 'BETA-1', uses = 1, expiresSql = 'NULL') {
  await pool.query(
    `INSERT INTO invite_codes (code, uses_left, expires_at) VALUES ($1,$2,${expiresSql})`,
    [code, uses],
  );
}

function cookieOf(res: { headers: Record<string, unknown> }): string {
  const raw = res.headers['set-cookie'];
  const first = Array.isArray(raw) ? raw[0] : raw;
  return String(first).split(';')[0]!;
}

beforeAll(async () => {
  pool = createPool(DATABASE_URL);
  const config = loadConfig({
    NODE_ENV: 'test',
    DATABASE_URL,
    ALLOWED_ORIGIN: 'http://localhost:5173',
  } as NodeJS.ProcessEnv);
  app = await buildApp({ config, pool, rateLimit: false });
});

afterAll(async () => {
  await app.close();
  await pool.end();
});

beforeEach(async () => {
  await pool.query('TRUNCATE users, invite_codes, auth_events RESTART IDENTITY CASCADE');
});

describe('register', () => {
  it('creates an account with a valid invite and logs the user in', async () => {
    await seedInvite();
    const res = await app.inject({ method: 'POST', url: '/auth/register', payload: user });
    expect(res.statusCode).toBe(201);
    expect(res.json().user).toMatchObject({ username: 'Hero_One', email: 'hero@example.com' });
    const cookie = cookieOf(res);
    expect(res.headers['set-cookie']).toContain('HttpOnly');

    const me = await app.inject({ method: 'GET', url: '/auth/me', headers: { cookie } });
    expect(me.statusCode).toBe(200);
    expect(me.json().user.username).toBe('Hero_One');
  });

  it('stores an argon2id hash, never the password', async () => {
    await seedInvite();
    await app.inject({ method: 'POST', url: '/auth/register', payload: user });
    const { rows } = await pool.query('SELECT password_hash FROM users');
    expect(rows[0].password_hash).toMatch(/^\$argon2id\$/);
    expect(rows[0].password_hash).not.toContain(user.password);
  });

  it('rejects unknown, used-up and expired invites', async () => {
    const unknown = await app.inject({ method: 'POST', url: '/auth/register', payload: user });
    expect(unknown.json().error).toBe('invalid_invite');

    await seedInvite('USED', 0);
    const used = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: { ...user, inviteCode: 'USED' },
    });
    expect(used.statusCode).toBe(400);

    await seedInvite('OLD', 5, "now() - interval '1 day'");
    const expired = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: { ...user, inviteCode: 'OLD' },
    });
    expect(expired.statusCode).toBe(400);
  });

  it('single-use invite works once; a failed signup does not consume it', async () => {
    await seedInvite('ONCE', 1);
    const taken = { ...user, inviteCode: 'ONCE' };
    expect(
      (await app.inject({ method: 'POST', url: '/auth/register', payload: taken })).statusCode,
    ).toBe(201);
    const second = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: { ...taken, email: 'other@example.com', username: 'Other' },
    });
    expect(second.json().error).toBe('invalid_invite');

    await seedInvite('TWICE', 2);
    // duplicate email fails and must give the use back
    await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: { ...taken, inviteCode: 'TWICE', username: 'Dupe' },
    });
    const { rows } = await pool.query("SELECT uses_left FROM invite_codes WHERE code = 'TWICE'");
    expect(rows[0].uses_left).toBe(2);
  });

  it('rejects duplicate email and username case-insensitively', async () => {
    await seedInvite('INVITE-A', 5);
    const first = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: { ...user, inviteCode: 'INVITE-A' },
    });
    expect(first.statusCode).toBe(201);
    const dupEmail = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: { ...user, inviteCode: 'INVITE-A', email: 'HERO@example.com', username: 'New' },
    });
    expect(dupEmail.statusCode).toBe(409);
    const dupName = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: { ...user, inviteCode: 'INVITE-A', email: 'new@example.com', username: 'hero_one' },
    });
    expect(dupName.statusCode).toBe(409);
  });

  it('validates input', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/auth/register',
      payload: { email: 'nope', username: 'x', password: 'short', inviteCode: '' },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe('invalid_input');
  });
});

describe('login / logout', () => {
  beforeEach(async () => {
    await seedInvite();
    await app.inject({ method: 'POST', url: '/auth/register', payload: user });
  });

  it('logs in with correct credentials (email case-insensitive)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: 'HERO@EXAMPLE.COM', password: user.password },
    });
    expect(res.statusCode).toBe(200);
    const me = await app.inject({
      method: 'GET',
      url: '/auth/me',
      headers: { cookie: cookieOf(res) },
    });
    expect(me.statusCode).toBe(200);
  });

  it('gives the same error for wrong password and unknown email', async () => {
    const wrong = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: user.email, password: 'wrong password!!' },
    });
    const unknown = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: 'nobody@example.com', password: 'wrong password!!' },
    });
    expect(wrong.statusCode).toBe(401);
    expect(unknown.statusCode).toBe(401);
    expect(wrong.json()).toEqual(unknown.json());
  });

  it('logout invalidates the session', async () => {
    const login = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: user.email, password: user.password },
    });
    const cookie = cookieOf(login);
    await app.inject({ method: 'POST', url: '/auth/logout', headers: { cookie } });
    const me = await app.inject({ method: 'GET', url: '/auth/me', headers: { cookie } });
    expect(me.statusCode).toBe(401);
  });

  it('rejects expired sessions', async () => {
    const login = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: user.email, password: user.password },
    });
    await pool.query("UPDATE sessions SET expires_at = now() - interval '1 minute'");
    const me = await app.inject({
      method: 'GET',
      url: '/auth/me',
      headers: { cookie: cookieOf(login) },
    });
    expect(me.statusCode).toBe(401);
  });

  it('records login events', async () => {
    await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: user.email, password: 'wrong password!!' },
    });
    const { rows } = await pool.query('SELECT kind FROM auth_events ORDER BY id');
    expect(rows.map((r) => r.kind)).toEqual(['register', 'login_failed']);
  });
});

describe('security', () => {
  it('blocks state-changing requests from a foreign origin', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/auth/logout',
      headers: { origin: 'https://evil.example' },
    });
    expect(res.statusCode).toBe(403);
  });

  it('GET /auth/me without a cookie is 401', async () => {
    const res = await app.inject({ method: 'GET', url: '/auth/me' });
    expect(res.statusCode).toBe(401);
  });
});

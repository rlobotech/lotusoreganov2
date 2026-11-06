import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  DATABASE_URL: z.string().min(1),
  ALLOWED_ORIGIN: z.string().optional(),
  SESSION_TTL_DAYS: z.coerce.number().int().min(1).max(365).default(30),
  TIME_SCALE: z.coerce.number().min(1).default(1),
});

export interface Config {
  nodeEnv: 'development' | 'test' | 'production';
  port: number;
  databaseUrl: string;
  allowedOrigin: string | undefined;
  sessionTtlDays: number;
  /** Dev only: divides activity durations. Always 1 in production. */
  timeScale: number;
  cookieSecure: boolean;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const e = envSchema.parse(env);
  if (e.NODE_ENV === 'production' && e.TIME_SCALE !== 1) {
    throw new Error('TIME_SCALE must be 1 in production');
  }
  if (e.NODE_ENV === 'production' && !e.ALLOWED_ORIGIN) {
    throw new Error('ALLOWED_ORIGIN is required in production');
  }
  return {
    nodeEnv: e.NODE_ENV,
    port: e.PORT,
    databaseUrl: e.DATABASE_URL,
    allowedOrigin: e.ALLOWED_ORIGIN,
    sessionTtlDays: e.SESSION_TTL_DAYS,
    timeScale: e.TIME_SCALE,
    cookieSecure: e.NODE_ENV === 'production',
  };
}

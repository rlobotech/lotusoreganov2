import { z } from 'zod';

export const USERNAME_MIN = 3;
export const USERNAME_MAX = 20;
export const PASSWORD_MIN = 10;
export const PASSWORD_MAX = 128;

export const emailSchema = z
  .email()
  .max(254)
  .transform((v) => v.trim().toLowerCase());

export const usernameSchema = z
  .string()
  .min(USERNAME_MIN)
  .max(USERNAME_MAX)
  .regex(/^[A-Za-z0-9_]+$/, 'letters, numbers and underscore only');

export const passwordSchema = z.string().min(PASSWORD_MIN).max(PASSWORD_MAX);

export const inviteCodeSchema = z.string().trim().min(4).max(64);

export const registerSchema = z.object({
  email: emailSchema,
  username: usernameSchema,
  password: passwordSchema,
  inviteCode: inviteCodeSchema,
});
export type RegisterInput = z.infer<typeof registerSchema>;

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1).max(PASSWORD_MAX),
});
export type LoginInput = z.infer<typeof loginSchema>;

export interface PublicUser {
  id: string;
  username: string;
  email: string;
  emailVerified: boolean;
}

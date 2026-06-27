import crypto from 'node:crypto';
import jwt, { SignOptions } from 'jsonwebtoken';
import { env } from '../config/env';
import { prisma } from '../lib/prisma';

export interface AccessTokenPayload {
  sub: string; // userId
  email: string;
}

export function signAccessToken(payload: AccessTokenPayload): string {
  return jwt.sign(payload, env.jwt.accessSecret, {
    expiresIn: env.jwt.accessTtl,
  } as SignOptions);
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  return jwt.verify(token, env.jwt.accessSecret) as AccessTokenPayload;
}

interface RefreshTokenPayload {
  sub: string;
  jti: string;
}

function sha256(value: string): string {
  return crypto.createHash('sha256').update(value).digest('hex');
}

/** Create a refresh token, persisting only its hash. Returns the raw JWT. */
export async function issueRefreshToken(userId: string): Promise<string> {
  const jti = crypto.randomUUID();
  const token = jwt.sign({ sub: userId, jti } as RefreshTokenPayload, env.jwt.refreshSecret, {
    expiresIn: env.jwt.refreshTtl,
  } as SignOptions);

  const decoded = jwt.decode(token) as { exp: number };
  await prisma.refreshToken.create({
    data: {
      userId,
      tokenHash: sha256(token),
      expiresAt: new Date(decoded.exp * 1000),
    },
  });
  return token;
}

/** Validate a refresh token (signature + not revoked + exists). Returns userId. */
export async function consumeRefreshToken(token: string): Promise<string> {
  const payload = jwt.verify(token, env.jwt.refreshSecret) as RefreshTokenPayload;
  const stored = await prisma.refreshToken.findUnique({ where: { tokenHash: sha256(token) } });
  if (!stored || stored.revokedAt || stored.expiresAt < new Date()) {
    throw new Error('Refresh token invalid or expired');
  }
  return payload.sub;
}

/** Rotate: revoke the old token and issue a new one. */
export async function rotateRefreshToken(oldToken: string): Promise<{ userId: string; token: string }> {
  const userId = await consumeRefreshToken(oldToken);
  await prisma.refreshToken.update({
    where: { tokenHash: sha256(oldToken) },
    data: { revokedAt: new Date() },
  });
  const token = await issueRefreshToken(userId);
  return { userId, token };
}

export async function revokeRefreshToken(token: string): Promise<void> {
  await prisma.refreshToken
    .update({ where: { tokenHash: sha256(token) }, data: { revokedAt: new Date() } })
    .catch(() => undefined);
}

export async function revokeAllUserTokens(userId: string): Promise<void> {
  await prisma.refreshToken.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

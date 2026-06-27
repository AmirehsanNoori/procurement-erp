import { NextFunction, Request, Response } from 'express';
import { ApiError } from '../lib/http';
import { verifyAccessToken } from '../auth/tokens';
import { prisma } from '../lib/prisma';

/** Verify the Bearer access token and attach req.auth. */
export async function requireAuth(req: Request, _res: Response, next: NextFunction) {
  try {
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) throw ApiError.unauthorized();
    const token = header.slice('Bearer '.length);

    const payload = verifyAccessToken(token);
    const user = await prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user || !user.isActive) throw ApiError.unauthorized('کاربر غیرفعال است');

    req.auth = { userId: user.id, email: user.email, isSuperAdmin: user.isSuperAdmin };
    next();
  } catch (err) {
    if (err instanceof ApiError) return next(err);
    next(ApiError.unauthorized('توکن نامعتبر یا منقضی شده است'));
  }
}

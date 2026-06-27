import { NextFunction, Request, Response } from 'express';
import { Prisma } from '@prisma/client';
import { ApiError } from '../lib/http';
import { env } from '../config/env';

export function notFoundHandler(_req: Request, res: Response) {
  res.status(404).json({ error: 'مسیر یافت نشد' });
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof ApiError) {
    return res.status(err.status).json({ error: err.message, details: err.details });
  }

  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === 'P2002') {
      return res.status(409).json({ error: 'رکورد تکراری است (مقدار یکتا نقض شد)' });
    }
    if (err.code === 'P2025') {
      return res.status(404).json({ error: 'رکورد یافت نشد' });
    }
    return res.status(400).json({ error: 'خطای پایگاه داده', code: err.code });
  }

  if (!env.isProd) {
    // eslint-disable-next-line no-console
    console.error(err);
  }
  const message = err instanceof Error ? err.message : 'خطای داخلی سرور';
  res.status(500).json({ error: env.isProd ? 'خطای داخلی سرور' : message });
}

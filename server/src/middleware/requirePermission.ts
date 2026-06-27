import { NextFunction, Request, Response } from 'express';
import { ApiError } from '../lib/http';

/**
 * Backend permission enforcement (spec §4: "Hiding UI alone is not enough").
 * Requires req.tenant (so it must run after requireTenant). Accepts one or more
 * permission keys; the user must hold ALL of them.
 */
export function requirePermission(...keys: string[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.tenant) return next(ApiError.forbidden());
    const granted = new Set(req.tenant.permissions);
    const missing = keys.filter((k) => !granted.has(k));
    if (missing.length > 0) {
      return next(ApiError.forbidden(`دسترسی لازم را ندارید: ${missing.join(', ')}`));
    }
    next();
  };
}

/** Variant requiring ANY one of the listed permissions. */
export function requireAnyPermission(...keys: string[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.tenant) return next(ApiError.forbidden());
    const granted = new Set(req.tenant.permissions);
    if (!keys.some((k) => granted.has(k))) {
      return next(ApiError.forbidden('دسترسی لازم را ندارید'));
    }
    next();
  };
}

/** Account-level guard for global (non-tenant) admin endpoints. */
export function requireSuperAdmin(req: Request, _res: Response, next: NextFunction) {
  if (!req.auth?.isSuperAdmin) return next(ApiError.forbidden('فقط مدیر سیستم'));
  next();
}

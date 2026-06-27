import { NextFunction, Request, Response } from 'express';
import { ApiError } from '../lib/http';
import { resolveTenantAccess } from '../rbac/access';

/**
 * Tenant isolation gate. Reads :tenantId from the route params, verifies the
 * authenticated user actually has access, and attaches req.tenant (with the
 * effective permission set). Every tenant-scoped route MUST sit behind this so
 * a user can never touch another tenant's data.
 */
export async function requireTenant(req: Request, _res: Response, next: NextFunction) {
  if (!req.auth) return next(ApiError.unauthorized());

  const tenantId = req.params.tenantId;
  if (!tenantId) return next(ApiError.badRequest('شناسه مستأجر (tenant) لازم است'));

  const access = await resolveTenantAccess(req.auth.userId, tenantId);
  if (!access) {
    // Do not leak whether the tenant exists — treat as forbidden.
    return next(ApiError.forbidden('به این مستأجر دسترسی ندارید'));
  }

  req.tenant = access;
  next();
}

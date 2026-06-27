import { Request } from 'express';
import { prisma } from './prisma';

interface AuditInput {
  action: string;
  userId?: string | null;
  tenantId?: string | null;
  entityType?: string;
  entityId?: string;
  metadata?: Record<string, unknown>;
  ip?: string;
}

/** Best-effort audit logging for sensitive actions (never throws). */
export async function writeAudit(input: AuditInput): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        action: input.action,
        userId: input.userId ?? null,
        tenantId: input.tenantId ?? null,
        entityType: input.entityType,
        entityId: input.entityId,
        metadata: input.metadata as never,
        ip: input.ip,
      },
    });
  } catch {
    // Swallow — auditing must never break the request flow.
  }
}

export function clientIp(req: Request): string | undefined {
  const fwd = req.headers['x-forwarded-for'];
  if (typeof fwd === 'string') return fwd.split(',')[0].trim();
  return req.socket.remoteAddress ?? undefined;
}

/**
 * Cross-cutting platform services owned by Core and consumed by every module:
 * audit, notifications, documents/files, and the activity timeline. All are
 * polymorphic (keyed by SoftRef) so they work for any module without change
 * (ADR-0006).
 */
import type { SoftRef, TenantId, UserId, Paginated } from './primitives.ts';

// ── Audit ──────────────────────────────────────────────────────────────────
export interface AuditEntryInput {
  tenantId: TenantId | null;
  actor: UserId | 'system' | null;
  action: string; // "<module>.<verb>", e.g. "finance.payment.approved"
  subject?: SoftRef;
  meta?: Record<string, unknown>;
  ip?: string;
}
export interface AuditService {
  /** Best-effort; never throws into the caller's transaction. */
  record(entry: AuditEntryInput): Promise<void>;
}

// ── Notifications ────────────────────────────────────────────────────────────
export type NotificationLevel = 'info' | 'important' | 'critical';
export interface NotificationInput {
  tenantId: TenantId;
  /** Target users; empty = tenant-wide/broadcast per module rules. */
  userIds?: UserId[];
  level: NotificationLevel;
  type: string; // "<module>.<kind>"
  title: string;
  body?: string;
  subject?: SoftRef;
  /** Deep link the client can navigate to. */
  link?: string;
}
export interface NotificationService {
  notify(input: NotificationInput): Promise<void>;
}

// ── Documents / files ────────────────────────────────────────────────────────
export interface StoredDocument {
  id: string;
  tenantId: TenantId;
  subject: SoftRef;
  name: string;
  contentType: string;
  size: number;
  category?: string;
  uploadedBy: UserId | null;
  createdAt: string;
}
export interface DocumentService {
  attach(input: {
    tenantId: TenantId;
    subject: SoftRef;
    name: string;
    contentType: string;
    bytes: Uint8Array;
    category?: string;
    uploadedBy: UserId | null;
  }): Promise<StoredDocument>;
  list(subject: SoftRef): Promise<StoredDocument[]>;
  /** Returns a (possibly signed/expiring) URL or stream handle. */
  getDownload(id: string): Promise<{ url?: string; bytes?: Uint8Array }>;
  remove(id: string): Promise<void>;
}

/**
 * Storage backend abstraction the DocumentService is built on. Swappable
 * (local disk / Supabase Storage / S3 / MinIO) so hosting is a config detail
 * (ADR-0012).
 */
export interface StorageProvider {
  put(key: string, bytes: Uint8Array, contentType: string): Promise<void>;
  get(key: string): Promise<Uint8Array>;
  signUrl(key: string, ttlSeconds: number): Promise<string | null>;
  delete(key: string): Promise<void>;
}

// ── Timeline (activity feed) ─────────────────────────────────────────────────
export interface TimelineEntryInput {
  tenantId: TenantId;
  subject: SoftRef;
  event: string;
  note?: string;
  actor: UserId | 'system' | null;
  at?: string;
}
export interface TimelineService {
  add(entry: TimelineEntryInput): Promise<void>;
  list(subject: SoftRef, page?: number): Promise<Paginated<TimelineEntryInput>>;
}

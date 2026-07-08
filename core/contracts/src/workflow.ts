/**
 * Workflow & Approval engine contracts. These are CORE capabilities so every
 * module (procurement approvals, finance payment approvals, contract sign-off,
 * HR leave requests…) uses one engine instead of re-implementing approvals.
 * Modules attach a workflow to any of their entities via a SoftRef (ADR-0005).
 */
import type { SoftRef, TenantId, UserId } from './primitives';

export type StepMode = 'all' | 'any' | 'quorum';

export interface WorkflowStep {
  key: string;
  title: string;
  /** How approvers on this step combine to pass it. */
  mode: StepMode;
  /** Quorum count when mode = "quorum". */
  quorum?: number;
  /** Who may act on this step, expressed as permission keys and/or role names.
   *  Resolution to concrete users is Core's job. */
  approverPermissions?: readonly string[];
  approverRoles?: readonly string[];
}

/** A reusable workflow definition, owned by Core, referenced by module + entityType. */
export interface WorkflowDefinition {
  key: string;
  tenantId: TenantId;
  /** Which module entity type this workflow governs, e.g. "finance:payment_request". */
  appliesTo: string;
  steps: readonly WorkflowStep[];
}

export type ApprovalDecision = 'approved' | 'rejected' | 'returned';
export type ApprovalStatus = 'pending' | 'approved' | 'rejected' | 'cancelled';

export interface ApprovalInstance {
  id: string;
  tenantId: TenantId;
  workflowKey: string;
  subject: SoftRef;
  status: ApprovalStatus;
  currentStepKey: string | null;
  createdAt: string;
}

export interface ApprovalVoteInput {
  instanceId: string;
  stepKey: string;
  decision: ApprovalDecision;
  comment?: string;
}

/** The Approval engine surface modules call. */
export interface ApprovalEngine {
  /** Start an approval for a module entity; returns the running instance. */
  start(input: {
    tenantId: TenantId;
    workflowKey: string;
    subject: SoftRef;
    startedBy: UserId;
  }): Promise<ApprovalInstance>;
  /** Record a vote; the engine advances/completes the instance and emits events. */
  vote(input: ApprovalVoteInput & { userId: UserId }): Promise<ApprovalInstance>;
  get(instanceId: string): Promise<ApprovalInstance | null>;
  /** All approvals for a given module entity. */
  listForSubject(subject: SoftRef): Promise<ApprovalInstance[]>;
}

/** Workflow definition management (admin/config surface). */
export interface WorkflowEngine {
  define(def: WorkflowDefinition): Promise<WorkflowDefinition>;
  getForEntity(tenantId: TenantId, appliesTo: string): Promise<WorkflowDefinition | null>;
}

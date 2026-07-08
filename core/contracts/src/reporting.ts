/**
 * Centralized Reporting Framework contracts. Modules REGISTER reports; the Core
 * framework provides filters, export, scheduling, dashboards, charts, KPIs,
 * executive rollups and AI summaries uniformly. No module builds its own
 * reporting engine (ADR-0007).
 */
import type { RequestContext } from './identity';
import type { Paginated } from './primitives';

export type FilterKind = 'text' | 'number' | 'date' | 'jalali-date' | 'select' | 'boolean' | 'ref';
export interface ReportFilterSpec {
  key: string;
  label: string;
  kind: FilterKind;
  required?: boolean;
  /** Options for kind = "select". */
  options?: { value: string; label: string }[];
}

export type ColumnType = 'string' | 'number' | 'money' | 'date' | 'jalali-date' | 'status' | 'ref';
export interface ReportColumn {
  key: string;
  label: string;
  type: ColumnType;
  /** Aggregate applied in totals row, if any. */
  aggregate?: 'sum' | 'avg' | 'count' | 'min' | 'max';
}

export type ChartKind = 'bar' | 'line' | 'pie' | 'area' | 'kpi' | 'table';
export interface ChartSpec {
  kind: ChartKind;
  /** Column keys mapped to chart roles. */
  x?: string;
  y?: string[];
  series?: string;
}

export type ExportFormat = 'xlsx' | 'csv' | 'pdf' | 'json';

/** The runtime input a report receives when executed. */
export interface ReportRunInput {
  filters: Record<string, unknown>;
  page?: number;
  pageSize?: number;
}

export interface ReportRunOutput {
  columns: ReportColumn[];
  data: Paginated<Record<string, unknown>>;
  /** Optional totals/aggregates row. */
  totals?: Record<string, unknown>;
}

/**
 * A report a module contributes. `run` is the ONLY module-specific piece; the
 * framework owns filtering UI, export, scheduling, charting and AI summary.
 */
export interface ReportDescriptor {
  key: string; // "<module>.<report>"
  module: string;
  title: string;
  description?: string;
  /** Permission required to view/run. */
  permission: string;
  filters: readonly ReportFilterSpec[];
  charts?: readonly ChartSpec[];
  /** Included in executive dashboards when true. */
  executive?: boolean;
  /** Supports the framework's AI natural-language summary when true. */
  aiSummary?: boolean;
  exportFormats?: readonly ExportFormat[];
  schedulable?: boolean;
  run(input: ReportRunInput, ctx: RequestContext): Promise<ReportRunOutput>;
}

export interface ReportRegistry {
  register(report: ReportDescriptor): void;
  list(ctx: RequestContext): ReportDescriptor[];
  get(key: string): ReportDescriptor | undefined;
}

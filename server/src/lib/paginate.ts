const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

export function parsePagination(query: Record<string, unknown>): { page: number; limit: number } {
  const page = Math.max(1, Number(query.page) || 1);
  const limit = Math.min(MAX_LIMIT, Math.max(1, Number(query.limit) || DEFAULT_LIMIT));
  return { page, limit };
}

export function paginationSkipTake({ page, limit }: { page: number; limit: number }): { skip: number; take: number } {
  return { skip: (page - 1) * limit, take: limit };
}

export interface PaginatedMeta {
  total: number;
  page: number;
  totalPages: number;
}

export function buildMeta(total: number, page: number, limit: number): PaginatedMeta {
  return { total, page, totalPages: Math.max(1, Math.ceil(total / limit)) };
}

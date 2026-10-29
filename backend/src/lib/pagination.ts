import type { Paginated, PaginationQuery } from '@mumtaz/contracts';

export function pageOffset({ page, page_size }: PaginationQuery): number {
  return (page - 1) * page_size;
}

export function paginated<T>(items: T[], query: PaginationQuery, total: number): Paginated<T> {
  return { items, page: query.page, page_size: query.page_size, total };
}

/** Escape wildcard LIKE agar input pencarian diperlakukan literal. */
export function likePattern(search: string): string {
  return `%${search.replace(/[\\%_]/g, (char) => `\\${char}`)}%`;
}

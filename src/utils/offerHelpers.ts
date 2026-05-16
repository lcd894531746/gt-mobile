import { getQuoteOrderNo, mergeQuotesByOrderNo } from './mergeQuotesByOrderNo';

export type QuoteItem = Record<string, unknown>;
export type CustomerRow = Record<string, unknown>;

export function normalizeList(raw: unknown): QuoteItem[] {
  if (Array.isArray(raw)) return raw as QuoteItem[];
  if (raw && typeof raw === 'object') {
    const data = (raw as { data?: unknown }).data;
    if (Array.isArray(data)) return data as QuoteItem[];
  }
  return [];
}

export function normalizeCustomers(raw: unknown): CustomerRow[] {
  if (Array.isArray(raw)) return raw as CustomerRow[];
  if (raw && typeof raw === 'object') {
    const data = (raw as { data?: unknown }).data;
    if (Array.isArray(data)) return data as CustomerRow[];
  }
  return [];
}

export function getOrderNo(item: QuoteItem): string {
  return getQuoteOrderNo(item);
}

export function getCustomerName(item: QuoteItem): string {
  const value = item['客户名称'] ?? item.customerName ?? item.customer ?? item['客户'] ?? '未知客户';
  return String(value);
}

export function getCustomerId(row: CustomerRow | null): string {
  if (!row) return '';
  return String(row['客户编号'] ?? row['客户ID'] ?? row.id ?? '').trim();
}

export function formatOfferDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

export function endOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0);
}

export function mergeQuoteList(raw: unknown): QuoteItem[] {
  return mergeQuotesByOrderNo(normalizeList(raw));
}

export function extractDetailLines(detail: unknown): QuoteItem[] {
  if (!detail) return [];
  if (Array.isArray(detail)) return detail as QuoteItem[];
  const d = detail as Record<string, unknown>;
  if (Array.isArray(d.data)) {
    const inner = d.data as unknown;
    if (Array.isArray(inner)) return inner as QuoteItem[];
    if (inner && typeof inner === 'object') {
      const o = inner as Record<string, unknown>;
      if (Array.isArray(o['产品信息'])) return o['产品信息'] as QuoteItem[];
    }
  }
  if (Array.isArray(d['产品信息'])) return d['产品信息'] as QuoteItem[];
  return [];
}

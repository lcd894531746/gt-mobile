/** 与表格「单号」列一致：跳过 null/undefined/纯空白，避免 '' 堵住 ?? 链导致合并不生效 */
const QUOTE_ORDER_FIELDS = [
  '单号',
  '报价单号',
  '单据号',
  '订单号',
  '报价编号',
  'quoteNo',
  'orderNo',
  'order_no',
  'orderSn',
  'id',
] as const;

export function getQuoteOrderNo(item: Record<string, unknown>): string {
  for (const key of QUOTE_ORDER_FIELDS) {
    const v = item[key];
    if (v == null) continue;
    const s = String(v).trim();
    if (s !== '') return s;
  }
  return '';
}

/** 与列表展示一致的金额读取（首个有限数字字段） */
export function numberFromRecord(record: Record<string, unknown>): number {
  const candidateKeys = ['总价', '总金额', '合计', 'amount', 'total', 'totalPrice', 'price', '应收金额', '金额'];
  for (const key of candidateKeys) {
    const raw = record[key];
    const value = Number(raw);
    if (Number.isFinite(value)) return value;
  }
  return 0;
}

const AMOUNT_KEYS = ['总价', '总金额', '合计', 'amount', 'total', 'totalPrice', 'price', '应收金额', '金额'] as const;

function mergeGroup(group: Record<string, unknown>[]): Record<string, unknown> {
  const sum = group.reduce((s, r) => s + numberFromRecord(r), 0);
  const merged: Record<string, unknown> = { ...group[0] };

  const keysUsed = new Set<string>();
  for (const r of group) {
    for (const key of AMOUNT_KEYS) {
      const raw = r[key];
      if (raw == null || raw === '') continue;
      if (Number.isFinite(Number(raw))) keysUsed.add(key);
    }
  }

  if (keysUsed.size === 0) {
    merged['金额'] = sum;
    merged['总价'] = sum;
  } else {
    for (const key of keysUsed) {
      merged[key] = sum;
    }
  }

  return merged;
}

/** 相同单号合成一行，金额字段累加（无单号的行保持原样逐条保留） */
export function mergeQuotesByOrderNo(rows: Record<string, unknown>[]): Record<string, unknown>[] {
  const withoutOrder: Record<string, unknown>[] = [];
  const withOrder: Record<string, unknown>[] = [];

  for (const row of rows) {
    if (getQuoteOrderNo(row) === '') withoutOrder.push(row);
    else withOrder.push(row);
  }

  const map = new Map<string, Record<string, unknown>[]>();
  for (const row of withOrder) {
    const k = getQuoteOrderNo(row);
    const arr = map.get(k) ?? [];
    arr.push(row);
    map.set(k, arr);
  }

  const merged: Record<string, unknown>[] = [];
  for (const [, group] of map) {
    merged.push(group.length === 1 ? group[0] : mergeGroup(group));
  }

  return [...merged, ...withoutOrder];
}

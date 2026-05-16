import { Ionicons } from '@expo/vector-icons';
import * as ScreenOrientation from 'expo-screen-orientation';
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  Modal,
  PanResponder,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import Svg, { Circle, Line, Polyline, Text as SvgText } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { PageScaffold } from '../components/PageScaffold';
import { fetchQuoteData, fetchQuoteDetail } from '../services/api';
import { getQuoteOrderNo, mergeQuotesByOrderNo, numberFromRecord } from '../utils/mergeQuotesByOrderNo';

type QuoteRecord = Record<string, unknown>;
type QuoteTableCols = {
  idx: number;
  order: number;
  customer: number;
  money: number;
  date: number;
  status: number;
};

const QUOTE_TABLE_COLS_EMBEDDED: QuoteTableCols = {
  idx: 40,
  order: 118,
  customer: 130,
  money: 72,
  date: 138,
  status: 88,
};

const QUOTE_TABLE_COLS_FULLSCREEN: QuoteTableCols = {
  idx: 46,
  order: 136,
  customer: 172,
  money: 94,
  date: 168,
  status: 102,
};

/** 卡片内表格最小宽度（与原样式一致） */
const QUOTE_TABLE_MIN_EMBEDDED = 668;

function quoteTableMinWidth(cols: QuoteTableCols, screenW: number): number {
  const sum = cols.idx + cols.order + cols.customer + cols.money + cols.date + cols.status;
  return Math.max(sum, Math.round(screenW));
}

type DashTab = 'overview' | 'product' | 'customer';

function normalizeList(raw: unknown): QuoteRecord[] {
  if (Array.isArray(raw)) return raw as QuoteRecord[];
  if (raw && typeof raw === 'object') {
    const data = (raw as { data?: unknown }).data;
    if (Array.isArray(data)) return data as QuoteRecord[];
  }
  return [];
}

function formatDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function endOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0);
}

/** 表格「单号」与合并分组共用同一套字段优先级（含跳过空字符串） */
const getOrderNo = getQuoteOrderNo;

function getCustomerName(item: QuoteRecord): string {
  const value = item['客户名称'] ?? item.customerName ?? item.customer ?? item['客户'] ?? '未知客户';
  return String(value);
}

/** 与桌面端列表一致：优先报价日期，其次销售时间（getQuoteData 常用） */
const QUOTE_DATE_FIELD_KEYS = [
  '报价日期',
  '销售时间',
  '日期',
  '创建时间',
  '单据日期',
  '时间',
  'date',
  'createdAt',
  'saleTime',
  'quoteDate',
] as const;

function getQuoteDateRaw(item: QuoteRecord): string {
  for (const key of QUOTE_DATE_FIELD_KEYS) {
    const v = item[key];
    if (v != null && String(v).trim() !== '') {
      return String(v).trim();
    }
  }
  return '';
}

/** 汇总到「时间曲线」用的日历键 YYYY-MM-DD */
function dayKeyFromQuoteRecord(item: QuoteRecord): string | null {
  const raw = getQuoteDateRaw(item);
  if (!raw) return null;

  if (/^\d+$/.test(raw)) {
    const n = Number(raw);
    const ms = n > 1e12 ? n : n * 1000;
    const d = new Date(ms);
    if (!Number.isNaN(d.getTime())) return formatDate(d);
    return null;
  }

  const m = raw.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (m) {
    const [, y, mo, da] = m;
    return `${y}-${mo.padStart(2, '0')}-${da.padStart(2, '0')}`;
  }

  return null;
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

/** 解析 YYYY-MM-DD */
function parseInputDateBound(s: string): Date | null {
  const m = s.trim().match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const dt = new Date(y, mo - 1, d);
  if (dt.getFullYear() !== y || dt.getMonth() !== mo - 1 || dt.getDate() !== d) return null;
  return dt;
}

function filterRangeFromInputs(startDate: string, endDate: string): { start: Date; end: Date } | null {
  const a = parseInputDateBound(startDate);
  const b = parseInputDateBound(endDate);
  if (!a || !b) return null;
  return a <= b ? { start: a, end: b } : { start: b, end: a };
}

function startOfDayDate(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function endOfDayDate(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
}

/** 与桌面「今日 / 本月 / 本年」切片一致，再与报价查询区间（当月）求交（无交集则无排行数据） */
function rankingWindowIntersect(
  gran: 'day' | 'month' | 'year',
  nowRef: Date,
  filter: { start: Date; end: Date },
): { start: Date; end: Date } | null {
  const y = nowRef.getFullYear();
  const m = nowRef.getMonth();
  const day = nowRef.getDate();
  let ws: Date;
  let we: Date;
  if (gran === 'day') {
    ws = new Date(y, m, day);
    we = endOfDayDate(ws);
  } else if (gran === 'month') {
    ws = new Date(y, m, 1);
    we = endOfDayDate(new Date(y, m + 1, 0));
  } else {
    ws = new Date(y, 0, 1);
    we = endOfDayDate(new Date(y, 11, 31));
  }
  const start = startOfDayDate(filter.start) > ws ? startOfDayDate(filter.start) : ws;
  const end = endOfDayDate(filter.end) < we ? endOfDayDate(filter.end) : we;
  if (start > end) return null;
  return { start, end };
}

function quoteDayInWindow(dk: string | null, win: { start: Date; end: Date }): boolean {
  if (!dk) return false;
  const parts = dk.split('-').map(Number);
  if (parts.length !== 3 || parts.some((n) => !Number.isFinite(n))) return false;
  const dt = new Date(parts[0], parts[1] - 1, parts[2]);
  return dt >= startOfDayDate(win.start) && dt <= endOfDayDate(win.end);
}

/**
 * 桌面端 CustomerAnalysis：趋势来自按月的 new/active/dormant；季度为三个月度量之和。
 * 移动端无 getCustomerStats，由报价列表推导（合并单号后的 list）。
 */
function buildCustomerTrendFromList(
  rows: QuoteRecord[],
  chartYear: number,
  trendUnit: 'month' | 'quarter',
): {
  points: { label: string; newCount: number; activeCount: number; dormantCount: number }[];
  monthlyNew: number[];
  monthlyActive: number[];
  monthlyDormant: number[];
} {
  const firstDayPerCustomer = new Map<string, string>();
  for (const row of rows) {
    const dk = dayKeyFromQuoteRecord(row);
    if (!dk) continue;
    const cust = getCustomerName(row);
    const prev = firstDayPerCustomer.get(cust);
    if (!prev || dk < prev) firstDayPerCustomer.set(cust, dk);
  }

  const activeSets: Set<string>[] = Array.from({ length: 12 }, () => new Set());
  const activeDecPrevYear = new Set<string>();
  for (const row of rows) {
    const dk = dayKeyFromQuoteRecord(row);
    if (!dk) continue;
    const parts = dk.split('-').map(Number);
    const y = parts[0];
    const mo = parts[1];
    if (y === chartYear && mo >= 1 && mo <= 12) {
      activeSets[mo - 1].add(getCustomerName(row));
    }
    if (y === chartYear - 1 && mo === 12) {
      activeDecPrevYear.add(getCustomerName(row));
    }
  }

  const monthlyNew: number[] = new Array(12).fill(0);
  const monthlyActive: number[] = new Array(12).fill(0);
  const monthlyDormant: number[] = new Array(12).fill(0);

  for (let mi = 0; mi < 12; mi++) {
    const month = mi + 1;
    let nc = 0;
    for (const [, first] of firstDayPerCustomer) {
      const fp = first.split('-').map(Number);
      if (fp[0] === chartYear && fp[1] === month) nc++;
    }
    monthlyNew[mi] = nc;
    monthlyActive[mi] = activeSets[mi].size;

    let dormant = 0;
    if (month === 1) {
      for (const c of activeDecPrevYear) {
        if (!activeSets[0].has(c)) dormant++;
      }
    } else {
      for (const c of activeSets[mi - 1]) {
        if (!activeSets[mi].has(c)) dormant++;
      }
    }
    monthlyDormant[mi] = dormant;
  }

  if (trendUnit === 'month') {
    const points = monthlyNew.map((_, mi) => ({
      label: `${chartYear}-${pad2(mi + 1)}`,
      newCount: monthlyNew[mi],
      activeCount: monthlyActive[mi],
      dormantCount: monthlyDormant[mi],
    }));
    return { points, monthlyNew, monthlyActive, monthlyDormant };
  }

  const quarters: { label: string; from: number; to: number }[] = [
    { label: `${chartYear}Q1`, from: 0, to: 2 },
    { label: `${chartYear}Q2`, from: 3, to: 5 },
    { label: `${chartYear}Q3`, from: 6, to: 8 },
    { label: `${chartYear}Q4`, from: 9, to: 11 },
  ];
  const points = quarters.map((q) => ({
    label: q.label,
    newCount: monthlyNew.slice(q.from, q.to + 1).reduce((s, v) => s + v, 0),
    activeCount: monthlyActive.slice(q.from, q.to + 1).reduce((s, v) => s + v, 0),
    dormantCount: monthlyDormant.slice(q.from, q.to + 1).reduce((s, v) => s + v, 0),
  }));
  return { points, monthlyNew, monthlyActive, monthlyDormant };
}

/** 表格展示：本地时间的 YYYY-MM-DD HH:mm:ss */
function formatDateTimeLocal(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`;
}

/** 报价明细表「报价日期」列：时间戳 / ISO / 常见字符串统一格式化 */
function formatQuoteDateDisplay(item: QuoteRecord): string {
  const raw = getQuoteDateRaw(item);
  if (!raw) return '-';

  if (/^\d+$/.test(raw)) {
    const n = Number(raw);
    const ms = n > 1e12 ? n : n * 1000;
    const d = new Date(ms);
    return Number.isNaN(d.getTime()) ? raw : formatDateTimeLocal(d);
  }

  let d = new Date(raw);
  if (!Number.isNaN(d.getTime())) {
    return formatDateTimeLocal(d);
  }

  d = new Date(raw.replace(/-/g, '/'));
  if (!Number.isNaN(d.getTime())) {
    return formatDateTimeLocal(d);
  }

  return raw;
}

function getQuoteStatusRaw(item: QuoteRecord): unknown {
  return item['状态'] ?? item.status ?? item['发货状态'] ?? item.orderStatus ?? item['订单状态'];
}

/** 状态码与桌面列表一致：0 待发货、1 已发货；已是中文则原样展示 */
function formatQuoteStatusDisplay(item: QuoteRecord): string {
  const raw = getQuoteStatusRaw(item);
  if (raw === null || raw === undefined || raw === '') return '-';

  if (typeof raw === 'boolean') {
    return raw ? '已发货' : '待发货';
  }

  if (typeof raw === 'number' && Number.isFinite(raw)) {
    return mapQuoteStatusCode(raw);
  }

  const s = String(raw).trim();
  if (s === '') return '-';
  if (/^\d+$/.test(s)) {
    return mapQuoteStatusCode(Number(s));
  }

  return s;
}

function mapQuoteStatusCode(n: number): string {
  switch (n) {
    case 0:
      return '待发货';
    case 1:
      return '已发货';
    default:
      return `状态(${n})`;
  }
}

function statusBadgeStyle(statusLabel: string): { bg: string; color: string } {
  const s = statusLabel;
  if (/已发货|已完成|出库/.test(s)) return { bg: '#f6ffed', color: '#389e0d' };
  if (/待发货|待出库|未发货/.test(s)) return { bg: '#fff7e6', color: '#d46b08' };
  if (/待报价/.test(s)) return { bg: '#fff7e6', color: '#d46b08' };
  return { bg: '#f0f5ff', color: '#2f54eb' };
}

function extractProductLines(detail: unknown): QuoteRecord[] {
  if (Array.isArray(detail)) {
    return detail.filter((x) => x != null && typeof x === 'object') as QuoteRecord[];
  }
  if (!detail || typeof detail !== 'object') return [];
  const d = detail as QuoteRecord;
  const tryArray = (v: unknown) => (Array.isArray(v) ? (v as QuoteRecord[]) : []);
  let lines = tryArray(d['产品信息']);
  if (lines.length) return lines;
  if (Array.isArray(d.data)) {
    const arr = d.data as unknown[];
    if (arr.length > 0 && arr.every((x) => x != null && typeof x === 'object')) {
      return arr as QuoteRecord[];
    }
  }
  const inner = d.data;
  if (inner && typeof inner === 'object' && !Array.isArray(inner)) {
    lines = tryArray((inner as QuoteRecord)['产品信息']);
  }
  return lines;
}

function stringFromDetailField(v: unknown, empty = '—'): string {
  if (v == null || v === '') return empty;
  const s = String(v).trim();
  return s === '' ? empty : s;
}

function formatDetailMoney(v: unknown): string {
  const n = Number(v);
  if (!Number.isFinite(n)) return stringFromDetailField(v);
  return `¥${n.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatDetailQty(v: unknown): string {
  const n = Number(v);
  if (!Number.isFinite(n)) return stringFromDetailField(v);
  return Number.isInteger(n) ? String(n) : n.toLocaleString('zh-CN', { maximumFractionDigits: 4 });
}

function formatDetailWeight(v: unknown): string {
  const n = Number(v);
  if (!Number.isFinite(n)) return stringFromDetailField(v);
  const s = n
    .toFixed(6)
    .replace(/(\.\d*?)0+$/, '$1')
    .replace(/\.$/, '');
  return s || '0';
}

function detailPayloadErrorMessage(detail: unknown): string | null {
  if (!detail || typeof detail !== 'object') return null;
  if (!('error' in detail)) return null;
  const e = (detail as { error?: unknown }).error;
  if (e == null || e === '') return null;
  return String(e);
}

function cellBreakdownWeight(line: QuoteRecord, key: string): string {
  const v = line[key];
  if (v == null || String(v).trim() === '') return '—';
  const n = Number(v);
  if (Number.isFinite(n) && n === 0) return '—';
  return formatDetailWeight(v);
}

function cellBreakdownPrice(line: QuoteRecord, key: string): string {
  const v = line[key];
  if (v == null || String(v).trim() === '') return '—';
  const n = Number(v);
  if (Number.isFinite(n) && n === 0) return '—';
  return formatDetailMoney(v);
}

/** 与桌面端报价明细表字段对齐；横向滑动查看全部列 */
const ORDER_DETAIL_COLUMNS: { width: number; title: string; cell: (line: QuoteRecord) => string }[] = [
  {
    width: 114,
    title: '产品名称',
    cell: (line) => stringFromDetailField(line['品名'] ?? line['产品名称'] ?? line.name),
  },
  { width: 128, title: '规格', cell: (line) => stringFromDetailField(line['规格']) },
  { width: 44, title: '单位', cell: (line) => stringFromDetailField(line['单位']) },
  { width: 52, title: '数量', cell: (line) => formatDetailQty(line['数量']) },
  { width: 78, title: '单价', cell: (line) => formatDetailMoney(line['单价']) },
  { width: 78, title: '金额', cell: (line) => formatDetailMoney(line['金额']) },
  { width: 86, title: '理论重量', cell: (line) => formatDetailWeight(line['理论重量']) },
  { width: 76, title: '总重量', cell: (line) => formatDetailWeight(line['总重量']) },
  { width: 72, title: '重量1', cell: (line) => cellBreakdownWeight(line, '重量1') },
  { width: 72, title: '重量2', cell: (line) => cellBreakdownWeight(line, '重量2') },
  { width: 72, title: '重量3', cell: (line) => cellBreakdownWeight(line, '重量3') },
  { width: 72, title: '单价1', cell: (line) => cellBreakdownPrice(line, '单价1') },
  { width: 72, title: '单价2', cell: (line) => cellBreakdownPrice(line, '单价2') },
  { width: 72, title: '单价3', cell: (line) => cellBreakdownPrice(line, '单价3') },
  { width: 88, title: '称重单价', cell: (line) => stringFromDetailField(line['称重单价'], '—') },
  { width: 96, title: '备注', cell: (line) => stringFromDetailField(line['备注'], '—') },
];

const ORDER_DETAIL_TABLE_MIN_WIDTH = ORDER_DETAIL_COLUMNS.reduce((s, c) => s + c.width, 0);

function productLineAmount(row: QuoteRecord): number {
  const v = Number(row['金额'] ?? row.amount ?? row.total ?? 0);
  return Number.isFinite(v) ? v : 0;
}

function productQtyFromLine(row: QuoteRecord): number {
  const v = Number(row['数量'] ?? row.qty ?? 0);
  return Number.isFinite(v) ? v : 0;
}

/** TOP10：按「规格」聚合（无规格则未知规格） */
function productSpecKey(line: QuoteRecord): string {
  const raw = line['规格'];
  const s = raw != null ? String(raw).trim() : '';
  return s || '未知规格';
}

async function fetchQuoteDetailPairs(orderNos: string[], chunkSize: number): Promise<[string, unknown | null][]> {
  const results: [string, unknown | null][] = [];
  for (let i = 0; i < orderNos.length; i += chunkSize) {
    const chunk = orderNos.slice(i, i + chunkSize);
    const part = await Promise.all(
      chunk.map(async (no) => {
        try {
          const d = await fetchQuoteDetail(no);
          return [no, d] as [string, unknown];
        } catch {
          return [no, null] as [string, null];
        }
      }),
    );
    results.push(...part);
  }
  return results;
}

/** 热销 TOP10 固定 10 个名次位，不足补空 */
const EMPTY_RANK_ROW = { spec: '—', amount: 0, qty: 0 } as const;

function MiniLineChart({ series }: { series: { day: string; amount: number }[] }) {
  const width = Math.min(Dimensions.get('window').width - 36, 380);
  const height = 140;
  const padL = 36;
  const padR = 12;
  const padT = 12;
  const padB = 28;
  const innerW = width - padL - padR;
  const innerH = height - padT - padB;

  const hideHudTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const [hudVisible, setHudVisible] = useState(false);

  useEffect(() => {
    if (series.length === 0) {
      setActiveIndex(null);
      setHudVisible(false);
      if (hideHudTimerRef.current) {
        clearTimeout(hideHudTimerRef.current);
        hideHudTimerRef.current = null;
      }
      return;
    }
    setActiveIndex((prev) => {
      if (prev != null && prev >= 0 && prev < series.length) return prev;
      return series.length - 1;
    });
    setHudVisible(false);
    if (hideHudTimerRef.current) {
      clearTimeout(hideHudTimerRef.current);
      hideHudTimerRef.current = null;
    }
  }, [series]);

  useEffect(() => {
    return () => {
      if (hideHudTimerRef.current) {
        clearTimeout(hideHudTimerRef.current);
      }
    };
  }, []);

  const scheduleHideHud = useCallback(() => {
    if (hideHudTimerRef.current) {
      clearTimeout(hideHudTimerRef.current);
    }
    hideHudTimerRef.current = setTimeout(() => {
      setHudVisible(false);
      hideHudTimerRef.current = null;
    }, 5000);
  }, []);

  const updateIndex = useCallback(
    (locationX: number) => {
      const n = series.length;
      if (n === 0) return;
      const clamped = Math.max(padL, Math.min(padL + innerW, locationX));
      let idx: number;
      if (n === 1) {
        idx = 0;
      } else {
        const t = (clamped - padL) / innerW;
        idx = Math.round(t * (n - 1));
      }
      setActiveIndex(idx);
      setHudVisible(true);
      scheduleHideHud();
    },
    [series.length, padL, innerW, scheduleHideHud],
  );

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => series.length > 0,
        onMoveShouldSetPanResponder: () => series.length > 0,
        onPanResponderTerminationRequest: () => false,
        onPanResponderGrant: (e) => updateIndex(e.nativeEvent.locationX),
        onPanResponderMove: (e) => updateIndex(e.nativeEvent.locationX),
      }),
    [series.length, updateIndex],
  );

  if (series.length === 0) {
    return (
      <View style={[styles.chartCardInner, { height: height + 8 }]}>
        <Text style={styles.muted}>暂无曲线数据</Text>
      </View>
    );
  }

  const maxY = Math.max(...series.map((s) => s.amount), 1);
  const n = series.length;
  const safeIdx = activeIndex != null ? Math.min(Math.max(0, activeIndex), n - 1) : n - 1;
  const sel = series[safeIdx];
  const cx = padL + (n === 1 ? innerW / 2 : (innerW * safeIdx) / (n - 1));
  const cy = padT + innerH - (sel.amount / maxY) * innerH;

  const pts = series.map((s, i) => {
    const x = padL + (n === 1 ? innerW / 2 : (innerW * i) / (n - 1));
    const y = padT + innerH - (s.amount / maxY) * innerH;
    return `${x},${y}`;
  });

  const labelEvery = Math.max(1, Math.ceil(n / 4));

  const tooltipW = 152;
  const tooltipH = 48;
  let tooltipLeft = cx - tooltipW / 2;
  tooltipLeft = Math.max(4, Math.min(width - tooltipW - 4, tooltipLeft));
  let tooltipTop = cy - tooltipH - 10;
  if (tooltipTop < padT) {
    tooltipTop = cy + 14;
  }
  tooltipTop = Math.max(padT + 2, Math.min(height - tooltipH - 4, tooltipTop));

  return (
    <View style={styles.chartCardInner}>
      <View style={[styles.chartPlotWrap, { width, height }]} {...panResponder.panHandlers}>
        <Svg width={width} height={height}>
          <Line x1={padL} y1={padT + innerH} x2={padL + innerW} y2={padT + innerH} stroke="#e8ecf2" strokeWidth={1} />
          <Line x1={padL} y1={padT} x2={padL} y2={padT + innerH} stroke="#e8ecf2" strokeWidth={1} />
          <SvgText x={4} y={padT + 4} fontSize="10" fill="#8892a6">
            {Math.round(maxY)}
          </SvgText>
          <SvgText x={4} y={padT + innerH} fontSize="10" fill="#8892a6">
            0
          </SvgText>
          <Polyline points={pts.join(' ')} fill="none" stroke="#2f68ff" strokeWidth="2" />
          {hudVisible ? (
            <>
              <Line
                x1={cx}
                y1={padT}
                x2={cx}
                y2={padT + innerH}
                stroke="#94a3b8"
                strokeWidth={1}
                strokeDasharray="5 5"
              />
              <Line
                x1={padL}
                y1={cy}
                x2={padL + innerW}
                y2={cy}
                stroke="#94a3b8"
                strokeWidth={1}
                strokeDasharray="5 5"
              />
            </>
          ) : null}
          {series.map((s, i) => {
            const x = padL + (n === 1 ? innerW / 2 : (innerW * i) / (n - 1));
            const y = padT + innerH - (s.amount / maxY) * innerH;
            const active = hudVisible && i === safeIdx;
            return (
              <Circle
                key={`${s.day}-${i}`}
                cx={x}
                cy={y}
                r={active ? 6 : 3}
                fill="#2f68ff"
                stroke={active ? '#fff' : 'none'}
                strokeWidth={active ? 2 : 0}
              />
            );
          })}
          {series.map((s, i) =>
            i % labelEvery === 0 || i === n - 1 ? (
              <SvgText
                key={`lbl-${s.day}`}
                x={padL + (n === 1 ? innerW / 2 : (innerW * i) / (n - 1))}
                y={height - 6}
                fontSize="9"
                fill="#8892a6"
                textAnchor="middle"
              >
                {s.day.slice(5)}
              </SvgText>
            ) : null,
          )}
        </Svg>
        {hudVisible ? (
          <View pointerEvents="none" style={[styles.chartTooltipFloat, { left: tooltipLeft, top: tooltipTop }]}>
            <Text style={styles.chartFloatDay}>{sel.day}</Text>
            <Text style={styles.chartFloatAmt}>
              金额{' '}
              {sel.amount.toLocaleString('zh-CN', { minimumFractionDigits: 0, maximumFractionDigits: 2 })} 元
            </Text>
          </View>
        ) : null}
      </View>
    </View>
  );
}

function ProductTopBarChart({
  items,
  width,
}: {
  items: { spec: string; amount: number; qty: number }[];
  width: number;
}) {
  const slotCount = 10;
  const ranks: { spec: string; amount: number; qty: number }[] = [];
  for (let i = 0; i < slotCount; i++) {
    ranks.push(items[i] ?? { ...EMPTY_RANK_ROW });
  }

  const values = ranks.map((it) => it.amount);
  const maxV = Math.max(...values, 1);

  const fmtAmt = (v: number) =>
    v >= 100000 ? `${(v / 10000).toFixed(1)}万` : Math.round(v).toLocaleString('zh-CN');

  return (
    <View style={[styles.productBarSection, { width }]}>
      <View style={styles.productHBarChart}>
        {ranks.map((it, i) => {
          const hasData = it.amount > 0;
          const pct = hasData ? Math.max((it.amount / maxV) * 100, 2) : 0;
          return (
            <View key={`hbar-${i}`} style={styles.productHBarRow}>
              <View style={styles.productHBarRankCell}>
                {i < 3 ? (
                  <View
                    style={[
                      styles.productHBarRankBadge,
                      i === 0 && styles.productHBarRankBadge1,
                      i === 1 && styles.productHBarRankBadge2,
                      i === 2 && styles.productHBarRankBadge3,
                    ]}
                  >
                    <Text
                      style={[
                        styles.productHBarRankBadgeText,
                        i === 0 && styles.productHBarRankBadgeText1,
                        i === 1 && styles.productHBarRankBadgeText2,
                        i === 2 && styles.productHBarRankBadgeText3,
                      ]}
                    >
                      {i + 1}
                    </Text>
                  </View>
                ) : (
                  <View style={styles.productHBarRankPlainSlot}>
                    <Text style={styles.productHBarRank}>{i + 1}</Text>
                  </View>
                )}
              </View>
              <View style={styles.productHBarTrackWrap}>
                <View style={styles.productHBarTrack}>
                  <View
                    style={[
                      styles.productHBarFillAbs,
                      hasData
                        ? { width: `${pct}%`, backgroundColor: '#2f68ff' }
                        : { width: 6, backgroundColor: '#e8ecf2' },
                    ]}
                  />
                  <View style={styles.productHBarLabelOverlay} pointerEvents="none">
                    <Text
                      style={[styles.productHBarLabelText, !hasData && styles.productHBarLabelMuted]}
                      numberOfLines={1}
                      ellipsizeMode="tail"
                    >
                      {hasData ? it.spec : '暂无'}
                    </Text>
                  </View>
                </View>
              </View>
              <Text style={[styles.productHBarAmt, !hasData && styles.productHBarAmtMuted]}>
                {hasData ? fmtAmt(it.amount) : '—'}
              </Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

function CustomerTrendMultiChart({
  points,
  width,
}: {
  points: { label: string; newCount: number; activeCount: number; dormantCount: number }[];
  width: number;
}) {
  const height = 168;
  const padL = 38;
  const padR = 10;
  const padT = 14;
  const padB = 30;
  const innerW = width - padL - padR;
  const innerH = height - padT - padB;

  const hideHudTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const [hudVisible, setHudVisible] = useState(false);

  useEffect(() => {
    if (points.length === 0) {
      setActiveIndex(null);
      setHudVisible(false);
      if (hideHudTimerRef.current) {
        clearTimeout(hideHudTimerRef.current);
        hideHudTimerRef.current = null;
      }
      return;
    }
    setActiveIndex((prev) => {
      if (prev != null && prev >= 0 && prev < points.length) return prev;
      return points.length - 1;
    });
    setHudVisible(false);
    if (hideHudTimerRef.current) {
      clearTimeout(hideHudTimerRef.current);
      hideHudTimerRef.current = null;
    }
  }, [points]);

  useEffect(() => {
    return () => {
      if (hideHudTimerRef.current) clearTimeout(hideHudTimerRef.current);
    };
  }, []);

  const scheduleHideHud = useCallback(() => {
    if (hideHudTimerRef.current) clearTimeout(hideHudTimerRef.current);
    hideHudTimerRef.current = setTimeout(() => {
      setHudVisible(false);
      hideHudTimerRef.current = null;
    }, 5000);
  }, []);

  const updateIndex = useCallback(
    (locationX: number) => {
      const n = points.length;
      if (n === 0) return;
      const clamped = Math.max(padL, Math.min(padL + innerW, locationX));
      let idx: number;
      if (n === 1) idx = 0;
      else {
        const t = (clamped - padL) / innerW;
        idx = Math.round(t * (n - 1));
      }
      setActiveIndex(idx);
      setHudVisible(true);
      scheduleHideHud();
    },
    [points.length, padL, innerW, scheduleHideHud],
  );

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => points.length > 0,
        onMoveShouldSetPanResponder: () => points.length > 0,
        onPanResponderTerminationRequest: () => false,
        onPanResponderGrant: (e) => updateIndex(e.nativeEvent.locationX),
        onPanResponderMove: (e) => updateIndex(e.nativeEvent.locationX),
      }),
    [points.length, updateIndex],
  );

  if (points.length === 0) {
    return (
      <View style={[styles.chartCardInner, { height: height + 24 }]}>
        <Text style={styles.muted}>暂无趋势数据（请确认本月内有报价且报价日期字段可用）</Text>
      </View>
    );
  }

  const maxY = Math.max(
    ...points.flatMap((p) => [p.newCount, p.activeCount, p.dormantCount]),
    1,
  );
  const n = points.length;
  const safeIdx = activeIndex != null ? Math.min(Math.max(0, activeIndex), n - 1) : n - 1;
  const sel = points[safeIdx];

  const seriesList: { key: string; color: string; values: number[] }[] = [
    { key: '新增客户', color: '#1890ff', values: points.map((p) => p.newCount) },
    { key: '活跃客户', color: '#52c41a', values: points.map((p) => p.activeCount) },
    { key: '休眠客户', color: '#ff4d4f', values: points.map((p) => p.dormantCount) },
  ];

  const xAt = (i: number) => padL + (n === 1 ? innerW / 2 : (innerW * i) / (n - 1));
  const yAt = (v: number) => padT + innerH - (v / maxY) * innerH;

  const labelEvery = Math.max(1, Math.ceil(n / 4));

  const tooltipW = 168;
  const tooltipH = 72;
  const cx = xAt(safeIdx);
  const cy = yAt(sel.activeCount);
  let tooltipLeft = cx - tooltipW / 2;
  tooltipLeft = Math.max(4, Math.min(width - tooltipW - 4, tooltipLeft));
  let tooltipTop = cy - tooltipH - 12;
  if (tooltipTop < padT) tooltipTop = cy + 14;
  tooltipTop = Math.max(padT + 2, Math.min(height - tooltipH - 4, tooltipTop));

  return (
    <View style={styles.chartCardInner}>
      <View style={styles.customerTrendLegend}>
        {seriesList.map((s) => (
          <View key={s.key} style={styles.customerTrendLegendItem}>
            <View style={[styles.customerTrendLegendDot, { backgroundColor: s.color }]} />
            <Text style={styles.customerTrendLegendText}>{s.key}</Text>
          </View>
        ))}
      </View>
      <View style={[styles.chartPlotWrap, { width, height }]} {...panResponder.panHandlers}>
        <Svg width={width} height={height}>
          <Line x1={padL} y1={padT + innerH} x2={padL + innerW} y2={padT + innerH} stroke="#e8ecf2" strokeWidth={1} />
          <Line x1={padL} y1={padT} x2={padL} y2={padT + innerH} stroke="#e8ecf2" strokeWidth={1} />
          <SvgText x={4} y={padT + 4} fontSize="10" fill="#8892a6">
            {Math.round(maxY)}
          </SvgText>
          <SvgText x={4} y={padT + innerH} fontSize="10" fill="#8892a6">
            0
          </SvgText>
          {seriesList.map((s) => {
            const pts = s.values
              .map((v, i) => `${xAt(i)},${yAt(v)}`)
              .join(' ');
            return <Polyline key={s.key} points={pts} fill="none" stroke={s.color} strokeWidth={2} />;
          })}
          {hudVisible ? (
            <Line
              x1={cx}
              y1={padT}
              x2={cx}
              y2={padT + innerH}
              stroke="#94a3b8"
              strokeWidth={1}
              strokeDasharray="5 5"
            />
          ) : null}
          {seriesList.map((s) =>
            s.values.map((v, i) => {
              const x = xAt(i);
              const y = yAt(v);
              const active = hudVisible && i === safeIdx;
              return (
                <Circle
                  key={`${s.key}-${i}`}
                  cx={x}
                  cy={y}
                  r={active ? 5 : 2.5}
                  fill={s.color}
                  stroke={active ? '#fff' : 'none'}
                  strokeWidth={active ? 2 : 0}
                />
              );
            }),
          )}
          {points.map((p, i) =>
            i % labelEvery === 0 || i === n - 1 ? (
              <SvgText
                key={`lbl-${p.label}`}
                x={xAt(i)}
                y={height - 4}
                fontSize="8"
                fill="#8892a6"
                textAnchor="middle"
              >
                {p.label}
              </SvgText>
            ) : null,
          )}
        </Svg>
        {hudVisible ? (
          <View pointerEvents="none" style={[styles.chartTooltipFloat, { left: tooltipLeft, top: tooltipTop, width: tooltipW }]}>
            <Text style={styles.chartFloatDay}>{sel.label}</Text>
            <Text style={styles.chartTrendHudLine}>新增客户 {sel.newCount}</Text>
            <Text style={[styles.chartTrendHudLine, { color: '#7ee787' }]}>活跃客户 {sel.activeCount}</Text>
            <Text style={[styles.chartTrendHudLine, { color: '#ff9c9c' }]}>休眠客户 {sel.dormantCount}</Text>
          </View>
        ) : null}
      </View>
    </View>
  );
}

export function DataDashScreen() {
  const [dashTab, setDashTab] = useState<DashTab>('overview');
  const [loading, setLoading] = useState(true);
  const [list, setList] = useState<QuoteRecord[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [detailCache, setDetailCache] = useState<Record<string, unknown>>({});

  const [orderDetailModalOrderNo, setOrderDetailModalOrderNo] = useState<string | null>(null);
  const [orderDetailModalRow, setOrderDetailModalRow] = useState<QuoteRecord | null>(null);
  const [orderDetailModalLoading, setOrderDetailModalLoading] = useState(false);

  const [productLoading, setProductLoading] = useState(false);
  const [productAnalysisDone, setProductAnalysisDone] = useState(false);
  const [productAggMap, setProductAggMap] = useState<Record<string, { amount: number; qty: number }>>({});

  const [quoteDetailFullscreen, setQuoteDetailFullscreen] = useState(false);

  const [customerTrendUnit, setCustomerTrendUnit] = useState<'month' | 'quarter'>('month');
  const [customerRankGranularity, setCustomerRankGranularity] = useState<'day' | 'month' | 'year'>('day');

  const insets = useSafeAreaInsets();
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();

  const loadMain = useCallback(async () => {
    setLoading(true);
    setError(null);
    const now = new Date();
    const start = formatDate(startOfMonth(now));
    const end = formatDate(endOfMonth(now));
    try {
      const raw = await fetchQuoteData({
        startDate: start,
        endDate: end,
      });
      setList(mergeQuotesByOrderNo(normalizeList(raw)));
      setDetailCache({});
      setProductAggMap({});
      setProductAnalysisDone(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : '加载失败');
      setList([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadMain();
  }, [loadMain]);

  const metrics = useMemo(() => {
    let total = 0;
    const customers = new Set<string>();
    let pendingShip = 0;
    let shipped = 0;
    for (const row of list) {
      total += numberFromRecord(row);
      customers.add(getCustomerName(row));
      const st = formatQuoteStatusDisplay(row);
      if (/待发货|待出库|未发货/.test(st)) pendingShip += 1;
      else if (/已发货|已完成|出库/.test(st)) shipped += 1;
    }
    return {
      totalAmount: total,
      customerCount: customers.size,
      pendingShip,
      shipped,
    };
  }, [list]);

  const customerShares = useMemo(() => {
    const map = new Map<string, number>();
    for (const row of list) {
      const name = getCustomerName(row);
      const amt = numberFromRecord(row);
      map.set(name, (map.get(name) ?? 0) + amt);
    }
    const sorted = [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);
    const max = sorted[0]?.[1] ?? 1;
    return sorted.map(([name, amount], idx) => ({
      rank: idx + 1,
      name,
      amount,
      pct: max > 0 ? (amount / max) * 100 : 0,
      shareOfTotal: metrics.totalAmount > 0 ? (amount / metrics.totalAmount) * 100 : 0,
    }));
  }, [list, metrics.totalAmount]);

  const timeSeries = useMemo(() => {
    const map = new Map<string, number>();
    for (const row of list) {
      const day = dayKeyFromQuoteRecord(row);
      if (!day) continue;
      map.set(day, (map.get(day) ?? 0) + numberFromRecord(row));
    }
    return [...map.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([day, amount]) => ({ day, amount }));
  }, [list]);

  const customerAnalysis = useMemo(() => {
    const now = new Date();
    const chartYear = now.getFullYear();
    const cm = now.getMonth() + 1;
    const cq = Math.floor((cm - 1) / 3) + 1;
    const pack = buildCustomerTrendFromList(list, chartYear, customerTrendUnit);
    const distinct = new Set(list.map((r) => getCustomerName(r))).size;
    let currentNew: number;
    let currentActive: number;
    let currentDormant: number;
    if (customerTrendUnit === 'month') {
      currentNew = pack.monthlyNew[cm - 1];
      currentActive = pack.monthlyActive[cm - 1];
      currentDormant = pack.monthlyDormant[cm - 1];
    } else {
      const qs = (cq - 1) * 3;
      const sumSlice = (arr: number[]) => arr.slice(qs, qs + 3).reduce((s, v) => s + v, 0);
      currentNew = sumSlice(pack.monthlyNew);
      currentActive = sumSlice(pack.monthlyActive);
      currentDormant = sumSlice(pack.monthlyDormant);
    }
    return {
      trendPoints: pack.points,
      totalCustomers: distinct,
      currentNew,
      currentActive,
      currentDormant,
    };
  }, [list, customerTrendUnit]);

  const customerRankingTop = useMemo(() => {
    const now = new Date();
    const fr = filterRangeFromInputs(formatDate(startOfMonth(now)), formatDate(endOfMonth(now)));
    if (!fr) {
      return { rows: [] as { customerName: string; quoteCount: number; totalAmount: number }[], hint: '日期范围无效' };
    }
    const win = rankingWindowIntersect(customerRankGranularity, now, fr);
    if (!win) {
      return {
        rows: [] as { customerName: string; quoteCount: number; totalAmount: number }[],
        hint: '当前粒度下的「今日/本月/本年」与本月数据区间无交集。',
      };
    }
    const map = new Map<string, { quoteCount: number; totalAmount: number }>();
    for (const row of list) {
      const dk = dayKeyFromQuoteRecord(row);
      if (!quoteDayInWindow(dk, win)) continue;
      const name = getCustomerName(row);
      const prev = map.get(name) ?? { quoteCount: 0, totalAmount: 0 };
      prev.quoteCount += 1;
      prev.totalAmount += numberFromRecord(row);
      map.set(name, prev);
    }
    const rows = [...map.entries()]
      .map(([customerName, v]) => ({ customerName, ...v }))
      .sort((a, b) => b.totalAmount - a.totalAmount)
      .slice(0, 8);
    return { rows, hint: null as string | null };
  }, [list, customerRankGranularity]);

  const openOrderDetailModal = async (orderNo: string, row: QuoteRecord) => {
    const no = orderNo.trim();
    if (!no) {
      Alert.alert('提示', '当前行没有可点的单号');
      return;
    }
    setOrderDetailModalOrderNo(no);
    setOrderDetailModalRow(row);
    setOrderDetailModalLoading(true);
    try {
      const d = await fetchQuoteDetail(no);
      setDetailCache((prev) => ({ ...prev, [no]: d }));
    } catch {
      setDetailCache((prev) => ({ ...prev, [no]: { error: '明细加载失败' } }));
    } finally {
      setOrderDetailModalLoading(false);
    }
  };

  const closeOrderDetailModal = () => {
    setOrderDetailModalOrderNo(null);
    setOrderDetailModalRow(null);
    setOrderDetailModalLoading(false);
  };

  const openQuoteFullscreen = useCallback(async () => {
    setQuoteDetailFullscreen(true);
    if (Platform.OS !== 'web') {
      try {
        await ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE);
      } catch {
        /* 设备或模拟器可能不支持 */
      }
    }
  }, []);

  const closeQuoteFullscreen = useCallback(async () => {
    setQuoteDetailFullscreen(false);
    if (Platform.OS !== 'web') {
      try {
        await ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP);
      } catch {
        /* ignore */
      }
    }
  }, []);

  useEffect(() => {
    return () => {
      if (Platform.OS === 'web') return;
      ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP).catch(() => {});
    };
  }, []);

  const renderQuoteDetailTable = (cols: QuoteTableCols, minWidth: number) => (
    <View style={{ minWidth }}>
      <View style={[styles.tableHead, { minWidth }]}>
        <Text style={[styles.th, { width: cols.idx }]}>序号</Text>
        <Text style={[styles.th, { width: cols.order }]}>单号</Text>
        <Text style={[styles.th, { width: cols.customer }]}>客户名称</Text>
        <Text style={[styles.th, { width: cols.money }]}>金额</Text>
        <Text style={[styles.th, { width: cols.date }]}>报价日期</Text>
        <Text style={[styles.th, { width: cols.status }]}>状态</Text>
      </View>
      {list.map((row, idx) => {
        const orderNo = getOrderNo(row);
        const st = formatQuoteStatusDisplay(row);
        const badge = statusBadgeStyle(st);
        const hasOrder = Boolean(orderNo.trim());
        return (
          <View key={`${orderNo}-${idx}`}>
            <View style={[styles.tableRow, { minWidth }]}>
              <Text style={[styles.td, { width: cols.idx }]}>{idx + 1}</Text>
              <View style={[styles.tableCell, { width: cols.order }]}>
                <Pressable
                  disabled={!hasOrder}
                  onPress={() => void openOrderDetailModal(orderNo, row)}
                  hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}
                >
                  <Text
                    style={[styles.td, styles.orderNoLink, !hasOrder && styles.orderNoMuted]}
                    numberOfLines={1}
                  >
                    {orderNo || '-'}
                  </Text>
                </Pressable>
              </View>
              <Text style={[styles.td, { width: cols.customer }]} numberOfLines={1}>
                {getCustomerName(row)}
              </Text>
              <Text style={[styles.td, { width: cols.money }]}>{numberFromRecord(row).toFixed(2)}</Text>
              <Text style={[styles.td, { width: cols.date }]} numberOfLines={1}>
                {formatQuoteDateDisplay(row)}
              </Text>
              <View style={[styles.tableCell, { width: cols.status }]}>
                <View style={[styles.badge, { backgroundColor: badge.bg }]}>
                  <Text style={[styles.badgeText, { color: badge.color }]}>{st || '-'}</Text>
                </View>
              </View>
            </View>
          </View>
        );
      })}
      {list.length === 0 ? <Text style={styles.muted}>当前区间暂无报价</Text> : null}
    </View>
  );

  const loadProductAnalysis = useCallback(async () => {
    const orderNos = [
      ...new Set(list.map((row) => String(getOrderNo(row)).trim()).filter(Boolean)),
    ];
    setProductLoading(true);
    try {
      if (orderNos.length === 0) {
        setProductAggMap({});
        return;
      }
      const pairs = await fetchQuoteDetailPairs(orderNos, 5);

      const agg: Record<string, { amount: number; qty: number }> = {};

      for (const [, detail] of pairs) {
        if (detailPayloadErrorMessage(detail)) continue;
        const lines = extractProductLines(detail);
        for (const line of lines) {
          const spec = productSpecKey(line);
          const amt = productLineAmount(line);
          const qty = productQtyFromLine(line);
          if (!agg[spec]) agg[spec] = { amount: 0, qty: 0 };
          agg[spec].amount += amt;
          agg[spec].qty += qty;
        }
      }

      setProductAggMap(agg);
    } finally {
      setProductLoading(false);
      setProductAnalysisDone(true);
    }
  }, [list]);

  useEffect(() => {
    if (dashTab !== 'product') return;
    if (list.length === 0) return;
    if (productAnalysisDone || productLoading) return;
    void loadProductAnalysis();
  }, [dashTab, list, productAnalysisDone, productLoading, loadProductAnalysis]);

  const productChartW = Math.min(windowWidth - 36, 400);
  const customerChartW = Math.min(windowWidth - 56, 400);

  const productTopBarItems = useMemo(() => {
    const entries = Object.entries(productAggMap).map(([spec, v]) => ({
      spec,
      amount: v.amount,
      qty: v.qty,
    }));
    entries.sort((a, b) => b.amount - a.amount);
    const top = entries.slice(0, 10);
    while (top.length < 10) {
      top.push({ spec: '—', amount: 0, qty: 0 });
    }
    return top;
  }, [productAggMap]);

  const rankColors = ['#f5222d', '#fa8c16', '#2f54eb'];

  const quoteFullscreenMinW = quoteTableMinWidth(QUOTE_TABLE_COLS_FULLSCREEN, windowWidth);
  const quoteFullscreenBodyH = Math.max(280, windowHeight - insets.top - 56 - insets.bottom);

  return (
    <PageScaffold>
      <View style={styles.tabRow}>
        {(
          [
            ['overview', '概览'],
            ['product', '产品维度'],
            ['customer', '客户维度'],
          ] as const
        ).map(([key, label]) => (
          <Pressable
            key={key}
            style={[styles.tabBtn, dashTab === key && styles.tabBtnActive]}
            onPress={() => setDashTab(key)}
          >
            <Text style={[styles.tabBtnText, dashTab === key && styles.tabBtnTextActive]}>{label}</Text>
          </Pressable>
        ))}
      </View>

      {error ? (
        <View style={styles.card}>
          <Text style={styles.error}>接口异常：{error}</Text>
        </View>
      ) : null}

      {dashTab === 'overview' ? (
        <>
          {loading ? (
            <ActivityIndicator style={styles.loader} />
          ) : (
            <>
              <View style={styles.summaryGrid}>
                <View style={[styles.summaryCard, styles.summaryAccentRed]}>
                  <Text style={[styles.summaryValue, styles.summaryMoney]} numberOfLines={1}>
                    {metrics.totalAmount.toFixed(2)} 元
                  </Text>
                  <Text style={styles.summaryMeta}>总金额 · 本期总收入</Text>
                </View>
                <View style={[styles.summaryCard, styles.summaryAccentBlue]}>
                  <Text style={styles.summaryValue} numberOfLines={1}>
                    {metrics.customerCount}
                  </Text>
                  <Text style={styles.summaryMeta}>报价客户 · 活跃客户数</Text>
                </View>
                <View style={[styles.summaryCard, styles.summaryAccentOrange]}>
                  <Text style={styles.summaryValue} numberOfLines={1}>
                    {metrics.pendingShip}
                  </Text>
                  <Text style={styles.summaryMeta}>待发货 · 按状态统计</Text>
                </View>
                <View style={[styles.summaryCard, styles.summaryAccentGreen]}>
                  <Text style={styles.summaryValue} numberOfLines={1}>
                    {metrics.shipped}
                  </Text>
                  <Text style={styles.summaryMeta}>已发货 · 按状态统计</Text>
                </View>
              </View>

              <View style={styles.card}>
                <Text style={styles.blockTitle}>客户报价占比</Text>
                {customerShares.length === 0 ? (
                  <Text style={styles.muted}>暂无数据</Text>
                ) : (
                  customerShares.map((c) => (
                    <View key={c.name} style={styles.shareRow}>
                      <View style={styles.shareRank}>
                        <Text
                          style={[
                            styles.shareRankText,
                            { color: rankColors[c.rank - 1] ?? '#8c8c8c' },
                          ]}
                        >
                          {c.rank}
                        </Text>
                      </View>
                      <View style={styles.shareBody}>
                        <View style={styles.shareHead}>
                          <Text style={styles.shareName} numberOfLines={1}>
                            {c.name}
                          </Text>
                          <Text style={styles.shareAmt}>¥{c.amount.toFixed(2)}</Text>
                          <Text style={styles.sharePct}>{c.shareOfTotal.toFixed(2)}%</Text>
                        </View>
                        <View style={styles.shareTrack}>
                          <View style={[styles.shareFill, { width: `${c.pct}%` }]} />
                        </View>
                      </View>
                    </View>
                  ))
                )}
              </View>

              <View style={styles.card}>
                <Text style={styles.blockTitle}>时间曲线</Text>
                <MiniLineChart series={timeSeries} />
              </View>

              <View style={styles.card}>
                <View style={styles.quoteBlockHead}>
                  <Text style={styles.quoteBlockTitle}>报价明细</Text>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="全屏查看报价明细表格"
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                    onPress={() => void openQuoteFullscreen()}
                    style={styles.quoteFullscreenIconBtn}
                  >
                    <Ionicons name="expand-outline" size={22} color="#5c6b89" />
                  </Pressable>
                </View>
                <ScrollView horizontal showsHorizontalScrollIndicator>
                  {renderQuoteDetailTable(QUOTE_TABLE_COLS_EMBEDDED, QUOTE_TABLE_MIN_EMBEDDED)}
                </ScrollView>
              </View>
            </>
          )}
        </>
      ) : null}

      {dashTab === 'product' ? (
        <>
          <View style={styles.card}>
            <Text style={styles.blockTitle}>热销排名 TOP10</Text>
            {productLoading ? <ActivityIndicator style={styles.loader} /> : null}
            {!productLoading && productAnalysisDone && Object.keys(productAggMap).length === 0 ? (
              <Text style={styles.muted}>暂无产品明细，请确认本月内有报价且明细接口可用。</Text>
            ) : null}
            <ProductTopBarChart items={productTopBarItems} width={productChartW} />
          </View>
        </>
      ) : null}

      {dashTab === 'customer' ? (
        <>
          {loading ? (
            <ActivityIndicator style={styles.loader} />
          ) : (
            <>
              <View style={styles.card}>
                <View style={styles.customerAnalysisHeaderRow}>
                  <Text style={[styles.blockTitle, styles.customerAnalysisTitle]}>客户分析</Text>
                  <View style={styles.customerSegGroup}>
                    <Pressable
                      style={[styles.customerSegBtn, customerTrendUnit === 'month' && styles.customerSegBtnOn]}
                      onPress={() => setCustomerTrendUnit('month')}
                    >
                      <Text style={[styles.customerSegBtnText, customerTrendUnit === 'month' && styles.customerSegBtnTextOn]}>
                        月度分析
                      </Text>
                    </Pressable>
                    <Pressable
                      style={[styles.customerSegBtn, customerTrendUnit === 'quarter' && styles.customerSegBtnOn]}
                      onPress={() => setCustomerTrendUnit('quarter')}
                    >
                      <Text
                        style={[styles.customerSegBtnText, customerTrendUnit === 'quarter' && styles.customerSegBtnTextOn]}
                      >
                        季度分析
                      </Text>
                    </Pressable>
                  </View>
                </View>

                <View style={styles.customerKpiStrip}>
                  <View style={styles.customerKpiCell}>
                    <View style={styles.customerKpiRow}>
                      <View style={[styles.customerKpiIconWrap, { backgroundColor: '#e6f7ff' }]}>
                        <Ionicons name="people-outline" size={13} color="#1890ff" />
                      </View>
                      <View style={styles.customerKpiTexts}>
                        <Text style={styles.customerKpiTitle} numberOfLines={1} ellipsizeMode="tail">
                          总客户数
                        </Text>
                        <Text style={[styles.customerKpiValue, { color: '#1890ff' }]} numberOfLines={1}>
                          {customerAnalysis.totalCustomers}
                        </Text>
                      </View>
                    </View>
                  </View>
                  <View style={styles.customerKpiDividerV} />
                  <View style={styles.customerKpiCell}>
                    <View style={styles.customerKpiRow}>
                      <View style={[styles.customerKpiIconWrap, { backgroundColor: '#f6ffed' }]}>
                        <Ionicons name="person-add-outline" size={13} color="#52c41a" />
                      </View>
                      <View style={styles.customerKpiTexts}>
                        <Text style={styles.customerKpiTitle} numberOfLines={1} ellipsizeMode="tail">
                          {customerTrendUnit === 'month' ? '本月新增' : '本季度新增'}
                        </Text>
                        <Text style={[styles.customerKpiValue, { color: '#52c41a' }]} numberOfLines={1}>
                          {customerAnalysis.currentNew}
                        </Text>
                      </View>
                    </View>
                  </View>
                  <View style={styles.customerKpiDividerV} />
                  <View style={styles.customerKpiCell}>
                    <View style={styles.customerKpiRow}>
                      <View style={[styles.customerKpiIconWrap, { backgroundColor: '#fffbe6' }]}>
                        <Ionicons name="pulse-outline" size={13} color="#faad14" />
                      </View>
                      <View style={styles.customerKpiTexts}>
                        <Text style={styles.customerKpiTitle} numberOfLines={1} ellipsizeMode="tail">
                          {customerTrendUnit === 'month' ? '本月活跃' : '本季度活跃'}
                        </Text>
                        <Text style={[styles.customerKpiValue, { color: '#faad14' }]} numberOfLines={1}>
                          {customerAnalysis.currentActive}
                        </Text>
                      </View>
                    </View>
                  </View>
                  <View style={styles.customerKpiDividerV} />
                  <View style={styles.customerKpiCell}>
                    <View style={styles.customerKpiRow}>
                      <View style={[styles.customerKpiIconWrap, { backgroundColor: '#fff2f0' }]}>
                        <Ionicons name="moon-outline" size={13} color="#ff4d4f" />
                      </View>
                      <View style={styles.customerKpiTexts}>
                        <Text style={styles.customerKpiTitle} numberOfLines={1} ellipsizeMode="tail">
                          {customerTrendUnit === 'month' ? '本月休眠' : '本季度休眠'}
                        </Text>
                        <Text style={[styles.customerKpiValue, { color: '#ff4d4f' }]} numberOfLines={1}>
                          {customerAnalysis.currentDormant}
                        </Text>
                      </View>
                    </View>
                  </View>
                </View>
              </View>

              <View style={styles.card}>
                <Text style={styles.blockTitle}>
                  {customerTrendUnit === 'month' ? '客户趋势分析（本年度月度数据）' : '客户趋势分析（本年度季度数据）'}
                </Text>
                <CustomerTrendMultiChart points={customerAnalysis.trendPoints} width={customerChartW} />
              </View>

              <View style={styles.card}>
                <View style={styles.rankingCardTitleRow}>
                  <Text style={[styles.blockTitle, styles.rankingCardTitleText]}>客户报价金额排行</Text>
                  <View style={styles.customerSegGroup}>
                    {(
                      [
                        ['day', '按日'],
                        ['month', '按月'],
                        ['year', '按年'],
                      ] as const
                    ).map(([val, label]) => (
                      <Pressable
                        key={val}
                        style={[styles.customerSegBtnSmall, customerRankGranularity === val && styles.customerSegBtnOn]}
                        onPress={() => setCustomerRankGranularity(val)}
                      >
                        <Text
                          style={[
                            styles.customerSegBtnTextSmall,
                            customerRankGranularity === val && styles.customerSegBtnTextOn,
                          ]}
                        >
                          {label}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                </View>
                {customerRankingTop.hint ? <Text style={styles.muted}>{customerRankingTop.hint}</Text> : null}
                <View style={styles.customerRankingGrid}>
                  {customerRankingTop.rows.map((item, index) => {
                    const rank = index + 1;
                    const badgeColor =
                      rank === 1 ? '#f5222d' : rank === 2 ? '#fa8c16' : rank === 3 ? '#faad14' : '#8c8c8c';
                    return (
                      <View key={item.customerName} style={styles.customerRankingItem}>
                        <View style={styles.customerRankingItemHead}>
                          <View style={[styles.customerRankingBadge, { backgroundColor: badgeColor }]}>
                            <Text style={styles.customerRankingBadgeText}>{rank}</Text>
                          </View>
                          <Text style={styles.customerRankingName} numberOfLines={2}>
                            {item.customerName}
                          </Text>
                        </View>
                        <View style={styles.customerRankingStat}>
                          <Text style={styles.customerRankingStatLabel}>报价单数</Text>
                          <Text style={styles.customerRankingStatValue}>{item.quoteCount}</Text>
                        </View>
                        <View style={styles.customerRankingStat}>
                          <Text style={styles.customerRankingStatLabel}>报价总额</Text>
                          <Text style={styles.customerRankingStatValue}>
                            ¥
                            {Math.round(item.totalAmount).toLocaleString('zh-CN', {
                              minimumFractionDigits: 0,
                              maximumFractionDigits: 0,
                            })}
                          </Text>
                        </View>
                      </View>
                    );
                  })}
                </View>
                {!customerRankingTop.hint && customerRankingTop.rows.length === 0 ? (
                  <Text style={styles.muted}>该窗口内暂无报价数据</Text>
                ) : null}
              </View>
            </>
          )}
        </>
      ) : null}

      <Modal
        visible={quoteDetailFullscreen}
        animationType="fade"
        presentationStyle="fullScreen"
        statusBarTranslucent={Platform.OS === 'android'}
        onRequestClose={() => void closeQuoteFullscreen()}
      >
        <View style={styles.quoteFullscreenRoot}>
          <View style={[styles.quoteFullscreenToolbar, { paddingTop: insets.top }]}>
            <Text style={styles.quoteFullscreenTitle}>报价明细</Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="退出全屏"
              hitSlop={12}
              onPress={() => void closeQuoteFullscreen()}
              style={styles.quoteFullscreenCloseBtn}
            >
              <Ionicons name="contract-outline" size={26} color="#102248" />
            </Pressable>
          </View>
          <ScrollView
            horizontal
            nestedScrollEnabled
            showsHorizontalScrollIndicator
            style={styles.quoteFullscreenHScroll}
          >
            <ScrollView
              nestedScrollEnabled
              showsVerticalScrollIndicator
              style={{ width: quoteFullscreenMinW, height: quoteFullscreenBodyH }}
              contentContainerStyle={styles.quoteFullscreenVScrollContent}
            >
              {renderQuoteDetailTable(QUOTE_TABLE_COLS_FULLSCREEN, quoteFullscreenMinW)}
            </ScrollView>
          </ScrollView>
        </View>
      </Modal>

      <Modal
        visible={orderDetailModalOrderNo !== null}
        transparent
        animationType="fade"
        onRequestClose={closeOrderDetailModal}
      >
        <View style={styles.orderDetailModalRoot}>
          <Pressable style={styles.orderDetailModalBackdrop} onPress={closeOrderDetailModal} />
          <View style={styles.orderDetailModalCard}>
            <View style={styles.orderDetailModalHead}>
              <Text style={styles.orderDetailModalTitle} numberOfLines={1}>
                报价明细 · {orderDetailModalOrderNo ?? ''}
              </Text>
              <Pressable accessibilityRole="button" accessibilityLabel="关闭" hitSlop={10} onPress={closeOrderDetailModal}>
                <Ionicons name="close" size={22} color="#5c6b89" />
              </Pressable>
            </View>
            {orderDetailModalLoading ? (
              <ActivityIndicator style={styles.orderDetailModalSpinner} />
            ) : (
              <QuoteDetailLinesView
                detail={
                  orderDetailModalOrderNo != null && detailCache[orderDetailModalOrderNo] !== undefined
                    ? detailCache[orderDetailModalOrderNo]
                    : orderDetailModalRow
                }
              />
            )}
          </View>
        </View>
      </Modal>
    </PageScaffold>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 10,
  },
  tabRow: {
    flexDirection: 'row',
    backgroundColor: '#e8ecf5',
    borderRadius: 10,
    padding: 4,
    gap: 4,
  },
  tabBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
  },
  tabBtnActive: {
    backgroundColor: '#fff',
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  tabBtnText: {
    fontSize: 13,
    color: '#5c6b89',
    fontWeight: '600',
  },
  tabBtnTextActive: {
    color: '#102248',
  },
  loader: {
    marginVertical: 24,
  },
  error: {
    color: '#cc2d2d',
    fontSize: 14,
  },
  summaryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  summaryCard: {
    width: '48%',
    flexGrow: 1,
    backgroundColor: '#fff',
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderLeftWidth: 3,
  },
  summaryAccentRed: { borderLeftColor: '#ff4d4f' },
  summaryAccentBlue: { borderLeftColor: '#2f68ff' },
  summaryAccentOrange: { borderLeftColor: '#fa8c16' },
  summaryAccentGreen: { borderLeftColor: '#52c41a' },
  summaryValue: {
    fontSize: 17,
    fontWeight: '700',
    color: '#102248',
  },
  summaryMoney: {
    color: '#cf1322',
  },
  summaryMeta: {
    marginTop: 4,
    fontSize: 11,
    color: '#8892a6',
    lineHeight: 14,
  },
  blockTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#102248',
    marginBottom: 12,
  },
  quoteBlockHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
    gap: 8,
  },
  quoteBlockTitle: {
    flex: 1,
    fontSize: 16,
    fontWeight: '700',
    color: '#102248',
  },
  quoteFullscreenIconBtn: {
    padding: 4,
    marginRight: -2,
  },
  quoteFullscreenRoot: {
    flex: 1,
    backgroundColor: '#fff',
  },
  quoteFullscreenToolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 12,
    minHeight: 44,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#e8ecf4',
  },
  quoteFullscreenTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#102248',
  },
  quoteFullscreenCloseBtn: {
    padding: 4,
  },
  quoteFullscreenHScroll: {
    flex: 1,
  },
  quoteFullscreenVScrollContent: {
    paddingBottom: 16,
  },
  muted: {
    color: '#8892a6',
    fontSize: 13,
  },
  shareRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    gap: 8,
  },
  shareRank: {
    width: 22,
    alignItems: 'center',
  },
  shareRankText: {
    fontWeight: '800',
    fontSize: 14,
  },
  shareBody: {
    flex: 1,
  },
  shareHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  shareName: {
    flex: 1,
    fontSize: 13,
    color: '#2b3957',
    fontWeight: '600',
  },
  shareAmt: {
    fontSize: 13,
    color: '#2b3957',
    fontWeight: '700',
  },
  sharePct: {
    fontSize: 12,
    color: '#8892a6',
    width: 52,
    textAlign: 'right',
  },
  shareTrack: {
    height: 8,
    borderRadius: 4,
    backgroundColor: '#f0f4fa',
    overflow: 'hidden',
  },
  shareFill: {
    height: '100%',
    borderRadius: 4,
    backgroundColor: '#2f68ff',
  },
  chartCardInner: {
    alignItems: 'center',
  },
  chartPlotWrap: {
    position: 'relative',
  },
  chartTooltipFloat: {
    position: 'absolute',
    width: 152,
    paddingVertical: 7,
    paddingHorizontal: 10,
    borderRadius: 8,
    backgroundColor: 'rgba(22, 33, 62, 0.94)',
    zIndex: 10,
    elevation: 8,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
  },
  chartFloatDay: {
    fontSize: 12,
    fontWeight: '700',
    color: '#fff',
  },
  chartFloatAmt: {
    marginTop: 3,
    fontSize: 13,
    fontWeight: '700',
    color: '#7eb8ff',
  },
  chartTrendHudLine: {
    marginTop: 4,
    fontSize: 12,
    fontWeight: '600',
    color: '#7eb8ff',
  },
  customerTrendLegend: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 10,
    marginBottom: 10,
  },
  customerTrendLegendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  customerTrendLegendDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  customerTrendLegendText: {
    fontSize: 11,
    color: '#5c6b89',
    fontWeight: '600',
  },
  customerAnalysisTitle: {
    marginBottom: 0,
    flexShrink: 1,
  },
  customerAnalysisHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    marginBottom: 12,
  },
  customerSegGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 8,
    backgroundColor: '#f0f4fa',
    padding: 3,
    gap: 3,
  },
  customerSegBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
  },
  customerSegBtnSmall: {
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 6,
  },
  customerSegBtnOn: {
    backgroundColor: '#fff',
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 3,
    elevation: 2,
  },
  customerSegBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#5c6b89',
  },
  customerSegBtnTextSmall: {
    fontSize: 11,
    fontWeight: '600',
    color: '#5c6b89',
  },
  customerSegBtnTextOn: {
    color: '#1890ff',
  },
  customerKpiStrip: {
    flexDirection: 'row',
    alignItems: 'stretch',
    backgroundColor: '#fafbfd',
    borderRadius: 8,
    paddingVertical: 6,
    paddingHorizontal: 6,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#e8ecf4',
  },
  customerKpiCell: {
    flex: 1,
    minWidth: 0,
  },
  customerKpiDividerV: {
    width: StyleSheet.hairlineWidth,
    backgroundColor: '#e8ecf4',
    marginHorizontal: 3,
    alignSelf: 'stretch',
  },
  customerKpiRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  customerKpiTexts: {
    flex: 1,
    minWidth: 0,
    justifyContent: 'center',
  },
  customerKpiIconWrap: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  customerKpiTitle: {
    fontSize: 9,
    color: '#8892a6',
    marginBottom: 1,
    lineHeight: 12,
  },
  customerKpiValue: {
    fontSize: 13,
    fontWeight: '800',
    lineHeight: 15,
  },
  rankingCardTitleRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    marginBottom: 4,
  },
  rankingCardTitleText: {
    marginBottom: 0,
    flexShrink: 1,
  },
  customerRankingGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: 10,
  },
  customerRankingItem: {
    width: '47%',
    flexGrow: 1,
    backgroundColor: '#fafbfd',
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#e8ecf4',
  },
  customerRankingItemHead: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    marginBottom: 10,
  },
  customerRankingBadge: {
    minWidth: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  customerRankingBadgeText: {
    color: '#fff',
    fontWeight: '800',
    fontSize: 13,
  },
  customerRankingName: {
    flex: 1,
    fontSize: 13,
    fontWeight: '700',
    color: '#2b3957',
    lineHeight: 18,
  },
  customerRankingStat: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  customerRankingStatLabel: {
    fontSize: 12,
    color: '#8892a6',
  },
  customerRankingStatValue: {
    fontSize: 13,
    fontWeight: '700',
    color: '#102248',
  },
  tableHead: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#dbe1ec',
    minWidth: 668,
  },
  tableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#f0f4fa',
    minWidth: 668,
  },
  th: {
    fontSize: 12,
    fontWeight: '700',
    color: '#5c6b89',
  },
  td: {
    fontSize: 12,
    color: '#2b3957',
  },
  tableCell: {
    justifyContent: 'center',
    paddingVertical: 2,
  },
  badge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '600',
  },
  orderNoLink: {
    color: '#2f68ff',
    fontWeight: '700',
    textDecorationLine: 'underline',
    textDecorationColor: '#aac6ff',
  },
  orderNoMuted: {
    color: '#aab4c7',
    fontWeight: '400',
    textDecorationLine: 'none',
  },
  orderDetailModalRoot: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  orderDetailModalBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  orderDetailModalCard: {
    backgroundColor: '#fff',
    borderRadius: 14,
    maxHeight: '82%',
    overflow: 'hidden',
    paddingBottom: 8,
    zIndex: 1,
    elevation: 6,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
  },
  orderDetailModalHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 10,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#e8ecf4',
    gap: 8,
  },
  orderDetailModalTitle: {
    flex: 1,
    fontSize: 16,
    fontWeight: '700',
    color: '#102248',
  },
  orderDetailModalSpinner: {
    paddingVertical: 28,
  },
  orderDetailModalScroll: {
    maxHeight: 540,
    paddingHorizontal: 8,
    paddingTop: 8,
    paddingBottom: 4,
  },
  orderDetailModalJson: {
    fontSize: 11,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    color: '#2b3957',
    lineHeight: 16,
  },
  quoteDetailError: {
    fontSize: 14,
    color: '#cf1322',
    paddingVertical: 8,
  },
  quoteDetailEmpty: {
    fontSize: 13,
    color: '#8892a6',
    marginBottom: 10,
  },
  orderDetailTableCaption: {
    fontSize: 13,
    color: '#5c6b89',
    fontWeight: '600',
    marginBottom: 10,
    paddingHorizontal: 2,
  },
  orderDetailTableHead: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 4,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#dbe1ec',
    backgroundColor: '#f4f7fc',
    minWidth: ORDER_DETAIL_TABLE_MIN_WIDTH,
  },
  orderDetailTableRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: 10,
    paddingHorizontal: 4,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#f0f4fa',
    minWidth: ORDER_DETAIL_TABLE_MIN_WIDTH,
  },
  orderDetailTh: {
    fontSize: 11,
    fontWeight: '700',
    color: '#5c6b89',
    paddingRight: 6,
  },
  orderDetailTd: {
    fontSize: 11,
    color: '#2b3957',
    paddingRight: 6,
    lineHeight: 15,
  },
  dimRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#f0f4fa',
    gap: 8,
  },
  dimLabel: {
    flex: 1,
    fontSize: 13,
    color: '#2b3957',
    fontWeight: '600',
  },
  dimSub: {
    fontSize: 11,
    color: '#8892a6',
    marginTop: 2,
  },
  dimAmt: {
    fontSize: 14,
    fontWeight: '700',
    color: '#102248',
  },
  productBarSection: {
    alignSelf: 'stretch',
    backgroundColor: '#ffffff',
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 8,
  },
  productHBarChart: {
    gap: 5,
    paddingBottom: 2,
  },
  productHBarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 20,
  },
  productHBarRankCell: {
    width: 34,
    justifyContent: 'center',
    alignItems: 'center',
    alignSelf: 'stretch',
  },
  productHBarRankPlainSlot: {
    width: 28,
    height: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  productHBarRank: {
    width: '100%',
    textAlign: 'center',
    fontSize: 11,
    fontWeight: '700',
    color: '#94a3b8',
  },
  productHBarRankBadge: {
    width: 28,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 0,
    paddingVertical: 0,
  },
  productHBarRankBadge1: {
    backgroundColor: '#fff7e6',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#ffc069',
  },
  productHBarRankBadge2: {
    backgroundColor: '#f5f5f5',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#bfbfbf',
  },
  productHBarRankBadge3: {
    backgroundColor: '#fff2e8',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#ffbb96',
  },
  productHBarRankBadgeText: {
    fontSize: 10,
    fontWeight: '800',
  },
  productHBarRankBadgeText1: {
    color: '#d48806',
  },
  productHBarRankBadgeText2: {
    color: '#595959',
  },
  productHBarRankBadgeText3: {
    color: '#d4380d',
  },
  productHBarTrackWrap: {
    flex: 1,
    marginLeft: 8,
    marginRight: 8,
  },
  productHBarTrack: {
    height: 16,
    borderRadius: 8,
    backgroundColor: '#eef2f7',
    overflow: 'hidden',
    position: 'relative',
    justifyContent: 'center',
  },
  productHBarFillAbs: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    borderRadius: 8,
    minWidth: 2,
  },
  productHBarLabelOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 6,
    zIndex: 1,
  },
  productHBarLabelText: {
    fontSize: 9,
    fontWeight: '700',
    color: '#0f172a',
    textAlign: 'center',
    width: '100%',
    paddingHorizontal: 2,
    textShadowColor: 'rgba(255,255,255,0.85)',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 2,
  },
  productHBarLabelMuted: {
    color: '#94a3b8',
    fontWeight: '500',
    textShadowRadius: 0,
  },
  productHBarAmt: {
    width: 58,
    textAlign: 'right',
    fontSize: 11,
    fontWeight: '600',
    color: '#0f172a',
  },
  productHBarAmtMuted: {
    color: '#cbd5e1',
    fontWeight: '400',
  },
});

function QuoteDetailLinesView({ detail }: { detail: unknown }) {
  const scrollProps = {
    style: styles.orderDetailModalScroll,
    nestedScrollEnabled: true as const,
    keyboardShouldPersistTaps: 'handled' as const,
  };

  const err = detailPayloadErrorMessage(detail);
  if (err) {
    return (
      <ScrollView {...scrollProps}>
        <Text style={styles.quoteDetailError}>{err}</Text>
      </ScrollView>
    );
  }

  const lines = extractProductLines(detail);
  if (lines.length === 0) {
    return (
      <ScrollView {...scrollProps}>
        <Text style={styles.quoteDetailEmpty}>未识别到产品明细结构，以下为原始 JSON（可复制）</Text>
        <Text selectable style={styles.orderDetailModalJson}>
          {detail == null ? '' : JSON.stringify(detail, null, 2)}
        </Text>
      </ScrollView>
    );
  }

  return (
    <ScrollView {...scrollProps}>
      <Text style={styles.orderDetailTableCaption}>共 {lines.length} 条产品明细 · 左右滑动查看全部列</Text>
      <ScrollView horizontal nestedScrollEnabled showsHorizontalScrollIndicator>
        <View>
          <View style={styles.orderDetailTableHead}>
            {ORDER_DETAIL_COLUMNS.map((col) => (
              <Text key={col.title} style={[styles.orderDetailTh, { width: col.width }]}>
                {col.title}
              </Text>
            ))}
          </View>
          {lines.map((line, idx) => (
            <View key={`${String(line.id ?? 'row')}-${idx}`} style={styles.orderDetailTableRow}>
              {ORDER_DETAIL_COLUMNS.map((col) => (
                <Text
                  key={`${col.title}-${idx}`}
                  style={[styles.orderDetailTd, { width: col.width }]}
                  selectable
                  numberOfLines={5}
                >
                  {col.cell(line)}
                </Text>
              ))}
            </View>
          ))}
        </View>
      </ScrollView>
    </ScrollView>
  );
}

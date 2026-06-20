import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp, NativeStackScreenProps } from '@react-navigation/native-stack';
import { Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { MainStackParamList } from '../types/navigation';
import { getQuoteOrderNo, numberFromRecord } from '../utils/mergeQuotesByOrderNo';

type QuoteRecord = Record<string, unknown>;
type QuoteTableCols = {
  idx: number;
  order: number;
  customer: number;
  money: number;
  date: number;
  status: number;
};

const QUOTE_TABLE_COLS_FULLSCREEN: QuoteTableCols = {
  idx: 46,
  order: 136,
  customer: 172,
  money: 94,
  date: 168,
  status: 102,
};

function quoteTableMinWidth(cols: QuoteTableCols, screenW: number) {
  const sum = cols.idx + cols.order + cols.customer + cols.money + cols.date + cols.status;
  return Math.max(sum, Math.round(screenW));
}

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

function getCustomerName(item: QuoteRecord): string {
  const value = item['客户名称'] ?? item.customerName ?? item.customer ?? item['客户'] ?? '未知客户';
  return String(value);
}

function getQuoteDateRaw(item: QuoteRecord): string {
  for (const key of QUOTE_DATE_FIELD_KEYS) {
    const v = item[key];
    if (v != null && String(v).trim() !== '') {
      return String(v).trim();
    }
  }
  return '';
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function formatDateTimeLocal(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(
    d.getMinutes(),
  )}:${pad2(d.getSeconds())}`;
}

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

function statusBadgeStyle(statusLabel: string): { bg: string; color: string } {
  const s = statusLabel;
  if (/已发货|已完成|出库/.test(s)) return { bg: '#f6ffed', color: '#389e0d' };
  if (/待发货|待出库|未发货/.test(s)) return { bg: '#fff7e6', color: '#d46b08' };
  if (/待报价/.test(s)) return { bg: '#fff7e6', color: '#d46b08' };
  return { bg: '#f0f5ff', color: '#2f54eb' };
}

export function QuoteDetailFullscreenScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<MainStackParamList>>();
  const route = useRoute<NativeStackScreenProps<MainStackParamList, 'QuoteDetailFullscreen'>['route']>();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const isLandscape = width > height;
  const list = route.params.list ?? [];
  const minWidth = quoteTableMinWidth(QUOTE_TABLE_COLS_FULLSCREEN, width);
  const toolbarTopPadding = isLandscape ? 8 : insets.top;
  const toolbarHorizontalPadding = 16 + Math.max(insets.left, insets.right);
  const bodyH = Math.max(280, height - toolbarTopPadding - insets.bottom - 58);

  return (
    <View style={styles.root}>
      <View
        style={[
          styles.toolbar,
          {
            paddingTop: toolbarTopPadding,
            paddingLeft: toolbarHorizontalPadding,
            paddingRight: toolbarHorizontalPadding,
          },
        ]}
      >
        <Text style={styles.title}>报价明细</Text>
        <Pressable accessibilityRole="button" hitSlop={12} onPress={() => navigation.goBack()} style={styles.closeBtn}>
          <Ionicons name="contract-outline" size={26} color="#102248" />
        </Pressable>
      </View>
      <ScrollView horizontal nestedScrollEnabled showsHorizontalScrollIndicator style={styles.hScroll}>
        <ScrollView
          nestedScrollEnabled
          showsVerticalScrollIndicator
          style={{ width: minWidth, height: bodyH }}
          contentContainerStyle={styles.vScrollContent}
        >
          <View style={{ minWidth }}>
            <View style={[styles.tableHead, { minWidth }]}>
              <Text style={[styles.th, { width: QUOTE_TABLE_COLS_FULLSCREEN.idx }]}>序号</Text>
              <Text style={[styles.th, { width: QUOTE_TABLE_COLS_FULLSCREEN.order }]}>单号</Text>
              <Text style={[styles.th, { width: QUOTE_TABLE_COLS_FULLSCREEN.customer }]}>客户名称</Text>
              <Text style={[styles.th, { width: QUOTE_TABLE_COLS_FULLSCREEN.money }]}>金额</Text>
              <Text style={[styles.th, { width: QUOTE_TABLE_COLS_FULLSCREEN.date }]}>报价日期</Text>
              <Text style={[styles.th, { width: QUOTE_TABLE_COLS_FULLSCREEN.status }]}>状态</Text>
            </View>
            {list.map((row, idx) => {
              const orderNo = String(getQuoteOrderNo(row)).trim();
              const st = formatQuoteStatusDisplay(row);
              const badge = statusBadgeStyle(st);
              return (
                <View key={`${orderNo || 'row'}-${idx}`} style={[styles.tableRow, { minWidth }]}>
                  <Text style={[styles.td, { width: QUOTE_TABLE_COLS_FULLSCREEN.idx }]}>{idx + 1}</Text>
                  <Text style={[styles.td, styles.orderNoText, { width: QUOTE_TABLE_COLS_FULLSCREEN.order }]} numberOfLines={1}>
                    {orderNo || '-'}
                  </Text>
                  <Text style={[styles.td, { width: QUOTE_TABLE_COLS_FULLSCREEN.customer }]} numberOfLines={1}>
                    {getCustomerName(row)}
                  </Text>
                  <Text style={[styles.td, { width: QUOTE_TABLE_COLS_FULLSCREEN.money }]}>
                    {numberFromRecord(row).toFixed(2)}
                  </Text>
                  <Text style={[styles.td, { width: QUOTE_TABLE_COLS_FULLSCREEN.date }]} numberOfLines={1}>
                    {formatQuoteDateDisplay(row)}
                  </Text>
                  <View style={[styles.tableCell, { width: QUOTE_TABLE_COLS_FULLSCREEN.status }]}>
                    <View style={[styles.badge, { backgroundColor: badge.bg }]}>
                      <Text style={[styles.badgeText, { color: badge.color }]}>{st || '-'}</Text>
                    </View>
                  </View>
                </View>
              );
            })}
            {list.length === 0 ? <Text style={styles.empty}>当前区间暂无报价</Text> : null}
          </View>
        </ScrollView>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#f8fafc',
  },
  toolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 12,
    backgroundColor: '#fff',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#dbe1ec',
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: '#102248',
  },
  closeBtn: {
    padding: 4,
  },
  hScroll: {
    flex: 1,
  },
  vScrollContent: {
    paddingBottom: 24,
  },
  tableHead: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#dbe1ec',
    backgroundColor: '#fff',
  },
  tableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#eef2f7',
    backgroundColor: '#fff',
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
  orderNoText: {
    color: '#2f68ff',
    fontWeight: '700',
  },
  empty: {
    paddingHorizontal: 12,
    paddingVertical: 18,
    fontSize: 13,
    color: '#8892a6',
  },
});

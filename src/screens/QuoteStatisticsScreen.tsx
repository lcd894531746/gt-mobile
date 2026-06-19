import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useDropdownMaxHeightAboveKeyboard } from '../hooks/useDropdownMaxHeightAboveKeyboard';
import { fetchQuoteData, fetchQuoteDetail, searchCustomer } from '../services/api';
import type { CustomerRow } from '../utils/offerHelpers';
import { getCustomerCommittedLabel, getCustomerDisplayName, getCustomerId, normalizeCustomers } from '../utils/offerHelpers';

type QuoteRecord = Record<string, unknown>;

const CUSTOMER_SEARCH_DEBOUNCE_MS = 320;
const PAGE_SIZE = 10;
const STATS_CUST_COMBO_SUPPRESS_MS = Platform.OS === 'android' ? 520 : 280;
const STATS_CUST_COMBO_BLUR_HIDE_DELAY_MS = Platform.OS === 'android' ? 380 : 220;

function normalizeList(raw: unknown): QuoteRecord[] {
  if (Array.isArray(raw)) return raw as QuoteRecord[];
  if (raw && typeof raw === 'object') {
    const data = (raw as { data?: unknown }).data;
    if (Array.isArray(data)) return data as QuoteRecord[];
  }
  return [];
}

function formatYmd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function orderNoOf(r: QuoteRecord): string {
  return String(r['单号'] ?? r['报价单号'] ?? '');
}

function amountOf(r: QuoteRecord): number {
  const v = Number(r['金额']);
  return Number.isFinite(v) ? v : 0;
}

function salesTimeMs(r: QuoteRecord): number {
  const raw = r['销售时间'];
  const t = raw != null ? new Date(raw as string | number).getTime() : NaN;
  return Number.isFinite(t) ? t : 0;
}

function formatSalesTime(r: QuoteRecord): string {
  const raw = r['销售时间'];
  if (raw == null || raw === '') return '—';
  const d = new Date(raw as string | number);
  if (Number.isNaN(d.getTime())) return String(raw);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function formatMoney(n: number): string {
  return `¥${Number(n).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** 与桌面 route/QuoteStatistics/index.jsx 一致 */
function calculateStatistics(quoteData: QuoteRecord[]) {
  if (!Array.isArray(quoteData) || quoteData.length === 0) {
    return {
      totalQuotes: 0,
      totalAmount: 0,
      averageAmount: 0,
      pendingCount: 0,
      shippedCount: 0,
    };
  }
  const totalQuotes = quoteData.length;
  const totalAmount = quoteData.reduce((sum, quote) => sum + amountOf(quote), 0);
  const averageAmount = totalQuotes > 0 ? totalAmount / totalQuotes : 0;
  const pendingCount = quoteData.filter((quote) => quote['状态'] === 0).length;
  const shippedCount = quoteData.filter((quote) => quote['状态'] === 1).length;
  return { totalQuotes, totalAmount, averageAmount, pendingCount, shippedCount };
}

function normalizeDetailLines(raw: unknown): QuoteRecord[] {
  if (Array.isArray(raw)) return raw as QuoteRecord[];
  if (raw && typeof raw === 'object' && Array.isArray((raw as { data?: unknown }).data)) {
    return (raw as { data: QuoteRecord[] }).data;
  }
  return [];
}

export function QuoteStatisticsScreen() {
  const insets = useSafeAreaInsets();
  const {
    wrapRef: filterCustComboWrapRef,
    measureAnchor: measureFilterCustComboAnchor,
    maxHeight: filterCustDropdownListMaxHeight,
  } = useDropdownMaxHeightAboveKeyboard(110, 44, 10);
  const todayStr = formatYmd(new Date());
  const [startDate, setStartDate] = useState(todayStr);
  const [endDate, setEndDate] = useState(todayStr);

  const [filterCustomer, setFilterCustomer] = useState<CustomerRow | null>(null);
  const [custComboFocused, setCustComboFocused] = useState(false);
  const [customerQuery, setCustomerQuery] = useState('');
  const [customerResults, setCustomerResults] = useState<CustomerRow[]>([]);
  const [customerSearching, setCustomerSearching] = useState(false);

  const custBlurTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const custComboInputRef = useRef<TextInput>(null);
  const suppressCustComboChangeRef = useRef(false);
  /** 与 state 同步：避免 onChangeText 闭包落后于刚选中的 filterCustomer */
  const filterCustomerRef = useRef<CustomerRow | null>(null);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [quoteData, setQuoteData] = useState<QuoteRecord[]>([]);
  const [statistics, setStatistics] = useState<ReturnType<typeof calculateStatistics> | null>(null);

  const [sortKey, setSortKey] = useState<'销售时间' | '金额' | null>(null);
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  const [page, setPage] = useState(1);

  const [detailOpen, setDetailOpen] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailHead, setDetailHead] = useState<QuoteRecord | null>(null);
  const [detailLines, setDetailLines] = useState<QuoteRecord[]>([]);

  const commitFilterCustomer = useCallback((row: CustomerRow | null) => {
    filterCustomerRef.current = row;
    setFilterCustomer(row);
  }, []);

  /** 已选客户的展示串（用于回填与比较）；未选时为空，不与「全部客户」占位混用 */
  const filterCustomerCommittedLabel = useMemo(
    () => getCustomerCommittedLabel(filterCustomer),
    [filterCustomer],
  );

  /** 输入框受控值：未选客户时不要用「全部客户」占位汉字作为 value，否则二次聚焦后删除键会失效（与报价管理一致） */
  const customerInputBlurredValue = filterCustomerCommittedLabel;

  const sortedRows = useMemo(() => {
    const rows = [...quoteData];
    if (sortKey === '销售时间') {
      rows.sort((a, b) =>
        sortDir === 'asc' ? salesTimeMs(a) - salesTimeMs(b) : salesTimeMs(b) - salesTimeMs(a),
      );
    } else if (sortKey === '金额') {
      rows.sort((a, b) =>
        sortDir === 'asc' ? amountOf(a) - amountOf(b) : amountOf(b) - amountOf(a),
      );
    }
    return rows;
  }, [quoteData, sortKey, sortDir]);

  const totalRows = sortedRows.length;
  const totalPages = Math.max(1, Math.ceil(totalRows / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pageSlice = useMemo(() => {
    const p = Math.min(page, totalPages);
    const start = (p - 1) * PAGE_SIZE;
    return sortedRows.slice(start, start + PAGE_SIZE);
  }, [sortedRows, page, totalPages]);

  const pageAmountSum = useMemo(() => pageSlice.reduce((s, r) => s + amountOf(r), 0), [pageSlice]);

  const loadData = useCallback(async (start: string, end: string, cust: string | null) => {
    setLoading(true);
    setError(null);
    try {
      const params: { startDate: string; endDate: string; customerId?: string } = {
        startDate: start.trim(),
        endDate: end.trim(),
      };
      if (cust && cust.trim()) {
        params.customerId = cust.trim();
      }
      const raw = await fetchQuoteData(params);
      const list = normalizeList(raw);
      setQuoteData(list);
      setStatistics(calculateStatistics(list));
      setPage(1);
    } catch (e) {
      setError(e instanceof Error ? e.message : '获取数据失败');
      setQuoteData([]);
      setStatistics(calculateStatistics([]));
    } finally {
      setLoading(false);
    }
  }, []);

  const runSearch = useCallback(() => {
    const cid = filterCustomer ? getCustomerId(filterCustomer).trim() : '';
    void loadData(startDate, endDate, cid || null);
  }, [loadData, startDate, endDate, filterCustomer]);

  useEffect(() => {
    const t = formatYmd(new Date());
    void loadData(t, t, 'all');
  }, [loadData]);

  useEffect(() => {
    if (!custComboFocused) return;
    let cancelled = false;
    const q = customerQuery.trim();
    const timer = setTimeout(() => {
      void (async () => {
        if (!q) {
          if (!cancelled) {
            setCustomerResults([]);
            setCustomerSearching(false);
          }
          return;
        }
        if (!cancelled) setCustomerSearching(true);
        try {
          const data = await searchCustomer(q);
          if (!cancelled) setCustomerResults(normalizeCustomers(data));
        } catch {
          if (!cancelled) setCustomerResults([]);
        } finally {
          if (!cancelled) setCustomerSearching(false);
        }
      })();
    }, CUSTOMER_SEARCH_DEBOUNCE_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [customerQuery, custComboFocused]);

  const clearCustBlurTimer = () => {
    if (custBlurTimer.current) clearTimeout(custBlurTimer.current);
    custBlurTimer.current = undefined;
  };

  const scheduleHideCustCombo = () => {
    if (suppressCustComboChangeRef.current) return;
    clearCustBlurTimer();
    custBlurTimer.current = setTimeout(() => {
      custBlurTimer.current = undefined;
      if (suppressCustComboChangeRef.current) return;
      // 避免下拉 ScrollView / 手势触发「假 blur」后定时器清空草稿，导致再次输入立刻被吃掉
      if (custComboInputRef.current?.isFocused?.()) {
        return;
      }
      setCustComboFocused(false);
      setCustomerQuery('');
    }, STATS_CUST_COMBO_BLUR_HIDE_DELAY_MS);
  };

  useEffect(() => {
    return () => clearCustBlurTimer();
  }, []);

  const resetCustomerComboUi = useCallback(() => {
    setCustomerQuery('');
    setCustomerResults([]);
    setCustomerSearching(false);
    setCustComboFocused(false);
    clearCustBlurTimer();
  }, []);

  const pickCustomerFilter = (row: CustomerRow | null) => {
    suppressCustComboChangeRef.current = true;
    commitFilterCustomer(row);
    clearCustBlurTimer();
    setCustComboFocused(false);
    setCustomerQuery('');
    setCustomerResults([]);
    setCustomerSearching(false);
    setTimeout(() => {
      suppressCustComboChangeRef.current = false;
    }, STATS_CUST_COMBO_SUPPRESS_MS);
  };

  const handleReset = () => {
    const t = formatYmd(new Date());
    setStartDate(t);
    setEndDate(t);
    commitFilterCustomer(null);
    resetCustomerComboUi();
    setSortKey(null);
    setSortDir('desc');
    setPage(1);
    void loadData(t, t, 'all');
  };

  const toggleSort = (key: '销售时间' | '金额') => {
    setSortKey((prev) => {
      if (prev !== key) {
        setSortDir('desc');
        return key;
      }
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
      return key;
    });
    setPage(1);
  };

  const openRowDetail = async (record: QuoteRecord) => {
    const no = orderNoOf(record);
    if (!no) return;
    setDetailOpen(true);
    setDetailLoading(true);
    setDetailHead(record);
    setDetailLines([]);
    try {
      const raw = await fetchQuoteDetail(no);
      const lines = normalizeDetailLines(raw).map((item) => ({
        品名: item['品名'] ?? '',
        规格: item['规格'] ?? '',
        数量: item['数量'] ?? 0,
        单价: item['单价'] ?? 0,
        金额: item['金额'] ?? 0,
        理论重量: item['理论重量'] ?? 0,
        总重量: item['总重量'] ?? 0,
      }));
      setDetailLines(lines as QuoteRecord[]);
    } catch {
      setDetailLines([]);
    } finally {
      setDetailLoading(false);
    }
  };

  const detailTotals = useMemo(() => {
    let amt = 0;
    let tw = 0;
    let aw = 0;
    for (const row of detailLines) {
      amt += Number(row['金额']) || 0;
      tw += Number(row['理论重量']) || 0;
      aw += Number(row['总重量']) || 0;
    }
    return { amt, tw, aw };
  }, [detailLines]);

  const TABLE_COL = {
    cust: 100,
    order: 108,
    date: 132,
    amt: 96,
    status: 72,
  } as const;
  const tableMin =
    TABLE_COL.cust + TABLE_COL.order + TABLE_COL.date + TABLE_COL.amt + TABLE_COL.status;

  return (
    <>
      <View style={[styles.screenRoot, { paddingBottom: Math.max(insets.bottom, 6) }]}>
        <View style={styles.screenHeader}>
          {statistics ? (
            <View style={styles.statStrip}>
              <View style={styles.statCell}>
                <View style={styles.statCellStack}>
                  <Text style={[styles.statLabelSm, styles.statLabelCenter]} numberOfLines={1}>
                    报价单数量
                  </Text>
                  <Text style={[styles.statValueSm, { color: '#1890ff' }, styles.statValueCenter]} numberOfLines={1}>
                    {statistics.totalQuotes}
                    <Text style={styles.statSuffixSm}> 单</Text>
                  </Text>
                </View>
              </View>
              <View style={styles.statVsep} />
              <View style={styles.statCell}>
                <View style={styles.statCellStack}>
                  <Text style={[styles.statLabelSm, styles.statLabelCenter]} numberOfLines={1}>
                    报价总金额
                  </Text>
                  <Text
                    style={[styles.statValueSm, { color: '#52c41a' }, styles.statValueCenter]}
                    numberOfLines={1}
                    adjustsFontSizeToFit
                    minimumFontScale={0.75}
                  >
                    {formatMoney(statistics.totalAmount)}
                  </Text>
                </View>
              </View>
              <View style={styles.statVsep} />
              <View style={styles.statCell}>
                <View style={styles.statCellStack}>
                  <Text style={[styles.statLabelSm, styles.statLabelCenter]} numberOfLines={1}>
                    平均单价
                  </Text>
                  <Text
                    style={[styles.statValueSm, { color: '#722ed1' }, styles.statValueCenter]}
                    numberOfLines={1}
                    adjustsFontSizeToFit
                    minimumFontScale={0.75}
                  >
                    {formatMoney(statistics.averageAmount)}
                  </Text>
                </View>
              </View>
              <View style={styles.statVsep} />
              <View style={[styles.statCell, styles.statCellShip]}>
                <View style={styles.statShipRow}>
                  <View style={styles.statShipHalf}>
                    <View style={styles.statCellStack}>
                      <Text style={[styles.statLabelSm, styles.statLabelCenter]} numberOfLines={1}>
                        未发货
                      </Text>
                      <Text style={[styles.statValueSm, { color: '#faad14' }, styles.statValueCenter]} numberOfLines={1}>
                        {statistics.pendingCount}
                      </Text>
                    </View>
                  </View>
                  <View style={styles.statShipInnerSep} />
                  <View style={styles.statShipHalf}>
                    <View style={styles.statCellStack}>
                      <Text style={[styles.statLabelSm, styles.statLabelCenter]} numberOfLines={1}>
                        已发货
                      </Text>
                      <Text style={[styles.statValueSm, { color: '#52c41a' }, styles.statValueCenter]} numberOfLines={1}>
                        {statistics.shippedCount}
                      </Text>
                    </View>
                  </View>
                </View>
              </View>
            </View>
          ) : null}

          <View style={[styles.card, custComboFocused && styles.filterCardWhenComboOpen]}>
            <View style={styles.filterRow}>
              <Text style={styles.filterLabel}>客户</Text>
              <View style={styles.filterCustomerComboOuter}>
                <View
                  ref={filterCustComboWrapRef}
                  style={styles.custComboWrap}
                  onLayout={measureFilterCustComboAnchor}
                >
                  <View
                    style={[
                      styles.custComboInputOuter,
                      custComboFocused && styles.custComboInputOuterFocused,
                    ]}
                  >
                    <TextInput
                      ref={custComboInputRef}
                      style={styles.custComboInput}
                      value={custComboFocused ? customerQuery : customerInputBlurredValue}
                      onChangeText={(t) => {
                        if (suppressCustComboChangeRef.current) return;
                        const sel = filterCustomerRef.current;
                        setCustComboFocused(true);
                        setCustomerQuery(t);
                        if (!sel) return;
                        const committed = getCustomerCommittedLabel(sel).trim();
                        const next = t.trim();
                        if (next === '') return;
                        if (committed && committed !== next && committed.startsWith(next)) return;
                        if (next !== committed) {
                          commitFilterCustomer(null);
                        }
                      }}
                      placeholder={
                        filterCustomer ? '搜索客户' : '全部客户 · 输入关键字搜索'
                      }
                      placeholderTextColor="#aab4c7"
                      autoCorrect={false}
                      autoCapitalize="none"
                      onFocus={() => {
                        clearCustBlurTimer();
                        setCustComboFocused(true);
                        setCustomerQuery(filterCustomer ? filterCustomerCommittedLabel : '');
                        requestAnimationFrame(measureFilterCustComboAnchor);
                      }}
                      onBlur={() => scheduleHideCustCombo()}
                    />
                    <Ionicons name="search-outline" size={20} color="#8892a6" />
                  </View>
                  {custComboFocused ? (
                    <View
                      style={styles.custComboDropdown}
                      collapsable={false}
                      onTouchStart={clearCustBlurTimer}
                    >
                      <TouchableOpacity
                        activeOpacity={0.65}
                        delayPressIn={0}
                        style={[styles.custComboRow, styles.custComboRowAll]}
                        onPress={() => pickCustomerFilter(null)}
                      >
                        <Text style={styles.custComboName}>全部客户</Text>
                        <Text style={styles.custComboSub}>不按客户筛选</Text>
                      </TouchableOpacity>
                      {customerSearching ? (
                        <View style={styles.custComboDropdownLoading}>
                          <ActivityIndicator />
                        </View>
                      ) : customerResults.length > 0 ? (
                        <ScrollView
                          nestedScrollEnabled
                          keyboardShouldPersistTaps="always"
                          keyboardDismissMode="none"
                          style={[
                            styles.custComboDropdownScroll,
                            { maxHeight: filterCustDropdownListMaxHeight },
                          ]}
                        >
                          {customerResults.map((item, idx) => (
                            <TouchableOpacity
                              key={`${getCustomerId(item)}-${idx}`}
                              activeOpacity={0.65}
                              delayPressIn={0}
                              style={styles.custComboRow}
                              onPress={() => pickCustomerFilter(item)}
                            >
                              <Text style={styles.custComboName} numberOfLines={2}>
                                {getCustomerDisplayName(item) || '—'}
                              </Text>
                              <Text style={styles.custComboSub}>ID {getCustomerId(item) || '—'}</Text>
                            </TouchableOpacity>
                          ))}
                        </ScrollView>
                      ) : customerQuery.trim() !== '' ? (
                        <Text style={styles.regionACHint}>暂无匹配客户</Text>
                      ) : (
                        <Text style={styles.regionACHint}>请输入关键词，远程搜索</Text>
                      )}
                    </View>
                  ) : null}
                </View>
              </View>
            </View>

            <View style={styles.filterRow}>
              <Text style={styles.filterLabel}>时段</Text>
              <View style={styles.dateRow}>
                <TextInput
                  style={styles.dateInput}
                  value={startDate}
                  onChangeText={setStartDate}
                  placeholder="开始日期"
                  placeholderTextColor="#aab4c7"
                />
                <Text style={styles.dateSep}>至</Text>
                <TextInput
                  style={styles.dateInput}
                  value={endDate}
                  onChangeText={setEndDate}
                  placeholder="结束日期"
                  placeholderTextColor="#aab4c7"
                />
              </View>
            </View>

            <View style={styles.actionsRow}>
              <Pressable style={styles.btnGhost} onPress={handleReset} disabled={loading}>
                <Text style={styles.btnGhostText}>重置</Text>
              </Pressable>
              <Pressable style={[styles.btnPrimary, loading && styles.btnDisabled]} onPress={() => void runSearch()} disabled={loading}>
                <Text style={styles.btnPrimaryText}>{loading ? '查询中…' : '查询'}</Text>
              </Pressable>
            </View>

            {error ? <Text style={styles.error}>获取数据失败：{error}</Text> : null}
          </View>

          <View style={styles.tableToolbar}>
            <Text style={styles.tableHint}>共 {totalRows} 条数据</Text>
          </View>
        </View>

        <View style={styles.tableBlock}>
          <ScrollView
            horizontal
            nestedScrollEnabled
            keyboardShouldPersistTaps="always"
            keyboardDismissMode="none"
            style={styles.tableHorizScroll}
            contentContainerStyle={styles.tableHorizContent}
            showsHorizontalScrollIndicator
          >
            <View style={[styles.tableInnerCol, { width: tableMin }]}>
              <View style={styles.trHead}>
                <Text style={[styles.th, { width: TABLE_COL.cust }]}>客户名称</Text>
                <Text style={[styles.th, { width: TABLE_COL.order }]}>报价单号</Text>
                <Pressable style={[styles.thSort, { width: TABLE_COL.date }]} onPress={() => toggleSort('销售时间')}>
                  <Text style={styles.thText}>日期</Text>
                  <Ionicons
                    name={sortKey === '销售时间' ? (sortDir === 'asc' ? 'chevron-up' : 'chevron-down') : 'reorder-four-outline'}
                    size={14}
                    color={sortKey === '销售时间' ? '#204dff' : '#94a3b8'}
                  />
                </Pressable>
                <Pressable style={[styles.thSort, { width: TABLE_COL.amt }]} onPress={() => toggleSort('金额')}>
                  <Text style={styles.thText}>金额</Text>
                  <Ionicons
                    name={sortKey === '金额' ? (sortDir === 'asc' ? 'chevron-up' : 'chevron-down') : 'reorder-four-outline'}
                    size={14}
                    color={sortKey === '金额' ? '#204dff' : '#94a3b8'}
                  />
                </Pressable>
                <Text style={[styles.th, { width: TABLE_COL.status }]}>状态</Text>
              </View>
              <ScrollView
                nestedScrollEnabled
                keyboardShouldPersistTaps="always"
                keyboardDismissMode="none"
                automaticallyAdjustKeyboardInsets
                style={styles.tableBodyScroll}
                contentContainerStyle={[
                  styles.tableBodyContent,
                  !loading && pageSlice.length === 0 ? styles.tableBodyContentEmpty : null,
                ]}
                showsVerticalScrollIndicator
              >
                {loading ? (
                  <View style={styles.tableLoading}>
                    <ActivityIndicator />
                  </View>
                ) : pageSlice.length === 0 ? (
                  <Text style={styles.emptyTable}>暂无数据</Text>
                ) : (
                  <>
                    {pageSlice.map((row, idx) => {
                      const st = row['状态'];
                      const isPending = st === 0;
                      const statusText = isPending ? '未发货' : '已发货';
                      const statusColor = isPending ? '#faad14' : '#52c41a';
                      return (
                        <Pressable
                          key={orderNoOf(row) || `r-${idx}`}
                          style={[styles.tr, idx % 2 === 1 && styles.trAlt]}
                          onPress={() => void openRowDetail(row)}
                        >
                          <Text style={[styles.td, { width: TABLE_COL.cust }]} numberOfLines={2}>
                            {String(row['客户名称'] ?? '—')}
                          </Text>
                          <Text style={[styles.tdMono, { width: TABLE_COL.order }]} numberOfLines={1}>
                            {orderNoOf(row) || '—'}
                          </Text>
                          <Text style={[styles.td, { width: TABLE_COL.date }]} numberOfLines={1}>
                            {formatSalesTime(row)}
                          </Text>
                          <Text style={[styles.td, { width: TABLE_COL.amt }]} numberOfLines={1}>
                            {formatMoney(amountOf(row))}
                          </Text>
                          <Text style={[styles.td, { width: TABLE_COL.status, color: statusColor, fontWeight: '600' }]}>
                            {statusText}
                          </Text>
                        </Pressable>
                      );
                    })}
                    <View style={styles.summaryRow}>
                      <Text style={[styles.summaryCell, { width: TABLE_COL.cust + TABLE_COL.order + TABLE_COL.date }]}>
                        本页合计
                      </Text>
                      <Text style={[styles.summaryAmt, { width: TABLE_COL.amt }]}>{formatMoney(pageAmountSum)}</Text>
                      <Text style={{ width: TABLE_COL.status }} />
                    </View>
                  </>
                )}
              </ScrollView>
            </View>
          </ScrollView>
        </View>

        {totalRows > 0 ? (
          <View style={styles.paginationRow}>
            <Pressable
              style={[styles.pageBtn, safePage <= 1 && styles.pageBtnDisabled]}
              disabled={safePage <= 1}
              onPress={() => setPage((p) => Math.max(1, p - 1))}
            >
              <Text style={styles.pageBtnText}>上一页</Text>
            </Pressable>
            <Text style={styles.pageInfo}>
              {safePage} / {totalPages}
            </Text>
            <Pressable
              style={[styles.pageBtn, safePage >= totalPages && styles.pageBtnDisabled]}
              disabled={safePage >= totalPages}
              onPress={() => setPage((p) => Math.min(totalPages, p + 1))}
            >
              <Text style={styles.pageBtnText}>下一页</Text>
            </Pressable>
          </View>
        ) : null}
      </View>

      {/* 报价单详情（桌面 Drawer） */}
      <Modal visible={detailOpen} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setDetailOpen(false)}>
        <View style={styles.detailShell}>
          <View style={styles.detailTop}>
            <Text style={styles.detailTitle}>报价单详情</Text>
            <Pressable onPress={() => setDetailOpen(false)} hitSlop={12}>
              <Text style={styles.detailClose}>关闭</Text>
            </Pressable>
          </View>
          {detailLoading ? (
            <ActivityIndicator style={{ marginTop: 24 }} />
          ) : detailHead ? (
            <ScrollView contentContainerStyle={styles.detailScroll}>
              <View style={styles.descBlock}>
                <Row label="客户名称" value={String(detailHead['客户名称'] ?? '—')} />
                <Row label="报价单号" value={orderNoOf(detailHead) || '—'} />
                <Row label="日期" value={formatSalesTime(detailHead)} />
                <Row label="金额" value={formatMoney(amountOf(detailHead))} />
                <Row
                  label="状态"
                  value={detailHead['状态'] === 0 ? '未发货' : '已发货'}
                  valueColor={detailHead['状态'] === 0 ? '#faad14' : '#52c41a'}
                />
              </View>

              <Text style={styles.detailSection}>商品明细</Text>
              <ScrollView horizontal nestedScrollEnabled showsHorizontalScrollIndicator>
                <View>
                  <View style={styles.dtrHead}>
                    <Text style={[styles.dth, { width: 88 }]}>品名</Text>
                    <Text style={[styles.dth, { width: 88 }]}>规格</Text>
                    <Text style={[styles.dth, { width: 56 }]}>数量</Text>
                    <Text style={[styles.dth, { width: 80 }]}>单价</Text>
                    <Text style={[styles.dth, { width: 88 }]}>金额</Text>
                    <Text style={[styles.dth, { width: 96 }]}>理论重量</Text>
                    <Text style={[styles.dth, { width: 96 }]}>总重量</Text>
                  </View>
                  {detailLines.map((line, i) => (
                    <View key={`dl-${i}`} style={[styles.dtr, i % 2 === 1 && styles.dtrAlt]}>
                      <Text style={[styles.dtd, { width: 88 }]} numberOfLines={2}>
                        {String(line['品名'])}
                      </Text>
                      <Text style={[styles.dtd, { width: 88 }]} numberOfLines={2}>
                        {String(line['规格'])}
                      </Text>
                      <Text style={[styles.dtd, { width: 56 }]}>{String(line['数量'])}</Text>
                      <Text style={[styles.dtd, { width: 80 }]}>{formatMoney(Number(line['单价']) || 0)}</Text>
                      <Text style={[styles.dtd, { width: 88 }]}>{formatMoney(Number(line['金额']) || 0)}</Text>
                      <Text style={[styles.dtd, { width: 96 }]}>{Number(line['理论重量'] || 0).toFixed(6)}</Text>
                      <Text style={[styles.dtd, { width: 96 }]}>{Number(line['总重量'] || 0).toFixed(6)}</Text>
                    </View>
                  ))}
                  {detailLines.length > 0 ? (
                    <View style={styles.dtrSummary}>
                      <Text style={[styles.dtd, { width: 88 + 88 + 56 + 80 }]}>合计：</Text>
                      <Text style={[styles.dtdBold, { width: 88 }]}>{formatMoney(detailTotals.amt)}</Text>
                      <Text style={[styles.dtdBold, { width: 96 }]}>{detailTotals.tw.toFixed(6)}</Text>
                      <Text style={[styles.dtdBold, { width: 96 }]}>{detailTotals.aw.toFixed(6)}</Text>
                    </View>
                  ) : null}
                </View>
              </ScrollView>

              <Text style={styles.detailSection}>备注信息</Text>
              <Text style={styles.remarkText}>{String(detailHead['备注'] ?? '') || '暂无备注'}</Text>
            </ScrollView>
          ) : null}
        </View>
      </Modal>
    </>
  );
}

function Row({
  label,
  value,
  valueColor,
}: {
  label: string;
  value: string;
  valueColor?: string;
}) {
  return (
    <View style={styles.descRow}>
      <Text style={styles.descLabel}>{label}</Text>
      <Text style={[styles.descValue, valueColor ? { color: valueColor } : null]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screenRoot: {
    flex: 1,
    backgroundColor: '#f3f5f9',
    paddingHorizontal: 8,
    paddingTop: 6,
  },
  screenHeader: {
    flexShrink: 0,
    gap: 8,
    zIndex: 20,
    elevation: 24,
  },
  tableBlock: {
    flex: 1,
    minHeight: 0,
    marginTop: 0,
    zIndex: 0,
  },
  tableHorizScroll: {
    flex: 1,
    minHeight: 0,
  },
  tableHorizContent: {
    flexGrow: 1,
  },
  tableInnerCol: {
    flex: 1,
    minHeight: 0,
  },
  tableBodyScroll: {
    flex: 1,
  },
  tableBodyContent: {
    paddingBottom: 6,
  },
  tableBodyContentEmpty: {
    flexGrow: 1,
    justifyContent: 'center',
    minHeight: 160,
  },
  statStrip: {
    flexDirection: 'row',
    alignItems: 'stretch',
    backgroundColor: '#fff',
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#e8ecf4',
    ...(Platform.OS === 'ios'
      ? { shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 6, shadowOffset: { width: 0, height: 1 } }
      : { elevation: 1 }),
  },
  statCell: {
    flex: 1,
    minWidth: 0,
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  statCellShip: {
    flex: 1.2,
    minWidth: 66,
    paddingHorizontal: 2,
  },
  statCellStack: {
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    minWidth: 0,
    gap: 2,
  },
  statLabelCenter: { textAlign: 'center', alignSelf: 'stretch' },
  statValueCenter: { textAlign: 'center', alignSelf: 'stretch' },
  statLabelSm: {
    fontSize: 10,
    color: '#64748b',
    fontWeight: '600',
    marginBottom: 0,
  },
  statValueSm: {
    fontSize: 14,
    fontWeight: '700',
  },
  statSuffixSm: {
    fontSize: 11,
    fontWeight: '600',
  },
  statVsep: {
    width: StyleSheet.hairlineWidth,
    backgroundColor: '#e2e8f0',
    marginVertical: 4,
    alignSelf: 'stretch',
  },
  statShipRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
    flex: 1,
    minWidth: 0,
    gap: 0,
  },
  statShipHalf: {
    flex: 1,
    minWidth: 0,
    justifyContent: 'center',
  },
  statShipInnerSep: {
    width: StyleSheet.hairlineWidth,
    backgroundColor: '#e8ecf4',
    marginVertical: 6,
    alignSelf: 'stretch',
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#e8ecf4',
    overflow: 'visible',
  },
  filterCardWhenComboOpen: Platform.select({
    ios: { zIndex: 80 },
    android: { zIndex: 80, elevation: 26 },
    default: { zIndex: 80 },
  }),
  filterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 5,
  },
  filterLabel: {
    width: 32,
    fontSize: 11,
    fontWeight: '700',
    color: '#64748b',
    flexShrink: 0,
  },
  filterCustomerComboOuter: {
    flex: 1,
    minWidth: 0,
    zIndex: 60,
  },
  custComboWrap: {
    position: 'relative',
    zIndex: 55,
    overflow: 'visible',
  },
  custComboInputOuter: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: StyleSheet.hairlineWidth * 2,
    borderColor: '#d8e2ef',
    borderRadius: 8,
    paddingHorizontal: 10,
    backgroundColor: '#fafbfd',
    minHeight: 36,
    gap: 6,
  },
  custComboInputOuterFocused: {
    borderColor: '#2f68ff',
    backgroundColor: '#fff',
  },
  custComboInput: {
    flex: 1,
    fontSize: 13,
    color: '#102248',
    paddingVertical: Platform.OS === 'ios' ? 8 : 6,
  },
  custComboDropdown: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: '100%',
    marginTop: 4,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    backgroundColor: '#fff',
    zIndex: 100,
    ...(Platform.OS === 'ios'
      ? {
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 4 },
          shadowOpacity: 0.14,
          shadowRadius: 10,
        }
      : { elevation: 14 }),
  },
  custComboDropdownScroll: {
    maxHeight: 110,
  },
  custComboDropdownLoading: {
    paddingVertical: 16,
    alignItems: 'center',
  },
  custComboRow: {
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#eef2f7',
  },
  custComboRowAll: {
    paddingVertical: 10,
  },
  custComboRowPressed: {
    backgroundColor: '#f1f5f9',
  },
  custComboName: {
    fontWeight: '700',
    fontSize: 14,
    color: '#102248',
  },
  custComboSub: {
    marginTop: 4,
    fontSize: 11,
    color: '#8892a6',
  },
  regionACHint: {
    paddingVertical: 12,
    paddingHorizontal: 10,
    fontSize: 12,
    color: '#8892a6',
    textAlign: 'center',
  },
  dateRow: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 4, minWidth: 0 },
  dateInput: {
    flex: 1,
    minWidth: 0,
    borderWidth: 1,
    borderColor: '#dbe1ec',
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: Platform.OS === 'android' ? 4 : 5,
    fontSize: 12,
    color: '#102248',
    backgroundColor: '#fafbfd',
  },
  dateSep: { fontSize: 11, color: '#64748b', fontWeight: '600', flexShrink: 0 },
  actionsRow: { flexDirection: 'row', gap: 6, marginTop: 2, marginBottom: 0 },
  btnGhost: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 30,
    paddingVertical: 5,
    paddingHorizontal: 8,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#c7d2e3',
    backgroundColor: '#fff',
  },
  btnGhostText: { fontSize: 12, fontWeight: '600', color: '#475569' },
  btnPrimary: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 30,
    paddingVertical: 5,
    paddingHorizontal: 8,
    borderRadius: 6,
    backgroundColor: '#2f68ff',
  },
  btnDisabled: { opacity: 0.65 },
  btnPrimaryText: { fontSize: 12, fontWeight: '700', color: '#fff' },
  error: { marginTop: 6, color: '#dc2626', fontSize: 11 },
  tableToolbar: {
    flexDirection: 'row',
    justifyContent: 'flex-start',
    alignItems: 'center',
    paddingHorizontal: 2,
    marginTop: 0,
    marginBottom: 0,
  },
  tableHint: { fontSize: 12, color: '#64748b' },
  trHead: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f1f5f9',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(100, 116, 139, 0.38)',
  },
  th: {
    paddingVertical: 10,
    paddingHorizontal: 4,
    fontSize: 11,
    fontWeight: '700',
    color: '#475569',
    textAlign: 'center',
    borderRightWidth: StyleSheet.hairlineWidth,
    borderRightColor: 'rgba(100, 116, 139, 0.28)',
  },
  thSort: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: 10,
    paddingHorizontal: 4,
    borderRightWidth: StyleSheet.hairlineWidth,
    borderRightColor: 'rgba(100, 116, 139, 0.28)',
  },
  thText: { fontSize: 11, fontWeight: '700', color: '#475569' },
  tr: { flexDirection: 'row', alignItems: 'center', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#eef2f7' },
  trAlt: { backgroundColor: '#fafbfd' },
  td: {
    paddingVertical: 10,
    paddingHorizontal: 4,
    fontSize: 11,
    color: '#1e293b',
    textAlign: 'center',
    borderRightWidth: StyleSheet.hairlineWidth,
    borderRightColor: 'rgba(100, 116, 139, 0.2)',
  },
  tdMono: {
    paddingVertical: 10,
    paddingHorizontal: 4,
    fontSize: 10,
    color: '#334155',
    textAlign: 'center',
    borderRightWidth: StyleSheet.hairlineWidth,
    borderRightColor: 'rgba(100, 116, 139, 0.2)',
  },
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f8fafc',
    borderTopWidth: 2,
    borderTopColor: '#e2e8f0',
  },
  summaryCell: {
    paddingVertical: 10,
    fontSize: 12,
    fontWeight: '700',
    color: '#475569',
    textAlign: 'center',
    borderRightWidth: StyleSheet.hairlineWidth,
    borderRightColor: 'rgba(100, 116, 139, 0.2)',
  },
  summaryAmt: {
    paddingVertical: 10,
    fontSize: 12,
    fontWeight: '700',
    color: '#52c41a',
    textAlign: 'center',
    borderRightWidth: StyleSheet.hairlineWidth,
    borderRightColor: 'rgba(100, 116, 139, 0.2)',
  },
  tableLoading: { paddingVertical: 32, alignItems: 'center' },
  emptyTable: { paddingVertical: 40, textAlign: 'center', color: '#94a3b8', fontSize: 14 },
  paginationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
    flexShrink: 0,
    marginTop: 8,
    paddingBottom: 2,
  },
  pageBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#c7d2e3',
    backgroundColor: '#fff',
  },
  pageBtnDisabled: { opacity: 0.4 },
  pageBtnText: { fontSize: 14, fontWeight: '600', color: '#334155' },
  pageInfo: { fontSize: 14, fontWeight: '700', color: '#102248' },
  detailShell: { flex: 1, backgroundColor: '#f3f5f9' },
  detailTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: '#fff',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#e2e8f0',
  },
  detailTitle: { fontSize: 18, fontWeight: '700', color: '#102248' },
  detailClose: { fontSize: 16, fontWeight: '600', color: '#204dff' },
  detailScroll: { padding: 14, gap: 14 },
  descBlock: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#e8ecf4',
  },
  descRow: {
    flexDirection: 'row',
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#f1f5f9',
    gap: 8,
  },
  descLabel: { width: 88, fontSize: 13, color: '#64748b', fontWeight: '600' },
  descValue: { flex: 1, fontSize: 14, color: '#102248', fontWeight: '600' },
  detailSection: { fontSize: 15, fontWeight: '700', color: '#102248', marginTop: 4 },
  dtrHead: { flexDirection: 'row', backgroundColor: '#f1f5f9', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#cbd5e1' },
  dth: {
    paddingVertical: 8,
    fontSize: 10,
    fontWeight: '700',
    color: '#475569',
    textAlign: 'center',
    borderRightWidth: StyleSheet.hairlineWidth,
    borderRightColor: '#e2e8f0',
  },
  dtr: { flexDirection: 'row', alignItems: 'center', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#f1f5f9' },
  dtrAlt: { backgroundColor: '#fafbfd' },
  dtd: {
    paddingVertical: 8,
    paddingHorizontal: 2,
    fontSize: 10,
    color: '#334155',
    textAlign: 'center',
    borderRightWidth: StyleSheet.hairlineWidth,
    borderRightColor: '#f1f5f9',
  },
  dtrSummary: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f8fafc',
    borderTopWidth: 2,
    borderTopColor: '#e2e8f0',
  },
  dtdBold: {
    paddingVertical: 8,
    fontSize: 11,
    fontWeight: '700',
    color: '#102248',
    textAlign: 'center',
    borderRightWidth: StyleSheet.hairlineWidth,
    borderRightColor: '#f1f5f9',
  },
  remarkText: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 14,
    fontSize: 14,
    color: '#475569',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#e8ecf4',
  },
});

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { PageScaffold } from '../components/PageScaffold';
import { AddCustomerModal } from '../components/AddCustomerModal';
import {
  createQuote,
  deleteQuote,
  fetchQuoteDetail,
  fetchUnshippedQuotes,
  getFormulas,
} from '../services/api';
import type { CustomerRow } from '../utils/offerHelpers';
import { getCustomerId } from '../utils/offerHelpers';

type FormulaOpt = {
  name: string;
  unit: string;
  parameters: string;
};

type DraftLine = {
  key: string;
  品名: string;
  材质: string;
  规格: string;
  单位: string;
  数量: string;
  槽重: string;
  槽价: string;
  盖重: string;
  盖价: string;
  称重单价: string;
};

function normalizeFormulas(raw: unknown): FormulaOpt[] {
  const list = Array.isArray(raw)
    ? raw
    : raw && typeof raw === 'object' && Array.isArray((raw as { data?: unknown }).data)
      ? ((raw as { data: unknown[] }).data as unknown[])
      : [];
  return list.map((item) => {
    const row = item as Record<string, unknown>;
    return {
      name: String(row['品名'] ?? row.name ?? ''),
      unit: String(row['单位'] ?? row.unit ?? '米'),
      parameters: String(row['参数'] ?? row.parameters ?? ''),
    };
  }).filter((x) => x.name.trim() !== '');
}

function normalizeUnshippedQuotes(raw: unknown): Record<string, unknown>[] {
  if (Array.isArray(raw)) return raw as Record<string, unknown>[];
  if (raw && typeof raw === 'object' && Array.isArray((raw as { data?: unknown }).data)) {
    return (raw as { data: Record<string, unknown>[] }).data;
  }
  return [];
}

function normalizeQuoteDetailLines(raw: unknown): Record<string, unknown>[] {
  if (Array.isArray(raw)) return raw as Record<string, unknown>[];
  if (raw && typeof raw === 'object' && Array.isArray((raw as { data?: unknown }).data)) {
    return (raw as { data: Record<string, unknown>[] }).data;
  }
  return [];
}

function quoteDetailToDraftLine(item: Record<string, unknown>): DraftLine {
  return {
    key: genLineKey(),
    品名: String(item['品名'] ?? ''),
    材质: String(item['材质'] ?? item.material ?? ''),
    规格: String(item['规格'] ?? ''),
    单位: String(item['单位'] ?? '米'),
    数量: String(item['数量'] ?? ''),
    槽重: String(item['重量1'] ?? ''),
    槽价: String(item['单价1'] ?? ''),
    盖重: String(item['重量2'] ?? ''),
    盖价: String(item['单价2'] ?? ''),
    称重单价: String(item['称重单价'] ?? ''),
  };
}

function formatQuoteCellNum(v: unknown, digits: number): string {
  const n = typeof v === 'number' ? v : Number(v);
  return (Number.isFinite(n) ? n : 0).toFixed(digits);
}

function formatQuoteTime(v: unknown): string {
  if (v == null || v === '') return '—';
  const d = new Date(v as string | number | Date);
  if (Number.isNaN(d.getTime())) return String(v);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function genLineKey(): string {
  return `L-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function toFixedOrZero(value: string, digits: number): string {
  const n = Number(value || 0);
  return (Number.isFinite(n) ? n : 0).toFixed(digits);
}

/** 表格列宽（横向滚动） */
const COL = {
  idx: 36,
  name: 96,
  material: 78,
  spec: 88,
  unit: 40,
  qty: 48,
  w1: 56,
  p1: 52,
  w2: 56,
  p2: 52,
  del: 44,
} as const;

const TABLE_MIN =
  COL.idx +
  COL.name +
  COL.material +
  COL.spec +
  COL.unit +
  COL.qty +
  COL.w1 +
  COL.p1 +
  COL.w2 +
  COL.p2 +
  COL.del;

export function OfferScreen() {
  const insets = useSafeAreaInsets();
  const [formulas, setFormulas] = useState<FormulaOpt[]>([]);
  const [formulasLoading, setFormulasLoading] = useState(false);

  const [customerIdText, setCustomerIdText] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [contactPerson, setContactPerson] = useState('');

  const [addCustomerModalVisible, setAddCustomerModalVisible] = useState(false);

  const [lines, setLines] = useState<DraftLine[]>([]);
  const [addProductName, setAddProductName] = useState('');
  const [addScalePrice, setAddScalePrice] = useState('');
  const [addMaterial, setAddMaterial] = useState('');
  const [addSpec, setAddSpec] = useState('');

  const [formulaPickerVisible, setFormulaPickerVisible] = useState(false);

  /** 填写产品：选择品名 / 过磅价 / 规格（弹窗） */
  const [addProductModalVisible, setAddProductModalVisible] = useState(false);

  const [saving, setSaving] = useState(false);

  /** 对应桌面端 Drawer「未发货订单」 */
  const [unshippedModalVisible, setUnshippedModalVisible] = useState(false);
  const [unshippedQuotes, setUnshippedQuotes] = useState<Record<string, unknown>[]>([]);
  const [unshippedLoading, setUnshippedLoading] = useState(false);
  const [expandedQuoteNo, setExpandedQuoteNo] = useState<string | null>(null);
  const [expandedDetailLines, setExpandedDetailLines] = useState<Record<string, unknown>[]>([]);
  const [expandedDetailLoading, setExpandedDetailLoading] = useState(false);
  /** 从「未发货订单」编辑回填时记录单号，保存时 isEdit 传 true */
  const [editingQuoteNo, setEditingQuoteNo] = useState<string | null>(null);

  const totals = useMemo(() => {
    let qtySum = 0;
    let amtSum = 0;
    for (const line of lines) {
      const q = Number(line.数量 || 0);
      const u1 = Number(line.槽价 || 0);
      const u2 = Number(line.盖价 || 0);
      qtySum += Number.isFinite(q) ? q : 0;
      if (Number.isFinite(q) && Number.isFinite(u1) && Number.isFinite(u2)) {
        amtSum += q * (u1 + u2);
      }
    }
    return { qtySum, amtSum };
  }, [lines]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setFormulasLoading(true);
      try {
        const raw = await getFormulas();
        if (!cancelled) setFormulas(normalizeFormulas(raw));
      } catch {
        if (!cancelled) setFormulas([]);
      } finally {
        if (!cancelled) setFormulasLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const fillCustomerFromRow = useCallback((row: CustomerRow) => {
    setCustomerIdText(getCustomerId(row));
    setContactPhone(String(row['客户电话'] ?? row['联系电话'] ?? row.phone ?? row.mobile ?? ''));
    setContactPerson(String(row['客户代表'] ?? row['联系人'] ?? row.contact ?? ''));
  }, []);

  const resetCustomerFields = useCallback(() => {
    setCustomerIdText('');
    setContactPhone('');
    setContactPerson('');
  }, []);

  const clearWorkspace = useCallback(() => {
    resetCustomerFields();
    setLines([]);
    setAddProductName('');
    setAddScalePrice('');
    setAddMaterial('');
    setAddSpec('');
    setEditingQuoteNo(null);
    setAddProductModalVisible(false);
    setFormulaPickerVisible(false);
    setUnshippedModalVisible(false);
    setExpandedQuoteNo(null);
    setExpandedDetailLines([]);
    setExpandedDetailLoading(false);
    setAddCustomerModalVisible(false);
  }, [resetCustomerFields]);

  /** 每次进入「报价」Tab 均重置为新建空白单（切换 Tab 离开再回来不保留上次编辑） */
  const isFirstFocus = useRef(true);
  useFocusEffect(
    useCallback(() => {
      if (isFirstFocus.current) {
        isFirstFocus.current = false;
        return;
      }
      clearWorkspace();
    }, [clearWorkspace]),
  );

  const loadUnshippedList = async () => {
    setUnshippedLoading(true);
    try {
      const raw = await fetchUnshippedQuotes();
      setUnshippedQuotes(normalizeUnshippedQuotes(raw));
    } catch {
      Alert.alert('失败', '获取未发货报价单失败');
      setUnshippedQuotes([]);
    } finally {
      setUnshippedLoading(false);
    }
  };

  const openUnshippedModal = () => {
    setUnshippedModalVisible(true);
    setExpandedQuoteNo(null);
    setExpandedDetailLines([]);
    void loadUnshippedList();
  };

  const loadExpandedDetail = async (orderNo: string) => {
    setExpandedDetailLoading(true);
    setExpandedDetailLines([]);
    try {
      const raw = await fetchQuoteDetail(orderNo);
      setExpandedDetailLines(normalizeQuoteDetailLines(raw));
    } catch {
      Alert.alert('失败', '获取报价单明细失败');
    } finally {
      setExpandedDetailLoading(false);
    }
  };

  const toggleExpandQuote = (orderNo: string) => {
    if (!orderNo) return;
    if (expandedQuoteNo === orderNo) {
      setExpandedQuoteNo(null);
      setExpandedDetailLines([]);
      return;
    }
    setExpandedQuoteNo(orderNo);
    void loadExpandedDetail(orderNo);
  };

  const handleEditQuoteFromUnshipped = async (quote: Record<string, unknown>) => {
    const orderNo = String(quote['报价单号'] ?? '');
    if (!orderNo) return;
    try {
      const raw = await fetchQuoteDetail(orderNo);
      const details = normalizeQuoteDetailLines(raw);

      const custRow = {
        客户编号: String(quote['客户ID'] ?? ''),
        客户名称: String(quote['客户名称'] ?? ''),
      } as CustomerRow;
      fillCustomerFromRow(custRow);
      setContactPhone(String(quote['联系电话'] ?? ''));
      setContactPerson(String(quote['联系人'] ?? ''));

      setLines(details.map((item) => quoteDetailToDraftLine(item)));
      setEditingQuoteNo(orderNo);
      setUnshippedModalVisible(false);
      setExpandedQuoteNo(null);
      setExpandedDetailLines([]);
    } catch {
      Alert.alert('失败', '加载报价单详情失败');
    }
  };

  const handleDeleteQuoteFromUnshipped = (quote: Record<string, unknown>) => {
    const orderNo = String(quote['报价单号'] ?? '');
    if (!orderNo) return;
    Alert.alert('确认删除', '您确定要删除这个报价单吗？此操作不可恢复。', [
      { text: '取消', style: 'cancel' },
      {
        text: '确定',
        style: 'destructive',
        onPress: () =>
          void (async () => {
            try {
              const data = await deleteQuote(orderNo);
              const s = data && typeof data === 'object' ? (data as { success?: unknown }).success : undefined;
              const ok = s === true || s === 1 || s === 'true';
              if (ok) {
                Alert.alert('成功', '报价单删除成功');
                await loadUnshippedList();
              } else {
                const err =
                  data && typeof data === 'object'
                    ? String((data as { error?: string }).error ?? '')
                    : '';
                Alert.alert('失败', err || '删除失败');
              }
            } catch {
              Alert.alert('失败', '删除报价单失败');
            }
          })(),
      },
    ]);
  };

  const updateLine = (key: string, patch: Partial<DraftLine>) => {
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  };

  const removeLine = (key: string) => {
    setLines((prev) => prev.filter((l) => l.key !== key));
  };

  const resetAddProductDraft = () => {
    setAddMaterial('');
    setAddSpec('');
    setAddScalePrice('');
  };

  /** @returns 是否已成功写入一行明细 */
  const commitAddProductLine = (): boolean => {
    const f = formulas.find((x) => x.name === addProductName);
    if (!f) {
      Alert.alert('提示', '请选择产品');
      return false;
    }
    if (!addScalePrice.trim()) {
      Alert.alert('提示', '请填写过磅价（称重单价）');
      return false;
    }
    if (!addMaterial.trim()) {
      Alert.alert('提示', '请填写材质');
      return false;
    }
    if (!addSpec.trim()) {
      Alert.alert('提示', '请填写规格');
      return false;
    }
    setLines((prev) => [
      ...prev,
      {
        key: genLineKey(),
        品名: f.name,
        材质: addMaterial.trim(),
        规格: addSpec.trim(),
        单位: f.unit || '米',
        数量: '1',
        槽重: '',
        槽价: '',
        盖重: '',
        盖价: '',
        称重单价: addScalePrice.trim(),
      },
    ]);
    setAddMaterial('');
    setAddSpec('');
    return true;
  };

  const handleSaveQuote = async () => {
    if (!customerIdText.trim()) {
      Alert.alert('提示', '请填写客户');
      return;
    }
    if (lines.length === 0) {
      Alert.alert('提示', '请添加至少一行产品');
      return;
    }

    for (const line of lines) {
      const qty = Number(line.数量 || 0);
      const u1 = Number(line.槽价 || 0);
      const u2 = Number(line.盖价 || 0);
      if (!String(line.数量 ?? '').trim() || !Number.isFinite(qty) || qty <= 0) {
        Alert.alert('提示', '请填写完整的数量');
        return;
      }
      if (!Number.isFinite(u1 + u2) || u1 + u2 <= 0) {
        Alert.alert('提示', '请填写槽价、盖价（单价）');
        return;
      }
    }

    const 产品信息 = lines.map((line) => {
      const qty = Number(line.数量 || 0);
      const u1 = Number(line.槽价 || 0);
      const u2 = Number(line.盖价 || 0);
      const w1 = Number(line.槽重 || 0);
      const w2 = Number(line.盖重 || 0);
      const amount = qty * (u1 + u2);
      const unitPrice = qty > 0 ? amount / qty : 0;
      return {
        品名: line.品名.trim(),
        材质: line.材质.trim(),
        规格: line.规格.trim(),
        单位: line.单位.trim(),
        数量: toFixedOrZero(line.数量, 2),
        单价: unitPrice.toFixed(2),
        金额: amount.toFixed(2),
        理论重量: (w1 + w2).toFixed(6),
        总重量: (w1 + w2).toFixed(4),
        备注: '',
        重量1: toFixedOrZero(line.槽重, 6),
        重量2: toFixedOrZero(line.盖重, 6),
        重量3: '0.000000',
        单价1: toFixedOrZero(line.槽价, 2),
        单价2: toFixedOrZero(line.盖价, 2),
        单价3: '0.00',
        称重单价: line.称重单价.trim(),
      };
    });

    const receivable = 产品信息.reduce((s, p) => s + Number(p.金额 || 0), 0);

    try {
      setSaving(true);
      const payload: Record<string, unknown> = {
        客户ID: customerIdText.trim(),
        产品信息,
        应收金额: receivable,
        isEdit: Boolean(editingQuoteNo),
      };
      // 与桌面 PrintModal.jsx 提交字段一致（post /createQuote）
      if (editingQuoteNo) {
        payload['单号'] = editingQuoteNo;
      }
      const data = await createQuote(payload);
      const body = data && typeof data === 'object' ? (data as Record<string, unknown>) : undefined;
      const s = body?.success;
      if (s === false || s === 'false' || s === 0) {
        const msg = String(body?.message ?? body?.error ?? '保存失败');
        Alert.alert('失败', msg);
        return;
      }
      Alert.alert('成功', '报价已保存');
      clearWorkspace();
    } catch (e) {
      Alert.alert('失败', e instanceof Error ? e.message : '保存失败');
    } finally {
      setSaving(false);
    }
  };

  return (
    <PageScaffold omitOuterScrollView>
      <ScrollView
        style={styles.pageScroll}
        contentContainerStyle={styles.pageScrollContent}
        keyboardShouldPersistTaps="always"
        keyboardDismissMode="none"
        nestedScrollEnabled={Platform.OS === 'android'}
        removeClippedSubviews={false}
      >
        {/* 客户信息 */}
        <View style={styles.card}>
          <View style={styles.sectionTitleRow}>
            <Text style={[styles.sectionTitle, styles.sectionTitleInRow]}>客户信息</Text>
            <Pressable
              style={styles.unshippedHeaderBtn}
              onPress={openUnshippedModal}
              accessibilityRole="button"
              accessibilityLabel="未发货订单"
            >
              <Ionicons name="list-outline" size={15} color="#204dff" />
              <Text style={styles.unshippedHeaderBtnText}>未发货订单</Text>
            </Pressable>
          </View>
          <View style={styles.customerNameRow}>
            <Text style={[styles.fieldLabel, styles.customerNameLabelInline]}>
              <Text style={styles.required}>* </Text>客户
            </Text>
            <Pressable onPress={() => setAddCustomerModalVisible(true)} hitSlop={8}>
              <Text style={styles.addCustomerBtn}>添加客户</Text>
            </Pressable>
          </View>
          <TextInput
            style={styles.input}
            value={customerIdText}
            onChangeText={setCustomerIdText}
            placeholder="填写客户"
            placeholderTextColor="#aab4c7"
            keyboardType="default"
            autoCapitalize="none"
            autoCorrect={false}
          />
          <Text style={styles.fieldLabel}>联系电话</Text>
          <TextInput
            style={styles.input}
            value={contactPhone}
            onChangeText={setContactPhone}
            placeholder="联系电话"
            placeholderTextColor="#aab4c7"
            keyboardType="phone-pad"
          />
          <Text style={styles.fieldLabel}>联系人</Text>
          <TextInput
            style={styles.input}
            value={contactPerson}
            onChangeText={setContactPerson}
            placeholder="联系人"
            placeholderTextColor="#aab4c7"
          />
          {editingQuoteNo ? (
            <Text style={styles.editingQuoteHint}>正在编辑报价单：{editingQuoteNo}</Text>
          ) : null}
        </View>

        {/* 产品明细表 */}
        <View style={styles.card}>
          <View style={styles.sectionTitleRow}>
            <Text style={[styles.sectionTitle, styles.sectionTitleInRow]}>产品明细</Text>
            <Pressable
              style={({ pressed }) => [
                styles.addProductHeaderBtn,
                pressed && styles.addProductHeaderBtnPressed,
              ]}
              onPress={() => setAddProductModalVisible(true)}
              hitSlop={10}
              accessibilityRole="button"
              accessibilityLabel="添加产品"
            >
              <Ionicons name="add-circle-outline" size={15} color="#204dff" />
              <Text style={styles.addProductHeaderBtnText}>添加产品</Text>
            </Pressable>
          </View>
          {lines.length === 0 ? (
            <Text style={styles.emptyHint}>暂无明细，请点击「添加产品」，在弹窗中填写后加入一行</Text>
          ) : (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator
              nestedScrollEnabled
              keyboardShouldPersistTaps="always"
              keyboardDismissMode="none"
            >
              <View style={{ minWidth: TABLE_MIN }}>
                <View style={styles.tableHead}>
                  <Text style={[styles.th, { width: COL.idx }]}>序号</Text>
                  <Text style={[styles.th, { width: COL.name }]}>品名</Text>
                  <Text style={[styles.th, { width: COL.material }]}>材质</Text>
                  <Text style={[styles.th, { width: COL.spec }]}>规格</Text>
                  <Text style={[styles.th, { width: COL.unit }]}>单位</Text>
                  <Text style={[styles.th, { width: COL.qty }]}>数量</Text>
                  <Text style={[styles.th, { width: COL.w1 }]}>槽重</Text>
                  <Text style={[styles.th, { width: COL.p1 }]}>槽价</Text>
                  <Text style={[styles.th, { width: COL.w2 }]}>盖重</Text>
                  <Text style={[styles.th, { width: COL.p2 }]}>盖价</Text>
                  <Text style={[styles.th, { width: COL.del }]} />
                </View>
                {lines.map((line, index) => (
                  <View key={line.key} style={[styles.tableRow, index % 2 === 1 && styles.tableRowAlt]}>
                    <Text style={[styles.td, styles.tdCenter, { width: COL.idx }]}>{index + 1}</Text>
                    <Text style={[styles.td, { width: COL.name }]} numberOfLines={2}>
                      {line.品名}
                    </Text>
                    <Text style={[styles.td, { width: COL.material }]} numberOfLines={2}>
                      {line.材质 || '-'}
                    </Text>
                    <Text style={[styles.td, { width: COL.spec }]} numberOfLines={2}>
                      {line.规格}
                    </Text>
                    <Text style={[styles.td, styles.tdCenter, { width: COL.unit }]}>{line.单位}</Text>
                    <View style={[styles.tdInputCell, { width: COL.qty }]}>
                      <TextInput
                        style={styles.tdInput}
                        value={line.数量}
                        onChangeText={(t) => updateLine(line.key, { 数量: t })}
                        underlineColorAndroid="transparent"
                        keyboardType="decimal-pad"
                        placeholder="0"
                        placeholderTextColor="#8b95aa"
                        selectionColor="#204dff"
                      />
                    </View>
                    <View style={[styles.tdInputCell, { width: COL.w1 }]}>
                      <TextInput
                        style={styles.tdInput}
                        value={line.槽重}
                        onChangeText={(t) => updateLine(line.key, { 槽重: t })}
                        underlineColorAndroid="transparent"
                        keyboardType="decimal-pad"
                        placeholder="0"
                        placeholderTextColor="#8b95aa"
                        selectionColor="#204dff"
                      />
                    </View>
                    <View style={[styles.tdInputCell, { width: COL.p1 }]}>
                      <TextInput
                        style={styles.tdInput}
                        value={line.槽价}
                        onChangeText={(t) => updateLine(line.key, { 槽价: t })}
                        underlineColorAndroid="transparent"
                        keyboardType="decimal-pad"
                        placeholder="0"
                        placeholderTextColor="#8b95aa"
                        selectionColor="#204dff"
                      />
                    </View>
                    <View style={[styles.tdInputCell, { width: COL.w2 }]}>
                      <TextInput
                        style={styles.tdInput}
                        value={line.盖重}
                        onChangeText={(t) => updateLine(line.key, { 盖重: t })}
                        underlineColorAndroid="transparent"
                        keyboardType="decimal-pad"
                        placeholder="0"
                        placeholderTextColor="#8b95aa"
                        selectionColor="#204dff"
                      />
                    </View>
                    <View style={[styles.tdInputCell, { width: COL.p2 }]}>
                      <TextInput
                        style={styles.tdInput}
                        value={line.盖价}
                        onChangeText={(t) => updateLine(line.key, { 盖价: t })}
                        underlineColorAndroid="transparent"
                        keyboardType="decimal-pad"
                        placeholder="0"
                        placeholderTextColor="#8b95aa"
                        selectionColor="#204dff"
                      />
                    </View>
                    <Pressable style={[styles.delCell, { width: COL.del }]} onPress={() => removeLine(line.key)}>
                      <Text style={styles.delText}>删</Text>
                    </Pressable>
                  </View>
                ))}
              </View>
            </ScrollView>
          )}
          <View style={styles.totalRow}>
            <Text style={styles.totalText}>合计数量：{totals.qtySum.toFixed(2)}</Text>
            <Text style={styles.totalText}>合计金额：{totals.amtSum.toFixed(2)}</Text>
          </View>
          <Text style={styles.totalHint}>金额按「数量 × (槽价 + 盖价)」汇总；保存时写入单价/金额/重量字段。</Text>
          <Pressable
            style={({ pressed }) => [
              styles.saveBtn,
              saving && styles.saveBtnDisabled,
              pressed && !saving && styles.saveBtnPressed,
            ]}
            onPress={() => void handleSaveQuote()}
            disabled={saving}
          >
            <Text style={styles.saveBtnText}>{saving ? '保存中…' : '保存'}</Text>
          </Pressable>
        </View>

      </ScrollView>

      <AddCustomerModal
        visible={addCustomerModalVisible}
        onRequestClose={() => setAddCustomerModalVisible(false)}
        onSaved={({ row, nameSaved }) => {
          const picked = Boolean(row);
          if (row) fillCustomerFromRow(row);
          Alert.alert('成功', picked ? '客户已添加，并已填入当前报价' : '客户已添加，请在报价页填写客户');
        }}
      />

      <Modal
        visible={unshippedModalVisible}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setUnshippedModalVisible(false)}
      >
        <View style={styles.unshippedModalShell}>
          <View style={styles.unshippedModalTop}>
            <Text style={styles.unshippedModalTitle}>未发货订单列表</Text>
            <Pressable onPress={() => setUnshippedModalVisible(false)} hitSlop={12}>
              <Text style={styles.unshippedModalClose}>关闭</Text>
            </Pressable>
          </View>
          {unshippedLoading ? (
            <View style={styles.unshippedLoading}>
              <ActivityIndicator />
              <Text style={styles.unshippedLoadingText}>加载中…</Text>
            </View>
          ) : (
            <FlatList
              style={{ flex: 1 }}
              data={unshippedQuotes}
              keyExtractor={(item, index) => `${String(item['报价单号'] ?? index)}`}
              contentContainerStyle={styles.unshippedListContent}
              ListEmptyComponent={<Text style={styles.unshippedEmpty}>暂无未发货订单</Text>}
              renderItem={({ item, index }) => {
                const orderNo = String(item['报价单号'] ?? '');
                const expanded = expandedQuoteNo === orderNo;
                const amtRaw = item['应收金额'];
                const amt =
                  amtRaw != null && amtRaw !== ''
                    ? `¥${Number(amtRaw).toFixed(2)}`
                    : '—';
                const timeRaw = item['报价时间'];
                const timeStr = timeRaw != null && timeRaw !== '' ? formatQuoteTime(timeRaw) : '—';
                return (
                  <View style={styles.unshippedCard}>
                    <View style={styles.unshippedCardRow}>
                      <Text style={styles.unshippedIdx}>{index + 1}</Text>
                      <View style={styles.unshippedCardBody}>
                        <View style={styles.unshippedTitleRow}>
                          <Text style={styles.unshippedCustomerName} numberOfLines={2}>
                            {String(item['客户名称'] ?? '—')}
                          </Text>
                          <Text style={styles.unshippedOrderNoRight} numberOfLines={2}>
                            {orderNo || '—'}
                          </Text>
                        </View>
                        <View style={styles.unshippedMetaBelow}>
                          <Text style={styles.unshippedAmtText}>{amt}</Text>
                          <Text style={styles.unshippedTimeText}>{timeStr}</Text>
                        </View>
                        <View style={styles.unshippedActions}>
                          <Pressable style={styles.unshippedLinkBtn} onPress={() => void handleEditQuoteFromUnshipped(item)}>
                            <Text style={styles.unshippedLinkText}>编辑</Text>
                          </Pressable>
                          <Pressable style={styles.unshippedLinkBtn} onPress={() => toggleExpandQuote(orderNo)}>
                            <Text style={styles.unshippedLinkText}>{expanded ? '收起' : '展开'}</Text>
                          </Pressable>
                          <Pressable style={styles.unshippedDangerBtn} onPress={() => handleDeleteQuoteFromUnshipped(item)}>
                            <Text style={styles.unshippedDangerText}>删除</Text>
                          </Pressable>
                        </View>
                      </View>
                    </View>
                    {expanded ? (
                      <View style={styles.unshippedExpanded}>
                        {expandedDetailLoading ? (
                          <ActivityIndicator />
                        ) : expandedDetailLines.length === 0 ? (
                          <Text style={styles.unshippedEmpty}>无明细</Text>
                        ) : (
                          expandedDetailLines.map((row, ri) => (
                            <View key={`d-${orderNo}-${ri}`} style={styles.detailLineRow}>
                              <Text style={styles.detailLineMain} numberOfLines={2}>
                                {[
                                  String(row['品名'] ?? ''),
                                  String(row['材质'] ?? row.material ?? ''),
                                  String(row['规格'] ?? ''),
                                ].filter((part) => part.trim() !== '').join(' · ')}
                              </Text>
                              <Text style={styles.detailLineSub}>
                                数量 {formatQuoteCellNum(row['数量'], 2)} · 单价 {formatQuoteCellNum(row['单价'], 2)} · 金额{' '}
                                {formatQuoteCellNum(row['金额'], 2)}
                              </Text>
                              <Text style={styles.detailLineSub}>
                                理论重量 {formatQuoteCellNum(row['理论重量'], 4)} · 总重量 {formatQuoteCellNum(row['总重量'], 4)}
                              </Text>
                              {row['备注'] != null && String(row['备注']) !== '' ? (
                                <Text style={styles.detailLineSub}>备注 {String(row['备注'])}</Text>
                              ) : null}
                            </View>
                          ))
                        )}
                      </View>
                    ) : null}
                  </View>
                );
              }}
            />
          )}
        </View>
      </Modal>

      <Modal
        visible={addProductModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setAddProductModalVisible(false)}
      >
        <View style={styles.addProductModalOuter}>
          <Pressable style={styles.addProductModalBackdropFlex} onPress={() => setAddProductModalVisible(false)} />
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            style={styles.addProductModalKb}
          >
            <View
              style={[
                styles.addProductModalSheet,
                {
                  maxHeight: Dimensions.get('window').height * 0.92,
                  paddingBottom: Math.max(insets.bottom, 14) + 16,
                },
              ]}
            >
            <View style={styles.addProductModalHeader}>
              <Text style={styles.addProductModalTitle}>填写产品</Text>
              <Pressable onPress={() => setAddProductModalVisible(false)} hitSlop={12}>
                <Text style={styles.addProductModalClose}>关闭</Text>
              </Pressable>
            </View>
            <ScrollView
              keyboardShouldPersistTaps="always"
              keyboardDismissMode="none"
              showsVerticalScrollIndicator={false}
              bounces={false}
              contentContainerStyle={styles.addProductModalScrollContent}
            >
              <Text style={styles.fieldLabel}>
                <Text style={styles.required}>* </Text>选择产品
              </Text>
              <Pressable style={styles.customerPickBtn} onPress={() => setFormulaPickerVisible(true)}>
                <Text style={addProductName ? styles.customerPickText : styles.customerPickPlaceholder}>
                  {addProductName
                    ? addProductName
                    : formulasLoading
                      ? '加载产品列表…'
                      : '请选择产品'}
                </Text>
              </Pressable>
              <Text style={styles.fieldLabel}>
                <Text style={styles.required}>* </Text>过磅价（称重单价）
              </Text>
              <TextInput
                style={styles.input}
                value={addScalePrice}
                onChangeText={setAddScalePrice}
                placeholder="如 6.50/6.40/6.30"
                placeholderTextColor="#aab4c7"
              />
              <Text style={styles.fieldLabel}>
                <Text style={styles.required}>* </Text>材质
              </Text>
              <TextInput
                style={styles.input}
                value={addMaterial}
                onChangeText={setAddMaterial}
                placeholder="材质"
                placeholderTextColor="#aab4c7"
              />
              <Text style={styles.fieldLabel}>
                <Text style={styles.required}>* </Text>规格
              </Text>
              <TextInput
                style={styles.input}
                value={addSpec}
                onChangeText={setAddSpec}
                placeholder="规格"
                placeholderTextColor="#aab4c7"
              />
              <View style={styles.addProductModalActions}>
                <Pressable
                  style={[styles.addProductModalBtn, styles.addProductModalBtnGhost]}
                  onPress={() => setAddProductModalVisible(false)}
                >
                  <Text style={styles.addProductModalBtnGhostText}>取消</Text>
                </Pressable>
                <Pressable
                  style={[styles.addProductModalBtn, styles.addProductModalBtnPrimary]}
                  onPress={resetAddProductDraft}
                >
                  <Text style={styles.addProductModalBtnPrimaryText}>重置表单</Text>
                </Pressable>
                <Pressable
                  style={[styles.addProductModalBtn, styles.addProductModalBtnConfirm]}
                  onPress={() => {
                    if (commitAddProductLine()) {
                      setAddProductModalVisible(false);
                    }
                  }}
                >
                  <Text style={styles.addProductModalBtnConfirmText}>添加</Text>
                </Pressable>
              </View>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
        </View>
      </Modal>

      <Modal visible={formulaPickerVisible} transparent animationType="fade" onRequestClose={() => setFormulaPickerVisible(false)}>
        <View style={styles.formulaModalWrap}>
          <Pressable style={styles.formulaModalBackdrop} onPress={() => setFormulaPickerVisible(false)} />
          <View style={styles.pickerSheet}>
            <Text style={styles.modalTitle}>选择产品</Text>
            <FlatList
              data={formulas}
              keyExtractor={(item, index) => `${item.name}-${item.unit}-${item.parameters}-${index}`}
              style={styles.formulaList}
              renderItem={({ item }) => (
                <Pressable
                  style={styles.formulaRow}
                  onPress={() => {
                    setAddProductName(item.name);
                    setFormulaPickerVisible(false);
                  }}
                >
                  <Text style={styles.formulaName}>{item.name}</Text>
                  <Text style={styles.formulaSub}>{item.unit} · {item.parameters || '—'}</Text>
                </Pressable>
              )}
              ListEmptyComponent={<Text style={styles.empty}>暂无产品公式，请先在「产品」中维护</Text>}
            />
          </View>
        </View>
      </Modal>

    </PageScaffold>
  );
}

/** 表格分割线：在浅色/深色背景下都不会像纯白描边那样刺眼 */
const TABLE_BORDER_ROW = 'rgba(100, 116, 139, 0.38)';
const TABLE_BORDER_CELL = 'rgba(100, 116, 139, 0.32)';
const TABLE_BORDER_HEAD = 'rgba(100, 116, 139, 0.45)';

const styles = StyleSheet.create({
  pageScroll: {
    flex: 1,
  },
  pageScrollContent: {
    paddingBottom: 24,
    gap: 12,
  },
  unshippedHeaderBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    backgroundColor: 'rgba(32, 77, 255, 0.08)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(32, 77, 255, 0.28)',
  },
  unshippedHeaderBtnText: {
    color: '#204dff',
    fontWeight: '600',
    fontSize: 12,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#e8ecf4',
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#102248',
    marginBottom: 12,
  },
  sectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 12,
  },
  sectionTitleInRow: {
    flex: 1,
    marginBottom: 0,
  },
  addProductHeaderBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    backgroundColor: 'rgba(32, 77, 255, 0.08)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(32, 77, 255, 0.28)',
  },
  addProductHeaderBtnPressed: {
    opacity: 0.88,
    backgroundColor: 'rgba(32, 77, 255, 0.14)',
  },
  addProductHeaderBtnText: {
    color: '#204dff',
    fontWeight: '600',
    fontSize: 12,
  },
  fieldLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#3d4f72',
    marginBottom: 6,
    marginTop: 4,
  },
  customerNameRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 12,
    marginTop: 4,
  },
  customerNameLabelInline: {
    flex: 1,
    marginTop: 0,
    marginBottom: 6,
  },
  addCustomerBtn: {
    fontSize: 14,
    fontWeight: '700',
    color: '#204dff',
    paddingVertical: 2,
  },
  required: {
    color: '#e53935',
  },
  input: {
    borderWidth: 1,
    borderColor: '#dbe1ec',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 10,
    fontSize: 15,
    color: '#102248',
    backgroundColor: '#fafbfd',
    marginBottom: 4,
  },
  /** 客户简称：只读，随客户名称自动生成 */
  inputReadonly: {
    justifyContent: 'center',
    minHeight: 44,
    borderColor: '#e8ecf4',
    backgroundColor: '#f1f5f9',
  },
  inputReadonlyText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#475569',
  },
  inputReadonlyPlaceholder: {
    fontWeight: '400',
    color: '#aab4c7',
  },
  customerPickBtn: {
    borderWidth: 1,
    borderColor: '#dbe1ec',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 12,
    backgroundColor: '#fafbfd',
    marginBottom: 8,
  },
  customerPickText: {
    fontSize: 15,
    color: '#102248',
    fontWeight: '600',
  },
  customerPickPlaceholder: {
    fontSize: 15,
    color: '#aab4c7',
  },
  editingQuoteHint: {
    marginTop: 8,
    fontSize: 13,
    fontWeight: '600',
    color: '#b45309',
  },
  unshippedModalShell: {
    flex: 1,
    backgroundColor: '#f3f5f9',
    paddingHorizontal: 12,
    paddingBottom: 16,
  },
  unshippedModalTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#dbe1ec',
    marginBottom: 10,
  },
  unshippedModalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#102248',
  },
  unshippedModalClose: {
    fontSize: 16,
    fontWeight: '600',
    color: '#204dff',
  },
  unshippedLoading: {
    paddingVertical: 40,
    alignItems: 'center',
    gap: 10,
  },
  unshippedLoadingText: {
    color: '#64748b',
  },
  unshippedListContent: {
    paddingBottom: 24,
    gap: 8,
  },
  unshippedEmpty: {
    textAlign: 'center',
    color: '#8892a6',
    paddingVertical: 24,
  },
  unshippedCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#e8ecf4',
  },
  /** 左侧序号 + 右侧整块（名称/单号/金额时间/操作），金额与名称左缘对齐 */
  unshippedCardRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  unshippedCardBody: {
    flex: 1,
    minWidth: 0,
    gap: 4,
  },
  unshippedTitleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  unshippedIdx: {
    fontSize: 13,
    fontWeight: '700',
    color: '#64748b',
    minWidth: 22,
    paddingTop: 2,
  },
  unshippedCustomerName: {
    flex: 1,
    minWidth: 0,
    fontSize: 15,
    fontWeight: '700',
    color: '#102248',
  },
  unshippedOrderNoRight: {
    flexShrink: 0,
    maxWidth: '42%',
    fontSize: 12,
    fontWeight: '600',
    color: '#334155',
    textAlign: 'right',
  },
  unshippedMetaBelow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 2,
    gap: 10,
  },
  unshippedAmtText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0f172a',
    flexShrink: 0,
  },
  unshippedTimeText: {
    fontSize: 12,
    color: '#64748b',
    flex: 1,
    textAlign: 'right',
  },
  unshippedActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'flex-end',
    alignItems: 'center',
    gap: 14,
    marginTop: 4,
  },
  unshippedLinkBtn: {
    paddingVertical: 4,
  },
  unshippedLinkText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#204dff',
  },
  unshippedDangerBtn: {
    paddingVertical: 4,
  },
  unshippedDangerText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#dc2626',
  },
  unshippedExpanded: {
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#eef2f7',
    gap: 8,
  },
  detailLineRow: {
    paddingVertical: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#f1f5f9',
    gap: 4,
  },
  detailLineMain: {
    fontSize: 13,
    fontWeight: '600',
    color: '#1e293b',
  },
  detailLineSub: {
    fontSize: 11,
    color: '#64748b',
  },
  emptyHint: {
    color: '#8892a6',
    paddingVertical: 16,
    textAlign: 'center',
  },
  tableHead: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f1f5f9',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: TABLE_BORDER_HEAD,
  },
  th: {
    paddingVertical: 8,
    paddingHorizontal: 4,
    fontSize: 11,
    fontWeight: '700',
    color: '#475569',
    borderRightWidth: StyleSheet.hairlineWidth,
    borderRightColor: TABLE_BORDER_CELL,
  },
  tableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: TABLE_BORDER_ROW,
  },
  tableRowAlt: {
    backgroundColor: '#fafbfd',
  },
  td: {
    paddingVertical: 6,
    paddingHorizontal: 4,
    fontSize: 11,
    color: '#1e293b',
    borderRightWidth: StyleSheet.hairlineWidth,
    borderRightColor: TABLE_BORDER_CELL,
  },
  tdCenter: {
    textAlign: 'center',
  },
  tdInputCell: {
    paddingHorizontal: 4,
    paddingVertical: 4,
    borderRightWidth: StyleSheet.hairlineWidth,
    borderRightColor: TABLE_BORDER_CELL,
    justifyContent: 'center',
  },
  tdInput: {
    width: '100%',
    paddingVertical: 6,
    paddingHorizontal: 6,
    fontSize: 12,
    fontWeight: '600',
    color: '#102248',
    /** 勿用纯白底，否则会与斑马纹行 / 深色主题下的表格脱节，出现「一块白板」 */
    backgroundColor: '#f8fbff',
    minHeight: 36,
    textAlign: 'center',
    /** 去掉输入格外框，避免出现半截「白线」（尤其 Android / Web 默认样式） */
    borderWidth: 1,
    borderColor: 'rgba(32, 77, 255, 0.28)',
    borderRadius: 8,
    ...Platform.select({
      web: {
        outlineWidth: 0,
      },
      default: {},
    }),
  },
  delCell: {
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 8,
  },
  delText: {
    color: '#dc2626',
    fontWeight: '700',
    fontSize: 12,
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 12,
    paddingVertical: 8,
  },
  totalText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#102248',
  },
  totalHint: {
    fontSize: 11,
    color: '#8892a6',
    marginBottom: 10,
  },
  saveBtn: {
    minHeight: 40,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 10,
    backgroundColor: '#204dff',
    justifyContent: 'center',
    alignItems: 'center',
    alignSelf: 'stretch',
    ...(Platform.OS === 'ios'
      ? {
          shadowColor: '#204dff',
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 0.2,
          shadowRadius: 5,
        }
      : { elevation: 2 }),
  },
  saveBtnPressed: {
    opacity: 0.92,
    transform: [{ scale: 0.99 }],
  },
  saveBtnDisabled: {
    opacity: 0.55,
    ...(Platform.OS === 'ios'
      ? {
          shadowOpacity: 0,
          shadowRadius: 0,
        }
      : { elevation: 0 }),
  },
  saveBtnText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 14,
    letterSpacing: 0.2,
  },
  addProductModalOuter: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  addProductModalBackdropFlex: {
    flex: 1,
  },
  addProductModalKb: {
    width: '100%',
  },
  addProductModalSheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingHorizontal: 16,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#e8ecf4',
  },
  addProductModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
    paddingBottom: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#eef2f7',
  },
  addProductModalTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#102248',
  },
  addProductModalClose: {
    fontSize: 16,
    fontWeight: '600',
    color: '#204dff',
  },
  addProductModalScrollContent: {
    paddingTop: 4,
    paddingBottom: 4,
  },
  addProductModalActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: 18,
    paddingTop: 14,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#eef2f7',
  },
  addProductModalBtn: {
    flexGrow: 1,
    flexBasis: '28%',
    minHeight: 44,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 8,
  },
  addProductModalBtnGhost: {
    borderWidth: 1,
    borderColor: '#c7d2e3',
    backgroundColor: '#fff',
  },
  addProductModalBtnGhostText: {
    color: '#475569',
    fontWeight: '600',
    fontSize: 14,
  },
  addProductModalBtnPrimary: {
    borderWidth: 1,
    borderColor: '#93c5fd',
    backgroundColor: '#eff6ff',
  },
  addProductModalBtnPrimaryText: {
    color: '#1d4ed8',
    fontWeight: '700',
    fontSize: 14,
  },
  addProductModalBtnConfirm: {
    backgroundColor: '#2f68ff',
  },
  addProductModalBtnConfirmText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 14,
  },
  loadHistBtn: {
    marginTop: 8,
    height: 40,
    borderRadius: 8,
    backgroundColor: '#eef5ff',
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadHistBtnText: {
    color: '#204dff',
    fontWeight: '700',
  },
  count: {
    marginTop: 8,
    color: '#536182',
    fontSize: 13,
  },
  error: {
    color: '#cc2d2d',
    marginTop: 6,
  },
  listScroll: {
    maxHeight: 260,
    marginTop: 8,
  },
  listItem: {
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#e8ecf4',
  },
  itemTitle: {
    fontWeight: '700',
    color: '#101c37',
  },
  itemSub: {
    marginTop: 4,
    color: '#536182',
    fontSize: 13,
  },
  empty: {
    padding: 16,
    color: '#8892a6',
    textAlign: 'center',
  },
  modalMask: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.35)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: 16,
    maxHeight: '75%',
  },
  modalTitle: {
    fontWeight: '700',
    fontSize: 17,
    marginBottom: 12,
    color: '#102248',
  },
  addCustomerTitle: {
    marginBottom: 0,
  },
  addCustomerKb: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  addCustomerSheet: {
    maxHeight: '88%',
  },
  addCustomerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  addCustomerScroll: {
    maxHeight: 420,
  },
  addCustBlock: {
    marginBottom: 14,
  },
  addCustLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  addCustLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: '#102248',
  },
  regionRow: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'flex-start',
  },
  regionACWrap: {
    flex: 1,
    minWidth: 0,
    position: 'relative',
    overflow: 'visible',
  },
  regionACWrapProvince: {},
  regionACWrapCity: {},
  regionACWrapDistrict: {},
  regionDDLTrigger: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#dbe1ec',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: Platform.OS === 'ios' ? 8 : 6,
    backgroundColor: '#fafbfd',
    gap: 4,
    minHeight: 40,
  },
  regionDDLTriggerFocused: {
    borderColor: '#2f68ff',
    backgroundColor: '#fff',
  },
  regionDDLTriggerDisabled: {
    opacity: 0.45,
  },
  regionDDLText: {
    flex: 1,
    fontSize: 13,
    color: '#102248',
  },
  regionDDLPlaceholder: {
    color: '#aab4c7',
  },
  regionPickList: {
    maxHeight: 360,
  },
  regionPickRow: {
    paddingVertical: 12,
    paddingHorizontal: 4,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#eef2f7',
  },
  regionPickRowPressed: {
    backgroundColor: '#f1f5f9',
  },
  regionPickRowText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#102248',
  },
  regionACHint: {
    paddingVertical: 14,
    paddingHorizontal: 10,
    fontSize: 13,
    color: '#8892a6',
    textAlign: 'center',
  },
  addressArea: {
    minHeight: 88,
    paddingTop: 10,
    marginBottom: 2,
  },
  addressCounter: {
    alignSelf: 'flex-end',
    fontSize: 11,
    color: '#8892a6',
  },
  addCustomerFooter: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 8,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#e8ecf4',
  },
  addCustCancelBtn: {
    flex: 1,
    height: 44,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#b8c3d8',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#fff',
  },
  addCustCancelBtnText: {
    color: '#334155',
    fontWeight: '600',
    fontSize: 15,
  },
  addCustConfirmBtn: {
    flex: 1,
    height: 44,
    borderRadius: 8,
    backgroundColor: '#2f68ff',
    justifyContent: 'center',
    alignItems: 'center',
  },
  addCustConfirmBtnText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 15,
  },
  pickerSheet: {
    backgroundColor: '#fff',
    marginHorizontal: 16,
    borderRadius: 14,
    padding: 14,
    maxHeight: '70%',
    width: '92%',
    alignSelf: 'center',
  },
  formulaModalWrap: {
    flex: 1,
    justifyContent: 'center',
  },
  formulaModalBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  formulaList: {
    maxHeight: 360,
  },
  formulaRow: {
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#eef2f7',
  },
  formulaName: {
    fontWeight: '700',
    color: '#102248',
  },
  formulaSub: {
    marginTop: 4,
    fontSize: 12,
    color: '#8892a6',
  },
  detailSheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: 16,
    maxHeight: '82%',
  },
  detailTableWrap: {
    marginVertical: 10,
    maxHeight: 280,
  },
  jsonScroll: {
    maxHeight: 220,
    marginVertical: 8,
  },
  jsonText: {
    fontSize: 11,
    color: '#334155',
  },
  closePrimary: {
    height: 44,
    borderRadius: 8,
    backgroundColor: '#102248',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 8,
  },
  closePrimaryText: {
    color: '#fff',
    fontWeight: '700',
  },
  deleteHistBtn: {
    marginTop: 10,
    height: 42,
    justifyContent: 'center',
    alignItems: 'center',
  },
  deleteHistBtnText: {
    color: '#dc2626',
    fontWeight: '700',
  },
});

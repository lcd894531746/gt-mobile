import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { PageScaffold } from '../components/PageScaffold';
import { addFormula, deleteFormula, getFormulas, updateFormula } from '../services/api';

const CALC_METHOD_OPTIONS = ['四舍五入', '向上取整', '向下取整'] as const;

/** 表格列宽（横向滚动总宽） */
const TW = {
  idx: 44,
  name: 116,
  parameters: 132,
  unit: 56,
  formula: 268,
  priceDec: 80,
  weightDec: 80,
  calc: 92,
  actions: 96,
} as const;

const TABLE_MIN_WIDTH =
  TW.idx +
  TW.name +
  TW.parameters +
  TW.unit +
  TW.formula +
  TW.priceDec +
  TW.weightDec +
  TW.calc +
  TW.actions;

function normalizeCalcMethod(raw: string): string {
  const t = raw.trim();
  if ((CALC_METHOD_OPTIONS as readonly string[]).includes(t)) return t;
  return '四舍五入';
}

type FormulaItem = {
  name: string;
  parameters: string;
  unit: string;
  formula: string;
  priceDecimal: number;
  weightDecimal: number;
  calculationMethod: string;
  priceCoefficient?: number;
};

function normalizeList(raw: unknown): FormulaItem[] {
  const list = Array.isArray(raw)
    ? raw
    : raw && typeof raw === 'object' && Array.isArray((raw as { data?: unknown }).data)
      ? ((raw as { data: unknown[] }).data as unknown[])
      : [];

  return list.map((item) => {
    const row = item as Record<string, unknown>;
    const parametersRaw = String(row['参数'] ?? row.parameters ?? '');
    return {
      name: String(row['品名'] ?? row.name ?? ''),
      parameters: parametersRaw,
      unit: String(row['单位'] ?? row.unit ?? ''),
      formula: String(row['公式'] ?? row.formula ?? ''),
      priceDecimal: Number(row['单价小数位'] ?? row.priceDecimal ?? 2),
      weightDecimal: Number(row['重量小数位'] ?? row.weightDecimal ?? 6),
      calculationMethod: String(row['计算方式'] ?? row.calculationMethod ?? '四舍五入'),
      priceCoefficient: Number(row.priceCoefficient ?? 1),
    };
  });
}

export function DesScreen() {
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<FormulaItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingItem, setEditingItem] = useState<FormulaItem | null>(null);
  const [formName, setFormName] = useState('');
  const [formParameters, setFormParameters] = useState('');
  const [formUnit, setFormUnit] = useState('');
  const [formFormula, setFormFormula] = useState('');
  const [formPriceDecimal, setFormPriceDecimal] = useState('2');
  const [formWeightDecimal, setFormWeightDecimal] = useState('6');
  const [formCalcMethod, setFormCalcMethod] = useState('四舍五入');
  const [calcPickerOpen, setCalcPickerOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const handleLoad = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getFormulas();
      setItems(normalizeList(data));
    } catch (e) {
      setError(e instanceof Error ? e.message : '加载失败');
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void handleLoad();
  }, [handleLoad]);

  const currentTitle = useMemo(() => (editingItem ? '编辑公式' : '新增公式'), [editingItem]);

  const openCreate = () => {
    setEditingItem(null);
    setFormName('');
    setFormParameters('');
    setFormUnit('');
    setFormFormula('');
    setFormPriceDecimal('2');
    setFormWeightDecimal('6');
    setFormCalcMethod('四舍五入');
    setCalcPickerOpen(false);
    setModalVisible(true);
  };

  const openEdit = (item: FormulaItem) => {
    setEditingItem(item);
    setFormName(item.name);
    setFormParameters(item.parameters);
    setFormUnit(item.unit);
    setFormFormula(item.formula);
    setFormPriceDecimal(String(item.priceDecimal || 2));
    setFormWeightDecimal(String(item.weightDecimal || 6));
    setFormCalcMethod(normalizeCalcMethod(item.calculationMethod || '四舍五入'));
    setCalcPickerOpen(false);
    setModalVisible(true);
  };

  const closeModal = () => {
    setModalVisible(false);
    setSaving(false);
    setCalcPickerOpen(false);
  };

  const submitFormula = async () => {
    if (!formName.trim()) {
      Alert.alert('提示', '品名不能为空');
      return;
    }
    if (!formParameters.trim()) {
      Alert.alert('提示', '参数不能为空');
      return;
    }
    if (!formUnit.trim()) {
      Alert.alert('提示', '计量单位不能为空');
      return;
    }
    if (!formFormula.trim()) {
      Alert.alert('提示', '计算公式不能为空');
      return;
    }

    setSaving(true);
    try {
      const payload = {
        parameters: formParameters.trim(),
        formula: formFormula.trim(),
        unit: formUnit.trim(),
        priceCoefficient: 1,
        priceDecimal: Number(formPriceDecimal || 2),
        weightDecimal: Number(formWeightDecimal || 6),
        calculationMethod: normalizeCalcMethod(formCalcMethod.trim() || '四舍五入'),
      };

      if (editingItem) {
        await updateFormula({
          name: editingItem.name,
          newName: formName.trim(),
          ...payload,
        });
      } else {
        await addFormula({
          name: formName.trim(),
          ...payload,
        });
      }

      closeModal();
      await handleLoad();
    } catch (e) {
      Alert.alert('失败', e instanceof Error ? e.message : '保存失败');
      setSaving(false);
    }
  };

  const removeFormula = async (item: FormulaItem) => {
    if (!item.name) {
      Alert.alert('失败', '缺少公式ID');
      return;
    }
    try {
      await deleteFormula(item.name);
      await handleLoad();
    } catch (e) {
      Alert.alert('失败', e instanceof Error ? e.message : '删除失败');
    }
  };

  const confirmRemove = (item: FormulaItem) => {
    Alert.alert('确认删除', `确定删除「${item.name || '该项'}」吗？`, [
      { text: '取消', style: 'cancel' },
      { text: '删除', style: 'destructive', onPress: () => void removeFormula(item) },
    ]);
  };

  return (
    <PageScaffold title="产品配置">
      <View style={styles.toolbar}>
        <View style={styles.toolbarLead}>
          {loading ? <ActivityIndicator size="small" color="#2f68ff" /> : null}
        </View>
        <View style={styles.toolbarBtns}>
          <Pressable
            style={({ pressed }) => [styles.toolBtnGhost, pressed && styles.toolBtnPressed, loading && styles.toolBtnDisabled]}
            onPress={() => void handleLoad()}
            disabled={loading}
            accessibilityRole="button"
            accessibilityLabel="刷新列表"
          >
            <Ionicons name="refresh-outline" size={18} color="#3d4f72" />
            <Text style={styles.toolBtnGhostText}>刷新</Text>
          </Pressable>
          <Pressable
            style={({ pressed }) => [styles.toolBtnPrimary, pressed && styles.toolBtnPressed]}
            onPress={openCreate}
            accessibilityRole="button"
            accessibilityLabel="新增公式"
          >
            <Ionicons name="add-outline" size={18} color="#fff" />
            <Text style={styles.toolBtnPrimaryText}>新增</Text>
          </Pressable>
        </View>
      </View>
      {error ? <Text style={styles.errorBanner}>接口异常：{error}</Text> : null}
      <View style={styles.card}>
        {loading && items.length === 0 ? (
          <View style={styles.tableLoading}>
            <ActivityIndicator color="#2f68ff" />
            <Text style={styles.tableLoadingText}>加载中…</Text>
          </View>
        ) : items.length === 0 ? (
          <Text style={styles.tableEmpty}>暂无产品公式数据</Text>
        ) : (
          <ScrollView horizontal showsHorizontalScrollIndicator nestedScrollEnabled>
            <View style={[styles.tableSheet, { minWidth: TABLE_MIN_WIDTH }]}>
              <View style={styles.tableHeadRow}>
                <Text style={[styles.th, { width: TW.idx }]}>序号</Text>
                <Text style={[styles.th, { width: TW.name }]}>品名</Text>
                <Text style={[styles.th, { width: TW.parameters }]}>参数</Text>
                <Text style={[styles.th, { width: TW.unit }]}>单位</Text>
                <Text style={[styles.th, { width: TW.formula }]}>公式</Text>
                <Text style={[styles.th, { width: TW.priceDec }]}>单价小数位</Text>
                <Text style={[styles.th, { width: TW.weightDec }]}>重量小数位</Text>
                <Text style={[styles.th, { width: TW.calc }]}>计算方式</Text>
                <Text style={[styles.th, styles.thLast, { width: TW.actions }]}>操作</Text>
              </View>
              {items.map((item, index) => (
                <View
                  key={`${item.name}-${index}`}
                  style={[styles.tableBodyRow, index % 2 === 1 && styles.tableBodyRowAlt]}
                >
                  <Text style={[styles.td, styles.tdCenter, { width: TW.idx }]}>{index + 1}</Text>
                  <Text style={[styles.td, { width: TW.name }]} numberOfLines={3}>
                    {item.name || '—'}
                  </Text>
                  <Text style={[styles.td, { width: TW.parameters }]} numberOfLines={3}>
                    {item.parameters || '—'}
                  </Text>
                  <Text style={[styles.td, styles.tdCenter, { width: TW.unit }]} numberOfLines={2}>
                    {item.unit || '—'}
                  </Text>
                  <Text style={[styles.td, styles.tdFormula, { width: TW.formula }]} numberOfLines={4}>
                    {item.formula || '—'}
                  </Text>
                  <Text style={[styles.td, styles.tdCenter, { width: TW.priceDec }]}>
                    {item.priceDecimal ?? '—'}
                  </Text>
                  <Text style={[styles.td, styles.tdCenter, { width: TW.weightDec }]}>
                    {item.weightDecimal ?? '—'}
                  </Text>
                  <Text style={[styles.td, styles.tdCenter, { width: TW.calc }]} numberOfLines={2}>
                    {normalizeCalcMethod(item.calculationMethod)}
                  </Text>
                  <View style={[styles.tdOps, { width: TW.actions }]}>
                    <Pressable style={styles.opEditBtn} onPress={() => openEdit(item)}>
                      <Text style={styles.opEditBtnText}>修改</Text>
                    </Pressable>
                    <Pressable onPress={() => confirmRemove(item)} hitSlop={6}>
                      <Text style={styles.opDelText}>删除</Text>
                    </Pressable>
                  </View>
                </View>
              ))}
            </View>
          </ScrollView>
        )}
      </View>

      <Modal visible={modalVisible} transparent animationType="slide" onRequestClose={closeModal}>
        <View style={styles.mask}>
          <Pressable style={styles.maskBackdrop} onPress={closeModal} accessibilityLabel="关闭弹窗" />
          <View style={styles.modal}>
            <Text style={styles.modalTitle}>{currentTitle}</Text>
            <ScrollView
              style={styles.modalScroll}
              contentContainerStyle={styles.modalScrollContent}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              <View style={styles.field}>
                <Text style={styles.label}>
                  <Text style={styles.required}>* </Text>品名
                </Text>
                <TextInput
                  style={styles.input}
                  value={formName}
                  onChangeText={setFormName}
                  placeholder="请输入"
                  placeholderTextColor="#aab4c7"
                />
              </View>
              <View style={styles.field}>
                <Text style={styles.label}>
                  <Text style={styles.required}>* </Text>参数
                </Text>
                <TextInput
                  style={styles.input}
                  value={formParameters}
                  onChangeText={setFormParameters}
                  placeholder="如：边长*边高*厚度"
                  placeholderTextColor="#aab4c7"
                />
              </View>
              <View style={styles.field}>
                <Text style={styles.label}>
                  <Text style={styles.required}>* </Text>计量单位
                </Text>
                <TextInput
                  style={styles.input}
                  value={formUnit}
                  onChangeText={setFormUnit}
                  placeholder="如：支、米、吨"
                  placeholderTextColor="#aab4c7"
                />
              </View>
              <View style={styles.field}>
                <Text style={styles.label}>
                  <Text style={styles.required}>* </Text>单价小数位
                </Text>
                <TextInput
                  style={styles.input}
                  value={formPriceDecimal}
                  onChangeText={setFormPriceDecimal}
                  placeholder="如：2"
                  placeholderTextColor="#aab4c7"
                  keyboardType="numeric"
                />
              </View>
              <View style={styles.field}>
                <Text style={styles.label}>
                  <Text style={styles.required}>* </Text>重量小数位
                </Text>
                <TextInput
                  style={styles.input}
                  value={formWeightDecimal}
                  onChangeText={setFormWeightDecimal}
                  placeholder="如：6"
                  placeholderTextColor="#aab4c7"
                  keyboardType="numeric"
                />
              </View>
              <View style={styles.field}>
                <Text style={styles.label}>
                  <Text style={styles.required}>* </Text>计算方式
                </Text>
                <Pressable
                  style={[styles.selectBox, calcPickerOpen && styles.selectBoxOpen]}
                  onPress={() => setCalcPickerOpen((o) => !o)}
                  accessibilityRole="button"
                  accessibilityLabel="计算方式"
                >
                  <Text style={styles.selectBoxText}>{formCalcMethod}</Text>
                  <Ionicons name={calcPickerOpen ? 'chevron-up' : 'chevron-down'} size={18} color="#64748b" />
                </Pressable>
                {calcPickerOpen ? (
                  <View style={styles.selectMenu}>
                    {CALC_METHOD_OPTIONS.map((opt, idx) => (
                      <Pressable
                        key={opt}
                        style={[
                          styles.selectOption,
                          idx === CALC_METHOD_OPTIONS.length - 1 && styles.selectOptionLast,
                          formCalcMethod === opt && styles.selectOptionActive,
                        ]}
                        onPress={() => {
                          setFormCalcMethod(opt);
                          setCalcPickerOpen(false);
                        }}
                      >
                        <Text style={[styles.selectOptionText, formCalcMethod === opt && styles.selectOptionTextActive]}>
                          {opt}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                ) : null}
              </View>
              <View style={styles.field}>
                <Text style={styles.label}>
                  <Text style={styles.required}>* </Text>计算公式
                </Text>
                <TextInput
                  style={[styles.input, styles.inputMultiline]}
                  value={formFormula}
                  onChangeText={setFormFormula}
                  placeholder="如：(边长 + 边高 * 2 + 20) * 0.00785 * 厚度 / 1000"
                  placeholderTextColor="#aab4c7"
                  multiline
                />
              </View>
            </ScrollView>
            <View style={styles.modalActions}>
              <Pressable style={styles.cancelButton} onPress={closeModal} disabled={saving}>
                <Text style={styles.cancelButtonText}>取消</Text>
              </Pressable>
              <Pressable style={styles.confirmButton} onPress={() => void submitFormula()} disabled={saving}>
                <Text style={styles.confirmButtonText}>{saving ? '保存中...' : '保存'}</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </PageScaffold>
  );
}

const styles = StyleSheet.create({
  toolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
    paddingHorizontal: 2,
    gap: 12,
  },
  toolbarLead: {
    minWidth: 28,
    justifyContent: 'center',
    alignItems: 'flex-start',
  },
  toolbarBtns: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flexShrink: 0,
  },
  toolBtnGhost: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 999,
    backgroundColor: '#fff',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#d8e0ee',
  },
  toolBtnPrimary: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: 999,
    backgroundColor: '#2f68ff',
  },
  toolBtnPressed: {
    opacity: 0.88,
  },
  toolBtnDisabled: {
    opacity: 0.55,
  },
  toolBtnGhostText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#3d4f72',
  },
  toolBtnPrimaryText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
  },
  errorBanner: {
    marginBottom: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: '#fff5f5',
    color: '#b83232',
    fontSize: 13,
    overflow: 'hidden',
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 0,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#e8ecf4',
  },
  tableLoading: {
    paddingVertical: 36,
    alignItems: 'center',
    gap: 10,
  },
  tableLoadingText: {
    fontSize: 14,
    color: '#64748b',
  },
  tableEmpty: {
    paddingVertical: 32,
    paddingHorizontal: 16,
    textAlign: 'center',
    fontSize: 14,
    color: '#8892a6',
  },
  tableSheet: {
    backgroundColor: '#fff',
  },
  tableHeadRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
    backgroundColor: '#f1f5f9',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#cbd5e1',
  },
  tableBodyRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#eef2f7',
  },
  tableBodyRowAlt: {
    backgroundColor: '#fafbfd',
  },
  th: {
    paddingHorizontal: 8,
    paddingVertical: 11,
    fontSize: 12,
    fontWeight: '700',
    color: '#475569',
    borderRightWidth: StyleSheet.hairlineWidth,
    borderRightColor: '#e2e8f0',
  },
  thLast: {
    borderRightWidth: 0,
  },
  td: {
    paddingHorizontal: 8,
    paddingVertical: 10,
    fontSize: 12,
    color: '#1e293b',
    borderRightWidth: StyleSheet.hairlineWidth,
    borderRightColor: '#f1f5f9',
    lineHeight: 17,
  },
  tdCenter: {
    textAlign: 'center',
  },
  tdFormula: {
    fontSize: 11,
    fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' }),
  },
  tdOps: {
    paddingHorizontal: 8,
    paddingVertical: 8,
    borderRightWidth: 0,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
  },
  opEditBtn: {
    backgroundColor: '#2f68ff',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    minWidth: 52,
    alignItems: 'center',
  },
  opEditBtnText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  opDelText: {
    color: '#dc2626',
    fontSize: 13,
    fontWeight: '600',
  },
  input: {
    borderWidth: 1,
    borderColor: '#dbe1ec',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 11,
    fontSize: 15,
    color: '#102248',
    backgroundColor: '#fafbfd',
  },
  mask: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  maskBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  modal: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 14,
    borderTopRightRadius: 14,
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 14,
    maxHeight: '88%',
  },
  modalScroll: {
    maxHeight: 420,
  },
  modalScrollContent: {
    paddingBottom: 8,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 14,
    color: '#102248',
  },
  field: {
    marginBottom: 20,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: '#2b3957',
    marginBottom: 8,
  },
  required: {
    color: '#e53935',
  },
  selectBox: {
    borderWidth: 1,
    borderColor: '#dbe1ec',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#fafbfd',
  },
  selectBoxOpen: {
    borderColor: '#2f68ff',
  },
  selectBoxText: {
    fontSize: 15,
    color: '#102248',
  },
  selectMenu: {
    marginTop: 10,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 10,
    backgroundColor: '#fff',
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  selectOption: {
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#eef2f7',
  },
  selectOptionLast: {
    borderBottomWidth: 0,
  },
  selectOptionActive: {
    backgroundColor: '#eef5ff',
  },
  selectOptionText: {
    fontSize: 15,
    color: '#334155',
  },
  selectOptionTextActive: {
    color: '#204dff',
    fontWeight: '600',
  },
  inputMultiline: {
    minHeight: 88,
    textAlignVertical: 'top',
    paddingTop: 10,
  },
  modalActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 4,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#e8ecf4',
  },
  cancelButton: {
    flex: 1,
    height: 40,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#b8c3d8',
    justifyContent: 'center',
    alignItems: 'center',
  },
  cancelButtonText: {
    color: '#3b4a68',
  },
  confirmButton: {
    flex: 1,
    height: 40,
    borderRadius: 8,
    backgroundColor: '#2f68ff',
    justifyContent: 'center',
    alignItems: 'center',
  },
  confirmButtonText: {
    color: '#fff',
    fontWeight: '600',
  },
});

import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
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
import { AddCustomerModal } from '../components/AddCustomerModal';
import { PageScaffold } from '../components/PageScaffold';
import { deleteCustomer, searchCustomer, updateCustomer } from '../services/api';

function normalizeList(raw: unknown): Record<string, unknown>[] {
  if (Array.isArray(raw)) return raw as Record<string, unknown>[];
  if (raw && typeof raw === 'object') {
    const data = (raw as { data?: unknown }).data;
    if (Array.isArray(data)) return data as Record<string, unknown>[];
  }
  return [];
}

function customerRowKey(item: Record<string, unknown>, index: number): string {
  const id = item.id ?? item['客户编号'] ?? item.customerId;
  return `${String(id ?? 'x')}-${index}`;
}

type CusScreenProps = {
  /** 为 true 时不展示页内大标题与说明（由 Stack 导航栏承载） */
  embedInStackHeader?: boolean;
};

export function CusScreen({ embedInStackHeader }: CusScreenProps = {}) {
  const [draftQuery, setDraftQuery] = useState('');
  /** 最近一次请求所用的关键词（用于统计展示与添加后刷新） */
  const [appliedQuery, setAppliedQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<Record<string, unknown>[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [addModalVisible, setAddModalVisible] = useState(false);
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [editingItem, setEditingItem] = useState<Record<string, unknown> | null>(null);
  const [formName, setFormName] = useState('');
  const [formShortName, setFormShortName] = useState('');
  const [formPhone, setFormPhone] = useState('');
  const [formRepresentative, setFormRepresentative] = useState('');
  const [formProvince, setFormProvince] = useState('');
  const [formCity, setFormCity] = useState('');
  const [formDistrict, setFormDistrict] = useState('');
  const [formAddress, setFormAddress] = useState('');
  const [saving, setSaving] = useState(false);

  const fetchList = useCallback(async (keyword: string) => {
    setLoading(true);
    setError(null);
    try {
      const data = await searchCustomer(keyword);
      setItems(normalizeList(data));
      setAppliedQuery(keyword);
    } catch (e) {
      setError(e instanceof Error ? e.message : '加载失败');
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchList('');
  }, [fetchList]);

  const onSearchPress = useCallback(() => {
    void fetchList(draftQuery.trim());
  }, [draftQuery, fetchList]);

  const keywordLabel = appliedQuery.trim() === '' ? '全部' : appliedQuery.trim();

  const currentEditTitle = useMemo(() => '编辑客户', []);

  const openEdit = (item: Record<string, unknown>) => {
    setEditingItem(item);
    setFormName(String(item['客户名称'] ?? item.name ?? item.customerName ?? ''));
    setFormShortName(String(item['客户代码'] ?? item.shortName ?? ''));
    setFormPhone(String(item['联系电话'] ?? item.phone ?? item.mobile ?? ''));
    setFormRepresentative(String(item['客户代表'] ?? item.representative ?? ''));
    setFormProvince(String(item['省'] ?? item.province ?? ''));
    setFormCity(String(item['市'] ?? item.city ?? ''));
    setFormDistrict(String(item['区县'] ?? item.district ?? ''));
    setFormAddress(String(item['地址'] ?? item.address ?? item.addr ?? ''));
    setEditModalVisible(true);
  };

  const closeEditModal = () => {
    setEditModalVisible(false);
    setSaving(false);
    setEditingItem(null);
  };

  const submitCustomer = async () => {
    if (!formName.trim()) {
      Alert.alert('提示', '客户名称不能为空');
      return;
    }
    if (!editingItem) return;

    setSaving(true);
    try {
      const payload = {
        客户代码: formShortName.trim() || formName.trim(),
        客户名称: formName.trim(),
        客户电话: formPhone.trim(),
        客户代表: formRepresentative.trim(),
        省: formProvince.trim(),
        市: formCity.trim(),
        区县: formDistrict.trim(),
        客户地址: formAddress.trim(),
      };

      const id = editingItem.id ?? editingItem['客户编号'] ?? editingItem.customerId;
      if (!id) {
        throw new Error('缺少客户ID，无法更新');
      }
      await updateCustomer(String(id), payload);
      closeEditModal();
      await fetchList(appliedQuery);
      Alert.alert('成功', '客户信息已更新');
    } catch (e) {
      Alert.alert('失败', e instanceof Error ? e.message : '保存失败');
      setSaving(false);
    }
  };

  const removeCustomer = async (item: Record<string, unknown>) => {
    const id = item.id ?? item['客户编号'] ?? item.customerId;
    if (id == null || String(id).trim() === '') {
      Alert.alert('失败', '缺少客户编号，无法删除');
      return;
    }
    try {
      await deleteCustomer(String(id));
      await fetchList(appliedQuery);
      Alert.alert('成功', '客户已删除');
    } catch (e) {
      Alert.alert('失败', e instanceof Error ? e.message : '删除失败');
    }
  };

  const confirmRemoveCustomer = (item: Record<string, unknown>) => {
    const nm = String(item['客户名称'] ?? item.name ?? item.customerName ?? '该项').trim() || '该项';
    Alert.alert('确认删除', `确定删除客户「${nm}」吗？`, [
      { text: '取消', style: 'cancel' },
      { text: '删除', style: 'destructive', onPress: () => void removeCustomer(item) },
    ]);
  };

  const fixedHeader = (
    <View style={styles.fixedTop}>
      <View style={styles.statsStrip}>
        <View style={styles.statCell}>
          <View style={styles.statHead}>
            <Ionicons name="people-outline" size={14} color="#204dff" />
            <Text style={styles.statValueCompact}>{loading ? '…' : items.length}</Text>
          </View>
          <Text style={styles.statLabelCompact}>客户总数</Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.statCell}>
          <View style={styles.statHead}>
            <Ionicons name="document-text-outline" size={14} color="#16a34a" />
            <Text style={styles.statValueCompact} numberOfLines={1}>
              {loading ? '…' : items.length}
            </Text>
          </View>
          <Text style={styles.statLabelCompact}>当前显示</Text>
        </View>
        <View style={styles.statDivider} />
        <View style={[styles.statCell, styles.statCellKeyword]}>
          <View style={styles.statHead}>
            <Ionicons name="funnel-outline" size={14} color="#64748b" />
            <Text style={styles.statKeywordCompact} numberOfLines={1}>
              {keywordLabel}
            </Text>
          </View>
          <Text style={styles.statLabelCompact}>搜索关键词</Text>
        </View>
      </View>

      <View style={styles.toolbarCard}>
        <View style={styles.toolbarRow}>
          <TextInput
            value={draftQuery}
            onChangeText={setDraftQuery}
            placeholder="搜索客户名称、电话、地址…"
            placeholderTextColor="#aab4c7"
            style={styles.searchInput}
            autoCapitalize="none"
            returnKeyType="search"
            onSubmitEditing={onSearchPress}
          />
          <Pressable
            style={({ pressed }) => [styles.searchGoBtn, pressed && styles.searchGoBtnPressed]}
            onPress={onSearchPress}
            disabled={loading}
            accessibilityRole="button"
            accessibilityLabel="搜索"
          >
            <Ionicons name="search-outline" size={18} color="#204dff" />
          </Pressable>
          <Pressable
            style={({ pressed }) => [styles.addCustomerBtn, pressed && styles.addCustomerBtnPressed]}
            onPress={() => setAddModalVisible(true)}
            accessibilityRole="button"
            accessibilityLabel="添加客户"
          >
            <Ionicons name="person-add-outline" size={15} color="#204dff" />
            <Text style={styles.addCustomerBtnText} numberOfLines={1}>
              添加客户
            </Text>
          </Pressable>
        </View>
      </View>

      {error ? (
        <View style={styles.errorBanner}>
          <Text style={styles.errorBannerText}>接口异常：{error}</Text>
        </View>
      ) : null}

      <View style={styles.tableTopChrome}>
        <View style={styles.tableHeadRow}>
          <Text style={[styles.th, styles.thName]}>客户名字</Text>
          <Text style={[styles.th, styles.thPhone]}>联系电话</Text>
          <Text style={[styles.th, styles.thOps]}>操作</Text>
        </View>
      </View>
    </View>
  );

  return (
    <PageScaffold
      omitOuterScrollView
      title={embedInStackHeader ? undefined : '客户管理'}
      description={
        embedInStackHeader ? undefined : '与桌面端客户管理一致：查询使用 /searchCustomer，新增与报价页共用表单。'
      }
    >
      <View style={styles.screenFill}>
        {fixedHeader}
        <FlatList
          style={styles.tableScroll}
          contentContainerStyle={
            items.length === 0 ? [styles.flatListContent, styles.flatListContentGrow] : styles.flatListContent
          }
          data={items}
          keyExtractor={customerRowKey}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          refreshing={loading && items.length > 0}
          onRefresh={() => void fetchList(appliedQuery)}
          ListEmptyComponent={
            loading ? (
              <View style={styles.emptyLoading}>
                <ActivityIndicator color="#204dff" />
                <Text style={styles.emptyHint}>加载中…</Text>
              </View>
            ) : (
              <View style={styles.emptyBox}>
                <Ionicons name="folder-open-outline" size={40} color="#c5cee0" />
                <Text style={styles.emptyTitle}>暂无客户数据</Text>
                <Text style={styles.emptySub}>试试更换关键词，或添加新客户</Text>
                <Pressable style={styles.emptyCta} onPress={() => setAddModalVisible(true)}>
                  <Text style={styles.emptyCtaText}>添加第一个客户</Text>
                </Pressable>
              </View>
            )
          }
          renderItem={({ item, index }) => (
            <View
              style={[
                styles.tableBodyChrome,
                index % 2 === 1 && styles.tableRowAlt,
                index === items.length - 1 && styles.tableBodyChromeLast,
              ]}
            >
              <View style={styles.tableBodyRow}>
                <Text style={[styles.td, styles.tdName]} numberOfLines={3}>
                  {String(item['客户名称'] ?? item.name ?? item.customerName ?? '—')}
                </Text>
                <Text style={[styles.td, styles.tdPhone]} numberOfLines={2}>
                  {String(item['联系电话'] ?? item['客户电话'] ?? item.phone ?? item.mobile ?? '—')}
                </Text>
                <View style={styles.tdOps}>
                  <Pressable
                    style={({ pressed }) => [styles.opIconHit, pressed && styles.opIconHitPressed]}
                    onPress={() => openEdit(item)}
                    hitSlop={8}
                    accessibilityRole="button"
                    accessibilityLabel="编辑"
                  >
                    <Ionicons name="create-outline" size={14} color="#204dff" />
                  </Pressable>
                  <Pressable
                    style={({ pressed }) => [styles.opIconHit, pressed && styles.opIconHitPressed]}
                    onPress={() => confirmRemoveCustomer(item)}
                    hitSlop={8}
                    accessibilityRole="button"
                    accessibilityLabel="删除"
                  >
                    <Ionicons name="trash-outline" size={14} color="#dc2626" />
                  </Pressable>
                </View>
              </View>
            </View>
          )}
        />
      </View>

      <AddCustomerModal
        visible={addModalVisible}
        onRequestClose={() => setAddModalVisible(false)}
        onSaved={() => {
          void fetchList(appliedQuery);
          Alert.alert('成功', '客户已添加');
        }}
      />

      <Modal visible={editModalVisible} transparent animationType="slide" onRequestClose={closeEditModal}>
        <KeyboardAvoidingView
          style={styles.mask}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 12 : 0}
        >
          <Pressable style={styles.maskBackdrop} onPress={closeEditModal} />
          <View style={styles.modalSheet}>
            <View style={styles.modalGrab}>
              <View style={styles.modalGrabBar} />
            </View>
            <Text style={styles.modalTitle}>{currentEditTitle}</Text>
            <ScrollView
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
              style={styles.modalScroll}
              contentContainerStyle={styles.modalScrollContent}
            >
              <Text style={styles.fieldLabel}>客户代码</Text>
              <TextInput
                style={styles.modalInput}
                value={formShortName}
                onChangeText={setFormShortName}
                placeholder="客户代码"
                placeholderTextColor="#aab4c7"
              />
              <Text style={styles.fieldLabel}>
                <Text style={styles.required}>* </Text>客户名称
              </Text>
              <TextInput
                style={styles.modalInput}
                value={formName}
                onChangeText={setFormName}
                placeholder="客户名称"
                placeholderTextColor="#aab4c7"
              />
              <Text style={styles.fieldLabel}>联系电话</Text>
              <TextInput
                style={styles.modalInput}
                value={formPhone}
                onChangeText={setFormPhone}
                placeholder="联系电话"
                placeholderTextColor="#aab4c7"
                keyboardType="phone-pad"
              />
              <Text style={styles.fieldLabel}>客户代表</Text>
              <TextInput
                style={styles.modalInput}
                value={formRepresentative}
                onChangeText={setFormRepresentative}
                placeholder="客户代表"
                placeholderTextColor="#aab4c7"
              />
              <Text style={styles.fieldLabel}>省 / 市 / 区县</Text>
              <View style={styles.regionRow}>
                <TextInput
                  style={[styles.modalInput, styles.regionInput]}
                  value={formProvince}
                  onChangeText={setFormProvince}
                  placeholder="省"
                  placeholderTextColor="#aab4c7"
                />
                <TextInput
                  style={[styles.modalInput, styles.regionInput]}
                  value={formCity}
                  onChangeText={setFormCity}
                  placeholder="市"
                  placeholderTextColor="#aab4c7"
                />
                <TextInput
                  style={[styles.modalInput, styles.regionInput]}
                  value={formDistrict}
                  onChangeText={setFormDistrict}
                  placeholder="区县"
                  placeholderTextColor="#aab4c7"
                />
              </View>
              <Text style={styles.fieldLabel}>地址</Text>
              <TextInput
                style={[styles.modalInput, styles.modalInputMulti]}
                value={formAddress}
                onChangeText={setFormAddress}
                placeholder="详细地址"
                placeholderTextColor="#aab4c7"
                multiline
              />
            </ScrollView>
            <View style={styles.modalActions}>
              <Pressable style={styles.cancelBtn} onPress={closeEditModal} disabled={saving}>
                <Text style={styles.cancelBtnText}>取消</Text>
              </Pressable>
              <Pressable style={styles.confirmBtn} onPress={() => void submitCustomer()} disabled={saving}>
                <Text style={styles.confirmBtnText}>{saving ? '保存中…' : '保存'}</Text>
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </PageScaffold>
  );
}

const styles = StyleSheet.create({
  screenFill: {
    flex: 1,
    minHeight: 0,
    flexDirection: 'column',
  },
  fixedTop: {
    flexShrink: 0,
  },
  tableScroll: {
    flex: 1,
    minHeight: 0,
  },
  flatListContent: {
    paddingBottom: 24,
  },
  flatListContentGrow: {
    flexGrow: 1,
  },
  statsStrip: {
    flexDirection: 'row',
    alignItems: 'stretch',
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#e8ecf4',
    paddingVertical: 8,
    paddingHorizontal: 4,
    marginBottom: 8,
  },
  statCell: {
    flex: 1,
    minWidth: 0,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    paddingHorizontal: 4,
  },
  statCellKeyword: {
    flex: 1.05,
  },
  statHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    maxWidth: '100%',
  },
  statDivider: {
    width: StyleSheet.hairlineWidth,
    backgroundColor: '#e8ecf4',
    alignSelf: 'stretch',
    marginVertical: 2,
  },
  statValueCompact: {
    fontSize: 15,
    fontWeight: '700',
    color: '#102248',
  },
  statKeywordCompact: {
    flexShrink: 1,
    fontSize: 13,
    fontWeight: '700',
    color: '#334155',
  },
  statLabelCompact: {
    fontSize: 10,
    fontWeight: '600',
    color: '#8892a6',
  },
  toolbarCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#e8ecf4',
    marginBottom: 10,
  },
  toolbarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  searchInput: {
    flex: 1,
    minWidth: 0,
    minHeight: 36,
    borderWidth: 1,
    borderColor: '#dbe1ec',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: Platform.OS === 'ios' ? 8 : 6,
    fontSize: 14,
    color: '#102248',
    backgroundColor: '#fafbfd',
  },
  searchGoBtn: {
    width: 36,
    height: 36,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(32, 77, 255, 0.28)',
    backgroundColor: 'rgba(32, 77, 255, 0.06)',
    justifyContent: 'center',
    alignItems: 'center',
    flexShrink: 0,
  },
  searchGoBtnPressed: {
    opacity: 0.82,
  },
  addCustomerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    flexShrink: 0,
    paddingHorizontal: 8,
    paddingVertical: 6,
    minHeight: 36,
    borderRadius: 8,
    backgroundColor: 'rgba(32, 77, 255, 0.08)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(32, 77, 255, 0.28)',
  },
  addCustomerBtnPressed: {
    opacity: 0.88,
  },
  addCustomerBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#204dff',
    maxWidth: 96,
  },
  errorBanner: {
    marginTop: 4,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: '#fff5f5',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#fecaca',
  },
  errorBannerText: {
    color: '#b83232',
    fontSize: 13,
  },
  tableTopChrome: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 12,
    borderTopRightRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#e8ecf4',
    overflow: 'hidden',
    marginBottom: 0,
  },
  tableHeadRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f1f5f9',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#e2e8f0',
    paddingVertical: 10,
  },
  th: {
    fontSize: 12,
    fontWeight: '700',
    color: '#475569',
  },
  thName: {
    flex: 1,
    minWidth: 0,
    paddingHorizontal: 10,
  },
  thPhone: {
    width: 118,
    paddingHorizontal: 6,
    textAlign: 'center',
  },
  thOps: {
    width: 76,
    textAlign: 'center',
  },
  tableBodyChrome: {
    backgroundColor: '#fff',
    borderLeftWidth: StyleSheet.hairlineWidth,
    borderRightWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: '#e8ecf4',
  },
  tableBodyChromeLast: {
    borderBottomLeftRadius: 12,
    borderBottomRightRadius: 12,
    marginBottom: 8,
  },
  tableRowAlt: {
    backgroundColor: '#fafbfd',
  },
  tableBodyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 0,
  },
  td: {
    fontSize: 13,
    color: '#1e293b',
  },
  tdName: {
    flex: 1,
    minWidth: 0,
    paddingHorizontal: 10,
    fontWeight: '600',
    lineHeight: 18,
  },
  tdPhone: {
    width: 118,
    paddingHorizontal: 6,
    textAlign: 'center',
    color: '#475569',
    fontVariant: ['tabular-nums'],
  },
  tdOps: {
    width: 76,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 6,
  },
  opIconHit: {
    width: 28,
    height: 28,
    justifyContent: 'center',
    alignItems: 'center',
  },
  opIconHitPressed: {
    opacity: 0.55,
  },
  emptyLoading: {
    paddingVertical: 48,
    alignItems: 'center',
    gap: 10,
  },
  emptyHint: {
    fontSize: 14,
    color: '#64748b',
  },
  emptyBox: {
    marginTop: 24,
    alignItems: 'center',
    paddingHorizontal: 24,
    gap: 8,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#475569',
    marginTop: 4,
  },
  emptySub: {
    fontSize: 13,
    color: '#94a3b8',
    textAlign: 'center',
  },
  emptyCta: {
    marginTop: 12,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: '#204dff',
  },
  emptyCtaText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 14,
  },
  mask: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  maskBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.38)',
  },
  modalSheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingHorizontal: 16,
    paddingBottom: Platform.OS === 'ios' ? 28 : 16,
    maxHeight: '88%',
  },
  modalGrab: {
    alignItems: 'center',
    paddingVertical: 8,
  },
  modalGrabBar: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#e2e8f0',
  },
  modalTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#102248',
    marginBottom: 12,
  },
  modalScroll: {
    maxHeight: 380,
  },
  modalScrollContent: {
    paddingBottom: 12,
  },
  fieldLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#3d4f72',
    marginBottom: 6,
    marginTop: 10,
  },
  required: {
    color: '#e53935',
  },
  modalInput: {
    borderWidth: 1,
    borderColor: '#dbe1ec',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: Platform.OS === 'ios' ? 11 : 10,
    fontSize: 15,
    color: '#102248',
    backgroundColor: '#fafbfd',
  },
  modalInputMulti: {
    minHeight: 72,
    textAlignVertical: 'top',
    paddingTop: 10,
  },
  regionRow: {
    flexDirection: 'row',
    gap: 8,
  },
  regionInput: {
    flex: 1,
    minWidth: 0,
  },
  modalActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 8,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#e8ecf4',
  },
  cancelBtn: {
    flex: 1,
    height: 44,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#b8c3d8',
    justifyContent: 'center',
    alignItems: 'center',
  },
  cancelBtnText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#3b4a68',
  },
  confirmBtn: {
    flex: 1,
    height: 44,
    borderRadius: 10,
    backgroundColor: '#204dff',
    justifyContent: 'center',
    alignItems: 'center',
  },
  confirmBtnText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#fff',
  },
});

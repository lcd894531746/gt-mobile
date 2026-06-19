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
import md5 from 'md5';
import { PageScaffold } from '../components/PageScaffold';
import {
  addEmployee,
  fetchEmployees,
  updateEmployee,
  updateEmployeePassword,
} from '../services/api';

function normalizeList(raw: unknown): Record<string, unknown>[] {
  if (Array.isArray(raw)) return raw as Record<string, unknown>[];
  if (raw && typeof raw === 'object') {
    const data = (raw as { data?: unknown }).data;
    if (Array.isArray(data)) return data as Record<string, unknown>[];
  }
  return [];
}

function empRowKey(item: Record<string, unknown>, index: number): string {
  const id = item.id;
  return `${String(id ?? 'x')}-${index}`;
}

function pickName(row: Record<string, unknown>): string {
  return String(row['员工姓名'] ?? row.name ?? '').trim();
}

function pickAccount(row: Record<string, unknown>): string {
  return String(row['账号'] ?? row.account ?? '').trim();
}

function pickPhone(row: Record<string, unknown>): string {
  return String(row['员工电话'] ?? row.phone ?? row['联系电话'] ?? '').trim();
}

function pickPosition(row: Record<string, unknown>): string {
  return String(row['职位'] ?? row.position ?? '').trim();
}

function pickId(row: Record<string, unknown>): string | null {
  const id = row.id;
  if (id == null || String(id).trim() === '') return null;
  return String(id);
}

type EmpScreenProps = {
  embedInStackHeader?: boolean;
};

export function EmpScreen({ embedInStackHeader }: EmpScreenProps = {}) {
  const [draftQuery, setDraftQuery] = useState('');
  const [appliedQuery, setAppliedQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<Record<string, unknown>[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [addModalVisible, setAddModalVisible] = useState(false);
  const [addName, setAddName] = useState('');
  const [addAccount, setAddAccount] = useState('');
  const [addPassword, setAddPassword] = useState('');
  const [addPhone, setAddPhone] = useState('');
  const [addPosition, setAddPosition] = useState('');
  const [addSaving, setAddSaving] = useState(false);

  const [editModalVisible, setEditModalVisible] = useState(false);
  const [editingItem, setEditingItem] = useState<Record<string, unknown> | null>(null);
  const [formName, setFormName] = useState('');
  const [formAccount, setFormAccount] = useState('');
  const [formPhone, setFormPhone] = useState('');
  const [formPosition, setFormPosition] = useState('');
  const [editSaving, setEditSaving] = useState(false);

  const [pwdModalVisible, setPwdModalVisible] = useState(false);
  const [pwdTarget, setPwdTarget] = useState<Record<string, unknown> | null>(null);
  const [pwdNew, setPwdNew] = useState('');
  const [pwdConfirm, setPwdConfirm] = useState('');
  const [pwdSaving, setPwdSaving] = useState(false);

  const fetchList = useCallback(async (keyword: string) => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchEmployees(keyword);
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

  const resetAddForm = () => {
    setAddName('');
    setAddAccount('');
    setAddPassword('');
    setAddPhone('');
    setAddPosition('');
    setAddSaving(false);
  };

  const submitAdd = async () => {
    const name = addName.trim();
    const account = addAccount.trim();
    const position = addPosition.trim();
    const pwd = addPassword;
    if (!name || !position) {
      Alert.alert('提示', '姓名和职位为必填项');
      return;
    }
    if (!account) {
      Alert.alert('提示', '账号不能为空');
      return;
    }
    if (!pwd) {
      Alert.alert('提示', '添加新员工时密码为必填项');
      return;
    }
    setAddSaving(true);
    try {
      await addEmployee({
        员工姓名: name,
        账号: account,
        员工密码: md5(pwd),
        员工电话: addPhone.trim(),
        职位: position,
      });
      setAddModalVisible(false);
      resetAddForm();
      await fetchList(appliedQuery);
      Alert.alert('成功', '员工添加成功');
    } catch (e) {
      Alert.alert('失败', e instanceof Error ? e.message : '操作失败，请重试');
      setAddSaving(false);
    }
  };

  const openEdit = (item: Record<string, unknown>) => {
    setEditingItem(item);
    setFormName(pickName(item));
    setFormAccount(pickAccount(item));
    setFormPhone(pickPhone(item));
    setFormPosition(pickPosition(item));
    setEditModalVisible(true);
  };

  const closeEditModal = () => {
    setEditModalVisible(false);
    setEditSaving(false);
    setEditingItem(null);
  };

  const submitEdit = async () => {
    const name = formName.trim();
    const position = formPosition.trim();
    if (!name || !position) {
      Alert.alert('提示', '姓名和职位为必填项');
      return;
    }
    const id = editingItem ? pickId(editingItem) : null;
    if (!id) {
      Alert.alert('失败', '缺少员工 ID，无法更新');
      return;
    }
    setEditSaving(true);
    try {
      await updateEmployee(id, {
        员工姓名: name,
        账号: formAccount.trim(),
        员工电话: formPhone.trim(),
        职位: position,
      });
      closeEditModal();
      await fetchList(appliedQuery);
      Alert.alert('成功', '员工信息已更新');
    } catch (e) {
      Alert.alert('失败', e instanceof Error ? e.message : '操作失败，请重试');
      setEditSaving(false);
    }
  };

  const openPwdModal = (item: Record<string, unknown>) => {
    setPwdTarget(item);
    setPwdNew('');
    setPwdConfirm('');
    setPwdModalVisible(true);
  };

  const closePwdModal = () => {
    setPwdModalVisible(false);
    setPwdSaving(false);
    setPwdTarget(null);
    setPwdNew('');
    setPwdConfirm('');
  };

  const submitPwd = async () => {
    const id = pwdTarget ? pickId(pwdTarget) : null;
    if (!id) {
      Alert.alert('失败', '缺少员工 ID');
      return;
    }
    if (!pwdNew) {
      Alert.alert('提示', '请输入新密码');
      return;
    }
    if (pwdNew !== pwdConfirm) {
      Alert.alert('提示', '两次输入的密码不一致');
      return;
    }
    setPwdSaving(true);
    try {
      await updateEmployeePassword(id, md5(pwdNew));
      closePwdModal();
      Alert.alert('成功', '密码修改成功');
    } catch (e) {
      Alert.alert('失败', e instanceof Error ? e.message : '密码修改失败，请重试');
      setPwdSaving(false);
    }
  };

  const pwdModalTitle = useMemo(() => {
    const nm = pwdTarget ? pickName(pwdTarget) || pickAccount(pwdTarget) : '';
    return nm ? `修改密码 · ${nm}` : '修改密码';
  }, [pwdTarget]);

  const fixedHeader = (
    <View style={styles.fixedTop}>
      <View style={styles.statsStrip}>
        <View style={styles.statCell}>
          <View style={styles.statHead}>
            <Ionicons name="people-outline" size={14} color="#204dff" />
            <Text style={styles.statValueCompact}>{loading ? '…' : items.length}</Text>
          </View>
          <Text style={styles.statLabelCompact}>员工总数</Text>
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
            placeholder="搜索员工名称或账号"
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
            style={({ pressed }) => [styles.addBtn, pressed && styles.addBtnPressed]}
            onPress={() => setAddModalVisible(true)}
            accessibilityRole="button"
            accessibilityLabel="添加员工"
          >
            <Ionicons name="person-add-outline" size={15} color="#204dff" />
            <Text style={styles.addBtnText} numberOfLines={1}>
              添加员工
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
          <Text style={[styles.th, styles.thName]}>员工</Text>
          <Text style={[styles.th, styles.thPhone]}>联系电话</Text>
          <Text style={[styles.th, styles.thOps]}>操作</Text>
        </View>
      </View>
    </View>
  );

  return (
    <PageScaffold
      omitOuterScrollView
      title={embedInStackHeader ? undefined : '员工管理'}
      description={
        embedInStackHeader
          ? undefined
          : '与桌面端一致：GET /emp，新增 POST /emp，编辑 PUT /emp/:id，改密 PUT /emp/:id/password（密码 MD5）。'
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
          keyExtractor={empRowKey}
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
                <Ionicons name="people-outline" size={40} color="#c5cee0" />
                <Text style={styles.emptyTitle}>暂无员工数据</Text>
                <Text style={styles.emptySub}>试试更换关键词，或添加新员工</Text>
                <Pressable style={styles.emptyCta} onPress={() => setAddModalVisible(true)}>
                  <Text style={styles.emptyCtaText}>添加员工</Text>
                </Pressable>
              </View>
            )
          }
          renderItem={({ item, index }) => {
            const sub = [pickAccount(item), pickPosition(item)].filter(Boolean).join(' · ');
            return (
              <View
                style={[
                  styles.tableBodyChrome,
                  index % 2 === 1 && styles.tableRowAlt,
                  index === items.length - 1 && styles.tableBodyChromeLast,
                ]}
              >
                <View style={styles.tableBodyRow}>
                  <View style={styles.tdNameCol}>
                    <Text style={styles.tdNameMain} numberOfLines={2}>
                      {pickName(item) || '—'}
                    </Text>
                    {sub ? (
                      <Text style={styles.tdNameSub} numberOfLines={2}>
                        {sub}
                      </Text>
                    ) : null}
                  </View>
                  <Text style={[styles.td, styles.tdPhone]} numberOfLines={2}>
                    {pickPhone(item) || '—'}
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
                      onPress={() => openPwdModal(item)}
                      hitSlop={8}
                      accessibilityRole="button"
                      accessibilityLabel="修改密码"
                    >
                      <Ionicons name="key-outline" size={14} color="#ca8a04" />
                    </Pressable>
                  </View>
                </View>
              </View>
            );
          }}
        />
      </View>

      <Modal
        visible={addModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => {
          setAddModalVisible(false);
          resetAddForm();
        }}
      >
        <KeyboardAvoidingView
          style={styles.mask}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 12 : 0}
        >
          <Pressable
            style={styles.maskBackdrop}
            onPress={() => {
              setAddModalVisible(false);
              resetAddForm();
            }}
          />
          <View style={styles.modalSheet}>
            <View style={styles.modalGrab}>
              <View style={styles.modalGrabBar} />
            </View>
            <Text style={styles.modalTitle}>添加员工</Text>
            <ScrollView
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
              style={styles.modalScroll}
              contentContainerStyle={styles.modalScrollContent}
            >
              <Text style={styles.fieldLabel}>
                <Text style={styles.required}>* </Text>员工姓名
              </Text>
              <TextInput
                style={styles.modalInput}
                value={addName}
                onChangeText={setAddName}
                placeholder="员工姓名"
                placeholderTextColor="#aab4c7"
              />
              <Text style={styles.fieldLabel}>
                <Text style={styles.required}>* </Text>账号
              </Text>
              <TextInput
                style={styles.modalInput}
                value={addAccount}
                onChangeText={setAddAccount}
                placeholder="登录账号"
                placeholderTextColor="#aab4c7"
                autoCapitalize="none"
              />
              <Text style={styles.fieldLabel}>
                <Text style={styles.required}>* </Text>登录密码
              </Text>
              <TextInput
                style={styles.modalInput}
                value={addPassword}
                onChangeText={setAddPassword}
                placeholder="初始密码"
                placeholderTextColor="#aab4c7"
                secureTextEntry
              />
              <Text style={styles.fieldLabel}>联系电话</Text>
              <TextInput
                style={styles.modalInput}
                value={addPhone}
                onChangeText={setAddPhone}
                placeholder="联系电话"
                placeholderTextColor="#aab4c7"
                keyboardType="phone-pad"
              />
              <Text style={styles.fieldLabel}>
                <Text style={styles.required}>* </Text>职位
              </Text>
              <TextInput
                style={styles.modalInput}
                value={addPosition}
                onChangeText={setAddPosition}
                placeholder="职位"
                placeholderTextColor="#aab4c7"
              />
            </ScrollView>
            <View style={styles.modalActions}>
              <Pressable
                style={styles.cancelBtn}
                onPress={() => {
                  setAddModalVisible(false);
                  resetAddForm();
                }}
                disabled={addSaving}
              >
                <Text style={styles.cancelBtnText}>取消</Text>
              </Pressable>
              <Pressable style={styles.confirmBtn} onPress={() => void submitAdd()} disabled={addSaving}>
                <Text style={styles.confirmBtnText}>{addSaving ? '提交中…' : '确定'}</Text>
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

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
            <Text style={styles.modalTitle}>编辑员工</Text>
            <ScrollView
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
              style={styles.modalScroll}
              contentContainerStyle={styles.modalScrollContent}
            >
              <Text style={styles.fieldLabel}>
                <Text style={styles.required}>* </Text>员工姓名
              </Text>
              <TextInput
                style={styles.modalInput}
                value={formName}
                onChangeText={setFormName}
                placeholder="员工姓名"
                placeholderTextColor="#aab4c7"
              />
              <Text style={styles.fieldLabel}>账号</Text>
              <TextInput
                style={styles.modalInput}
                value={formAccount}
                onChangeText={setFormAccount}
                placeholder="账号"
                placeholderTextColor="#aab4c7"
                autoCapitalize="none"
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
              <Text style={styles.fieldLabel}>
                <Text style={styles.required}>* </Text>职位
              </Text>
              <TextInput
                style={styles.modalInput}
                value={formPosition}
                onChangeText={setFormPosition}
                placeholder="职位"
                placeholderTextColor="#aab4c7"
              />
            </ScrollView>
            <View style={styles.modalActions}>
              <Pressable style={styles.cancelBtn} onPress={closeEditModal} disabled={editSaving}>
                <Text style={styles.cancelBtnText}>取消</Text>
              </Pressable>
              <Pressable style={styles.confirmBtn} onPress={() => void submitEdit()} disabled={editSaving}>
                <Text style={styles.confirmBtnText}>{editSaving ? '保存中…' : '保存'}</Text>
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <Modal visible={pwdModalVisible} transparent animationType="slide" onRequestClose={closePwdModal}>
        <KeyboardAvoidingView
          style={styles.mask}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 12 : 0}
        >
          <Pressable style={styles.maskBackdrop} onPress={closePwdModal} />
          <View style={styles.modalSheet}>
            <View style={styles.modalGrab}>
              <View style={styles.modalGrabBar} />
            </View>
            <Text style={styles.modalTitle}>{pwdModalTitle}</Text>
            <ScrollView
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
              style={styles.modalScroll}
              contentContainerStyle={styles.modalScrollContent}
            >
              <Text style={styles.fieldLabel}>
                <Text style={styles.required}>* </Text>新密码
              </Text>
              <TextInput
                style={styles.modalInput}
                value={pwdNew}
                onChangeText={setPwdNew}
                placeholder="新密码"
                placeholderTextColor="#aab4c7"
                secureTextEntry
              />
              <Text style={styles.fieldLabel}>
                <Text style={styles.required}>* </Text>确认密码
              </Text>
              <TextInput
                style={styles.modalInput}
                value={pwdConfirm}
                onChangeText={setPwdConfirm}
                placeholder="再次输入"
                placeholderTextColor="#aab4c7"
                secureTextEntry
              />
            </ScrollView>
            <View style={styles.modalActions}>
              <Pressable style={styles.cancelBtn} onPress={closePwdModal} disabled={pwdSaving}>
                <Text style={styles.cancelBtnText}>取消</Text>
              </Pressable>
              <Pressable style={styles.confirmBtn} onPress={() => void submitPwd()} disabled={pwdSaving}>
                <Text style={styles.confirmBtnText}>{pwdSaving ? '提交中…' : '确定'}</Text>
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
  addBtn: {
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
  addBtnPressed: {
    opacity: 0.88,
  },
  addBtnText: {
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
  tdNameCol: {
    flex: 1,
    minWidth: 0,
    paddingHorizontal: 10,
    justifyContent: 'center',
    gap: 2,
  },
  tdNameMain: {
    fontSize: 13,
    fontWeight: '600',
    color: '#1e293b',
    lineHeight: 18,
  },
  tdNameSub: {
    fontSize: 11,
    color: '#64748b',
    lineHeight: 15,
  },
  td: {
    fontSize: 13,
    color: '#1e293b',
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

import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { PageScaffold } from '../components/PageScaffold';
import { addCustomer, searchCustomer, updateCustomer } from '../services/api';

function normalizeList(raw: unknown): Record<string, unknown>[] {
  if (Array.isArray(raw)) return raw as Record<string, unknown>[];
  if (raw && typeof raw === 'object') {
    const data = (raw as { data?: unknown }).data;
    if (Array.isArray(data)) return data as Record<string, unknown>[];
  }
  return [];
}

type CusScreenProps = {
  /** 为 true 时不展示页内大标题与说明（由 Stack 导航栏承载） */
  embedInStackHeader?: boolean;
};

export function CusScreen({ embedInStackHeader }: CusScreenProps = {}) {
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState<Record<string, unknown>[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [modalVisible, setModalVisible] = useState(false);
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

  const handleSearch = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await searchCustomer(query.trim());
      setItems(normalizeList(data));
    } catch (e) {
      setError(e instanceof Error ? e.message : '加载失败');
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [query]);

  useEffect(() => {
    void handleSearch();
  }, [handleSearch]);

  const currentTitle = useMemo(() => (editingItem ? '编辑客户' : '新增客户'), [editingItem]);

  const openCreate = () => {
    setEditingItem(null);
    setFormName('');
    setFormShortName('');
    setFormPhone('');
    setFormRepresentative('');
    setFormProvince('');
    setFormCity('');
    setFormDistrict('');
    setFormAddress('');
    setModalVisible(true);
  };

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
    setModalVisible(true);
  };

  const closeModal = () => {
    setModalVisible(false);
    setSaving(false);
  };

  const submitCustomer = async () => {
    if (!formName.trim()) {
      Alert.alert('提示', '客户名称不能为空');
      return;
    }

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

      if (editingItem) {
        const id = editingItem.id ?? editingItem['客户编号'] ?? editingItem.customerId;
        if (!id) {
          throw new Error('缺少客户ID，无法更新');
        }
        await updateCustomer(String(id), payload);
      } else {
        await addCustomer(payload);
      }
      closeModal();
      await handleSearch();
    } catch (e) {
      Alert.alert('失败', e instanceof Error ? e.message : '保存失败');
      setSaving(false);
    }
  };

  return (
    <PageScaffold
      title={embedInStackHeader ? undefined : '客户管理'}
      description={embedInStackHeader ? undefined : '对应原系统 /cus，接口使用 /searchCustomer。'}
    >
      <View style={styles.card}>
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="输入客户关键词"
          style={styles.input}
          autoCapitalize="none"
        />
        <Pressable style={styles.button} onPress={() => void handleSearch()} disabled={loading}>
          <Text style={styles.buttonText}>{loading ? '加载中...' : '查询客户'}</Text>
        </Pressable>
        <Pressable style={styles.secondaryButton} onPress={openCreate}>
          <Text style={styles.secondaryButtonText}>新增客户</Text>
        </Pressable>
        {loading ? <ActivityIndicator /> : null}
        {error ? <Text style={styles.error}>接口异常：{error}</Text> : null}
      </View>
      <View style={styles.card}>
        <FlatList
          data={items}
          keyExtractor={(item, index) => `${String(item.id ?? item['客户编号'] ?? index)}-${index}`}
          renderItem={({ item }) => (
            <View style={styles.item}>
              <View>
                <Text style={styles.itemTitle}>{String(item['客户名称'] ?? item.name ?? item.customerName ?? '-')}</Text>
                <Text style={styles.itemSub}>{String(item['客户电话'] ?? item['联系电话'] ?? item.phone ?? item.mobile ?? '-')}</Text>
              </View>
              <Pressable style={styles.smallButton} onPress={() => openEdit(item)}>
                <Text style={styles.smallButtonText}>编辑</Text>
              </Pressable>
            </View>
          )}
          ListEmptyComponent={!loading ? <Text>暂无客户数据</Text> : null}
        />
      </View>

      <Modal visible={modalVisible} transparent animationType="slide" onRequestClose={closeModal}>
        <View style={styles.mask}>
          <View style={styles.modal}>
            <Text style={styles.modalTitle}>{currentTitle}</Text>
            <TextInput
              style={styles.input}
              value={formShortName}
              onChangeText={setFormShortName}
              placeholder="客户代码"
            />
            <TextInput style={styles.input} value={formName} onChangeText={setFormName} placeholder="客户名称" />
            <TextInput style={styles.input} value={formPhone} onChangeText={setFormPhone} placeholder="联系电话" />
            <TextInput
              style={styles.input}
              value={formRepresentative}
              onChangeText={setFormRepresentative}
              placeholder="客户代表"
            />
            <TextInput style={styles.input} value={formProvince} onChangeText={setFormProvince} placeholder="省" />
            <TextInput style={styles.input} value={formCity} onChangeText={setFormCity} placeholder="市" />
            <TextInput style={styles.input} value={formDistrict} onChangeText={setFormDistrict} placeholder="区县" />
            <TextInput style={styles.input} value={formAddress} onChangeText={setFormAddress} placeholder="地址" />
            <View style={styles.row}>
              <Pressable style={styles.cancelButton} onPress={closeModal} disabled={saving}>
                <Text style={styles.cancelButtonText}>取消</Text>
              </Pressable>
              <Pressable style={styles.confirmButton} onPress={() => void submitCustomer()} disabled={saving}>
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
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 14,
  },
  input: {
    borderWidth: 1,
    borderColor: '#dbe1ec',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 9,
  },
  button: {
    marginTop: 10,
    backgroundColor: '#2f68ff',
    height: 40,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  buttonText: {
    color: '#fff',
    fontWeight: '600',
  },
  secondaryButton: {
    marginTop: 8,
    height: 38,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#2f68ff',
    justifyContent: 'center',
    alignItems: 'center',
  },
  secondaryButtonText: {
    color: '#2f68ff',
    fontWeight: '600',
  },
  error: {
    marginTop: 8,
    color: '#cc2d2d',
  },
  item: {
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: '#dbe1ec',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  itemTitle: {
    fontWeight: '700',
    color: '#11203b',
  },
  itemSub: {
    marginTop: 2,
    color: '#5c6a88',
  },
  smallButton: {
    backgroundColor: '#2f68ff',
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  smallButtonText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  mask: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.35)',
    justifyContent: 'flex-end',
  },
  modal: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 14,
    borderTopRightRadius: 14,
    padding: 14,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 8,
  },
  row: {
    flexDirection: 'row',
    gap: 8,
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

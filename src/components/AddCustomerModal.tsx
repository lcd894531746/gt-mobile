import { useCallback, useMemo, useState } from 'react';
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
import { Ionicons } from '@expo/vector-icons';
import { addCustomer, searchCustomer } from '../services/api';
import { deriveCustomerCodeFromName } from '../utils/customerCode';
import { getProvinceNames, getCityNames, getDistrictNames } from '../utils/chinaRegion';
import type { CustomerRow } from '../utils/offerHelpers';
import { normalizeCustomers } from '../utils/offerHelpers';

export type AddCustomerModalProps = {
  visible: boolean;
  onRequestClose: () => void;
  /** 保存成功并已尝试按名称搜索匹配客户行 */
  onSaved?: (result: { row: CustomerRow | null; nameSaved: string }) => void;
};

export function AddCustomerModal({ visible, onRequestClose, onSaved }: AddCustomerModalProps) {
  const [newCustName, setNewCustName] = useState('');
  const [newCustPhone, setNewCustPhone] = useState('');
  const [newCustRep, setNewCustRep] = useState('');
  const [newCustProvince, setNewCustProvince] = useState('');
  const [newCustCity, setNewCustCity] = useState('');
  const [newCustDistrict, setNewCustDistrict] = useState('');
  const [newCustAddress, setNewCustAddress] = useState('');
  const [addCustomerSaving, setAddCustomerSaving] = useState(false);

  const [regionProvOpen, setRegionProvOpen] = useState(false);
  const [regionCityOpen, setRegionCityOpen] = useState(false);
  const [regionDistOpen, setRegionDistOpen] = useState(false);

  const derivedNewCustShort = useMemo(() => deriveCustomerCodeFromName(newCustName), [newCustName]);

  const provinceResolved = useMemo(
    () => getProvinceNames().includes(newCustProvince.trim()),
    [newCustProvince],
  );

  const provinceOptions = useMemo(() => getProvinceNames(), []);

  const cityOptionsList = useMemo(() => {
    if (!provinceResolved) return [];
    return getCityNames(newCustProvince.trim());
  }, [provinceResolved, newCustProvince]);

  const cityResolved = useMemo(() => {
    if (!provinceResolved) return false;
    return getCityNames(newCustProvince.trim()).includes(newCustCity.trim());
  }, [provinceResolved, newCustProvince, newCustCity]);

  const districtOptionsList = useMemo(() => {
    if (!cityResolved) return [];
    return getDistrictNames(newCustProvince.trim(), newCustCity.trim());
  }, [cityResolved, newCustProvince, newCustCity]);

  const resetNewCustomerForm = useCallback(() => {
    setNewCustName('');
    setNewCustPhone('');
    setNewCustRep('');
    setNewCustProvince('');
    setNewCustCity('');
    setNewCustDistrict('');
    setNewCustAddress('');
  }, []);

  const closeModal = useCallback(() => {
    setAddCustomerSaving(false);
    resetNewCustomerForm();
    setRegionProvOpen(false);
    setRegionCityOpen(false);
    setRegionDistOpen(false);
    onRequestClose();
  }, [onRequestClose, resetNewCustomerForm]);

  const submitNewCustomer = async () => {
    if (!newCustName.trim()) {
      Alert.alert('提示', '客户名称不能为空');
      return;
    }
    const nameSaved = newCustName.trim();
    setAddCustomerSaving(true);
    try {
      const payload = {
        客户代码: derivedNewCustShort.trim() || nameSaved,
        客户名称: nameSaved,
        客户电话: newCustPhone.trim(),
        客户代表: newCustRep.trim(),
        省: newCustProvince.trim(),
        市: newCustCity.trim(),
        区县: newCustDistrict.trim(),
        客户地址: newCustAddress.trim(),
      };
      await addCustomer(payload);
      let row: CustomerRow | null = null;
      try {
        const data = await searchCustomer(nameSaved);
        const list = normalizeCustomers(data);
        row =
          list.find((r) => String(r['客户名称'] ?? r.name ?? '').trim() === nameSaved) ?? list[0] ?? null;
      } catch {
        /* 忽略 */
      }
      onSaved?.({ row, nameSaved });
      resetNewCustomerForm();
      setRegionProvOpen(false);
      setRegionCityOpen(false);
      setRegionDistOpen(false);
      onRequestClose();
    } catch (e) {
      Alert.alert('失败', e instanceof Error ? e.message : '保存失败');
    } finally {
      setAddCustomerSaving(false);
    }
  };

  return (
    <>
      <Modal visible={visible} transparent animationType="slide" onRequestClose={closeModal}>
        <View style={styles.modalMask}>
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            style={styles.addCustomerKb}
          >
            <View style={[styles.modalSheet, styles.addCustomerSheet]}>
              <View style={styles.addCustomerHeader}>
                <Text style={[styles.modalTitle, styles.addCustomerTitle]}>添加客户</Text>
                <Pressable onPress={closeModal} hitSlop={12} accessibilityRole="button">
                  <Ionicons name="close" size={22} color="#64748b" />
                </Pressable>
              </View>
              <ScrollView
                style={styles.addCustomerScroll}
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
                removeClippedSubviews={false}
                nestedScrollEnabled
              >
                <View style={styles.addCustBlock}>
                  <View style={styles.addCustLabelRow}>
                    <Ionicons name="person-outline" size={18} color="#2f68ff" />
                    <Text style={styles.addCustLabel}>客户名称</Text>
                    <Text style={styles.required}>*</Text>
                  </View>
                  <TextInput
                    style={styles.input}
                    value={newCustName}
                    onChangeText={setNewCustName}
                    placeholder="请输入客户名称"
                    placeholderTextColor="#aab4c7"
                  />
                </View>
                <View style={styles.addCustBlock}>
                  <View style={styles.addCustLabelRow}>
                    <Ionicons name="pencil-outline" size={18} color="#16a34a" />
                    <Text style={styles.addCustLabel}>客户简称</Text>
                  </View>
                  <View style={[styles.input, styles.inputReadonly]}>
                    <Text
                      style={[styles.inputReadonlyText, !derivedNewCustShort && styles.inputReadonlyPlaceholder]}
                      numberOfLines={1}
                    >
                      {derivedNewCustShort || '根据客户名称自动生成'}
                    </Text>
                  </View>
                </View>
                <View style={styles.addCustBlock}>
                  <View style={styles.addCustLabelRow}>
                    <Ionicons name="call-outline" size={18} color="#ea580c" />
                    <Text style={styles.addCustLabel}>联系电话</Text>
                  </View>
                  <TextInput
                    style={styles.input}
                    value={newCustPhone}
                    onChangeText={setNewCustPhone}
                    placeholder="请输入联系电话"
                    placeholderTextColor="#aab4c7"
                    keyboardType="phone-pad"
                  />
                </View>
                <View style={styles.addCustBlock}>
                  <View style={styles.addCustLabelRow}>
                    <Ionicons name="id-card-outline" size={18} color="#9333ea" />
                    <Text style={styles.addCustLabel}>客户代表</Text>
                  </View>
                  <TextInput
                    style={styles.input}
                    value={newCustRep}
                    onChangeText={setNewCustRep}
                    placeholder="请输入客户代表"
                    placeholderTextColor="#aab4c7"
                  />
                </View>
                <View style={styles.addCustBlock}>
                  <View style={styles.addCustLabelRow}>
                    <Ionicons name="location-outline" size={18} color="#db2777" />
                    <Text style={styles.addCustLabel}>所在地区</Text>
                  </View>
                  <View style={styles.regionRow}>
                    <View style={[styles.regionACWrap, styles.regionACWrapProvince]}>
                      <Pressable
                        style={[styles.regionDDLTrigger, regionProvOpen && styles.regionDDLTriggerFocused]}
                        onPress={() => {
                          setRegionProvOpen((o) => !o);
                          setRegionCityOpen(false);
                          setRegionDistOpen(false);
                        }}
                      >
                        <Text
                          style={[styles.regionDDLText, !newCustProvince && styles.regionDDLPlaceholder]}
                          numberOfLines={1}
                        >
                          {newCustProvince || '省'}
                        </Text>
                        <Ionicons name="chevron-down-outline" size={18} color="#8892a6" />
                      </Pressable>
                    </View>
                    <View style={[styles.regionACWrap, styles.regionACWrapCity]}>
                      <Pressable
                        disabled={!provinceResolved}
                        style={[
                          styles.regionDDLTrigger,
                          regionCityOpen && styles.regionDDLTriggerFocused,
                          !provinceResolved && styles.regionDDLTriggerDisabled,
                        ]}
                        onPress={() => {
                          if (!provinceResolved) {
                            Alert.alert('提示', '请先选择省');
                            return;
                          }
                          setRegionCityOpen((o) => !o);
                          setRegionProvOpen(false);
                          setRegionDistOpen(false);
                        }}
                      >
                        <Text
                          style={[styles.regionDDLText, !newCustCity && styles.regionDDLPlaceholder]}
                          numberOfLines={1}
                        >
                          {newCustCity || '市'}
                        </Text>
                        <Ionicons name="chevron-down-outline" size={18} color="#8892a6" />
                      </Pressable>
                    </View>
                    <View style={[styles.regionACWrap, styles.regionACWrapDistrict]}>
                      <Pressable
                        disabled={!cityResolved}
                        style={[
                          styles.regionDDLTrigger,
                          regionDistOpen && styles.regionDDLTriggerFocused,
                          !cityResolved && styles.regionDDLTriggerDisabled,
                        ]}
                        onPress={() => {
                          if (!cityResolved) {
                            Alert.alert('提示', '请先选择省、市');
                            return;
                          }
                          setRegionDistOpen((o) => !o);
                          setRegionProvOpen(false);
                          setRegionCityOpen(false);
                        }}
                      >
                        <Text
                          style={[styles.regionDDLText, !newCustDistrict && styles.regionDDLPlaceholder]}
                          numberOfLines={1}
                        >
                          {newCustDistrict || '区县'}
                        </Text>
                        <Ionicons name="chevron-down-outline" size={18} color="#8892a6" />
                      </Pressable>
                    </View>
                  </View>
                </View>
                <View style={styles.addCustBlock}>
                  <View style={styles.addCustLabelRow}>
                    <Ionicons name="home-outline" size={18} color="#0d9488" />
                    <Text style={styles.addCustLabel}>详细地址</Text>
                  </View>
                  <TextInput
                    style={[styles.input, styles.addressArea]}
                    value={newCustAddress}
                    onChangeText={setNewCustAddress}
                    placeholder="请输入详细地址"
                    placeholderTextColor="#aab4c7"
                    multiline
                    maxLength={200}
                    textAlignVertical="top"
                  />
                  <Text style={styles.addressCounter}>{newCustAddress.length}/200</Text>
                </View>
              </ScrollView>
              <View style={styles.addCustomerFooter}>
                <Pressable style={styles.addCustCancelBtn} onPress={closeModal} disabled={addCustomerSaving}>
                  <Text style={styles.addCustCancelBtnText}>取消</Text>
                </Pressable>
                <Pressable
                  style={[styles.addCustConfirmBtn, addCustomerSaving && styles.btnDisabled]}
                  onPress={() => void submitNewCustomer()}
                  disabled={addCustomerSaving}
                >
                  {addCustomerSaving ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text style={styles.addCustConfirmBtnText}>确定</Text>
                  )}
                </Pressable>
              </View>
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>

      <Modal
        visible={visible && (regionProvOpen || regionCityOpen || regionDistOpen)}
        transparent
        animationType="fade"
        onRequestClose={() => {
          setRegionProvOpen(false);
          setRegionCityOpen(false);
          setRegionDistOpen(false);
        }}
      >
        <View style={styles.formulaModalWrap}>
          <Pressable
            style={styles.formulaModalBackdrop}
            onPress={() => {
              setRegionProvOpen(false);
              setRegionCityOpen(false);
              setRegionDistOpen(false);
            }}
          />
          <View style={styles.pickerSheet}>
            <Text style={styles.modalTitle}>
              {regionProvOpen ? '选择省份' : regionCityOpen ? '选择城市' : '选择区县'}
            </Text>
            <FlatList
              data={regionProvOpen ? provinceOptions : regionCityOpen ? cityOptionsList : districtOptionsList}
              keyExtractor={(item, idx) => `${item}-${idx}`}
              style={styles.regionPickList}
              keyboardShouldPersistTaps="handled"
              renderItem={({ item }) => (
                <Pressable
                  style={({ pressed }) => [styles.regionPickRow, pressed && styles.regionPickRowPressed]}
                  onPress={() => {
                    if (regionProvOpen) {
                      setNewCustProvince(item);
                      setNewCustCity('');
                      setNewCustDistrict('');
                      setRegionProvOpen(false);
                    } else if (regionCityOpen) {
                      setNewCustCity(item);
                      setNewCustDistrict('');
                      setRegionCityOpen(false);
                    } else {
                      setNewCustDistrict(item);
                      setRegionDistOpen(false);
                    }
                  }}
                >
                  <Text style={styles.regionPickRowText} numberOfLines={2}>
                    {item}
                  </Text>
                </Pressable>
              )}
              ListEmptyComponent={
                <Text style={styles.regionACHint}>
                  {regionProvOpen ? '暂无省份数据' : regionCityOpen ? '暂无城市数据' : '暂无区县数据'}
                </Text>
              }
            />
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
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
  btnDisabled: {
    opacity: 0.65,
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
});

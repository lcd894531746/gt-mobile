import { File, Paths } from 'expo-file-system';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  FlatList,
  Keyboard,
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
import type { TextStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AddCustomerModal } from '../components/AddCustomerModal';
import { QuotePrintPreviewModal } from '../components/QuotePrintPreviewModal';
import { PageScaffold } from '../components/PageScaffold';
import type { PreviewRecord } from '../components/printTemplate/RenderTemplateViews';
import {
  createQuote,
  deleteQuote,
  exportQuoteToExcel,
  fetchQuoteDetail,
  fetchRemoteTemplates,
  fetchUnshippedQuotes,
  getFormulas,
  searchCustomer,
} from '../services/api';
import type { TemplateDoc } from '../types/printTemplate';
import {
  getCustomerCommittedLabel,
  getCustomerDisplayName,
  getCustomerId,
  normalizeCustomers,
  type CustomerRow,
} from '../utils/offerHelpers';
import { buildTemplatePrintHtml, printHtmlInBrowser } from '../utils/printTemplatePrint';
import { exportQuoteToExcelInBrowser } from '../utils/quoteExcelWebExport';
import { calculateWeight, roundTo } from '../utils/weightCalculator';

type FormulaOpt = {
  name: string;
  unit: string;
  parameters: string;
  formula: string;
  priceDecimal: number;
  weightDecimal: number;
  calculationMethod: string;
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
  隔板重: string;
  隔板价: string;
  称重单价: string;
  理论重量: string;
  总重量: string;
  单价: string;
  金额: string;
  备注: string;
  公式: string;
  重量小数位: number;
  单价小数位: number;
  计算方式: string;
};

type BusyAction = 'preview' | 'export' | 'print' | 'save' | null;

type QuoteSaveArtifacts = {
  exportPayload: Record<string, unknown>;
  savePayload: Record<string, unknown>;
  previewData: PreviewRecord;
  orderNumber: string;
  customerDisplayName: string;
};

const CALC_METHOD_FALLBACK = '四舍五入';
const DEFAULT_COMPANY_OPTIONS = ['无锡苏众电气有限公司', '上海苏众电气成套设备有限公司'];

const DEFAULT_COMPANY_ADDRESS = '无锡市惠山区惠成路88号（6号厂院）苏众';

const COL = {
  idx: 40,
  name: 110,
  material: 86,
  spec: 120,
  unit: 52,
  qty: 62,
  w1: 72,
  p1: 72,
  w2: 72,
  p2: 72,
  w3: 78,
  p3: 78,
  theory: 90,
  total: 90,
  unitPrice: 82,
  amount: 92,
  remark: 120,
  del: 48,
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
  COL.w3 +
  COL.p3 +
  COL.theory +
  COL.total +
  COL.unitPrice +
  COL.amount +
  COL.remark +
  COL.del;

function measureTextUnits(value: string): number {
  return Array.from(value).reduce((sum, char) => sum + (/[\x00-\xff]/.test(char) ? 0.62 : 1), 0);
}

function estimateColumnWidth(values: string[], minWidth: number, maxWidth: number, fontSize = 13, padding = 28): number {
  const widest = values.reduce((max, value) => Math.max(max, measureTextUnits(String(value ?? '').trim())), 0);
  return Math.max(minWidth, Math.min(maxWidth, Math.ceil(widest * fontSize + padding)));
}

function normalizeFormulas(raw: unknown): FormulaOpt[] {
  const list = Array.isArray(raw)
    ? raw
    : raw && typeof raw === 'object' && Array.isArray((raw as { data?: unknown }).data)
      ? ((raw as { data: unknown[] }).data as unknown[])
      : [];

  return list
    .map((item) => {
      const row = item as Record<string, unknown>;
      return {
        name: String(row['品名'] ?? row.name ?? '').trim(),
        unit: String(row['单位'] ?? row.unit ?? '米').trim() || '米',
        parameters: String(row['参数'] ?? row.parameters ?? '').trim(),
        formula: String(row['公式'] ?? row.formula ?? '').trim(),
        priceDecimal: Number(row['单价小数位'] ?? row.priceDecimal ?? 2) || 2,
        weightDecimal: Number(row['重量小数位'] ?? row.weightDecimal ?? 6) || 6,
        calculationMethod: String(row['计算方式'] ?? row.calculationMethod ?? CALC_METHOD_FALLBACK).trim() || CALC_METHOD_FALLBACK,
      };
    })
    .filter((item) => item.name !== '');
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

function stringValue(value: unknown): string {
  if (value == null) return '';
  return String(value);
}

function parseMaybeNumber(value: unknown): number | null {
  if (value == null) return null;
  const text = String(value).trim();
  if (!text) return null;
  const num = Number(text);
  return Number.isFinite(num) ? num : null;
}

function formatFixed(value: number | null, digits: number): string {
  if (value == null || !Number.isFinite(value)) return '';
  return value.toFixed(digits);
}

function genLineKey(): string {
  return `L-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function formatDateTime(value: unknown): string {
  if (value == null || value === '') return '—';
  const date = new Date(value as string | number | Date);
  if (Number.isNaN(date.getTime())) return String(value);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

function formatDateOnly(date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function formatQuoteCellNum(value: unknown, digits: number): string {
  const num = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(num) ? num.toFixed(digits) : (0).toFixed(digits);
}

function parseScalePrices(raw: string): number[] {
  return raw
    .split(/[\/／,，;；\s]+/)
    .map((item) => Number(item.trim()))
    .filter((item) => Number.isFinite(item));
}

function pickScalePrice(prices: number[], index: number): number | null {
  if (prices.length === 0) return null;
  if (prices[index] != null) return prices[index]!;
  return prices[prices.length - 1] ?? null;
}

function formatComputedNumber(value: number, digits: number, method: string): string {
  return roundTo(value, digits, method).toFixed(digits);
}

function amountToChineseUpper(raw: number): string {
  if (!Number.isFinite(raw)) return '';
  const num = Math.round(raw * 100);
  if (num === 0) return '零元整';

  const digit = ['零', '壹', '贰', '叁', '肆', '伍', '陆', '柒', '捌', '玖'];
  const unit1 = ['', '拾', '佰', '仟'];
  const unit2 = ['', '万', '亿', '兆'];

  const integer = Math.floor(num / 100);
  const decimal = num % 100;

  const integerToChinese = (value: number) => {
    let sectionIndex = 0;
    let sectionValue = value;
    let result = '';
    let needZero = false;

    while (sectionValue > 0) {
      const section = sectionValue % 10000;
      if (section === 0) {
        if (result && !result.startsWith('零')) {
          result = `零${result}`;
        }
      } else {
        let sectionText = '';
        let inner = section;
        let unitIndex = 0;
        let zeroPending = false;
        while (inner > 0) {
          const n = inner % 10;
          if (n === 0) {
            if (sectionText && !sectionText.startsWith('零')) {
              zeroPending = true;
            }
          } else {
            sectionText = `${zeroPending ? '零' : ''}${digit[n]}${unit1[unitIndex]}${sectionText}`;
            zeroPending = false;
          }
          unitIndex += 1;
          inner = Math.floor(inner / 10);
        }

        if (needZero && result && !sectionText.endsWith('零')) {
          sectionText += '零';
        }
        result = `${sectionText}${unit2[sectionIndex]}${result}`;
        needZero = section < 1000;
      }
      sectionIndex += 1;
      sectionValue = Math.floor(sectionValue / 10000);
    }

    return result.replace(/零+/g, '零').replace(/零(万|亿|兆)/g, '$1').replace(/零+$/g, '') || '零';
  };

  const integerPart = `${integerToChinese(integer)}元`;
  const jiao = Math.floor(decimal / 10);
  const fen = decimal % 10;
  if (jiao === 0 && fen === 0) return `${integerPart}整`;
  const jiaoPart = jiao > 0 ? `${digit[jiao]}角` : '';
  const fenPart = fen > 0 ? `${digit[fen]}分` : '';
  const zeroPart = jiao === 0 && fen > 0 ? '零' : '';
  return `${integerPart}${zeroPart}${jiaoPart}${fenPart}`;
}

function quoteDetailToDraftLine(item: Record<string, unknown>): DraftLine {
  return {
    key: genLineKey(),
    品名: stringValue(item['品名']).trim(),
    材质: stringValue(item['材质'] ?? item.material).trim(),
    规格: stringValue(item['规格']).trim(),
    单位: stringValue(item['单位'] ?? '米').trim() || '米',
    数量: stringValue(item['数量']).trim(),
    槽重: stringValue(item['重量1'] ?? item.weight1).trim(),
    槽价: stringValue(item['单价1'] ?? item.price1).trim(),
    盖重: stringValue(item['重量2'] ?? item.weight2).trim(),
    盖价: stringValue(item['单价2'] ?? item.price2).trim(),
    隔板重: stringValue(item['重量3'] ?? item.weight3).trim(),
    隔板价: stringValue(item['单价3'] ?? item.price3).trim(),
    称重单价: stringValue(item['称重单价']).trim(),
    理论重量: stringValue(item['理论重量'] ?? item.weight).trim(),
    总重量: stringValue(item['总重量']).trim(),
    单价: stringValue(item['单价'] ?? item.unitPrice ?? item.price).trim(),
    金额: stringValue(item['金额'] ?? item.totalAmount).trim(),
    备注: stringValue(item['备注'] ?? item.remark ?? item.note).trim(),
    公式: stringValue(item['公式'] ?? item.formula).trim(),
    重量小数位: Number(item['重量小数位'] ?? item.weightDecimal ?? 6) || 6,
    单价小数位: Number(item['单价小数位'] ?? item.priceDecimal ?? 2) || 2,
    计算方式: stringValue(item['计算方式'] ?? item.calculationMethod).trim() || CALC_METHOD_FALLBACK,
  };
}

function createLineFromFormula(formula: FormulaOpt, material: string, spec: string, scalePrice: string): DraftLine {
  return {
    key: genLineKey(),
    品名: formula.name,
    材质: material.trim(),
    规格: spec.trim(),
    单位: formula.unit || '米',
    数量: '',
    槽重: '',
    槽价: '',
    盖重: '',
    盖价: '',
    隔板重: '',
    隔板价: '',
    称重单价: scalePrice.trim(),
    理论重量: '',
    总重量: '',
    单价: '',
    金额: '',
    备注: '',
    公式: formula.formula,
    重量小数位: formula.weightDecimal || 6,
    单价小数位: formula.priceDecimal || 2,
    计算方式: formula.calculationMethod || CALC_METHOD_FALLBACK,
  };
}

function recomputeLine(
  line: DraftLine,
  options: {
    recomputeFromSpec?: boolean;
    recomputeComponentPrices?: boolean;
  } = {},
): DraftLine {
  const weightDigits = line.重量小数位 || 6;
  const priceDigits = line.单价小数位 || 2;
  const calcMethod = line.计算方式 || CALC_METHOD_FALLBACK;

  let 槽重 = line.槽重.trim();
  let 盖重 = line.盖重.trim();
  let 隔板重 = line.隔板重.trim();

  if (options.recomputeFromSpec && line.规格.trim() && line.公式.trim()) {
    const weights = calculateWeight(line.规格.trim(), line.公式.trim(), weightDigits);
    槽重 = weights[0] != null ? formatFixed(weights[0], weightDigits) : '';
    盖重 = weights[1] != null ? formatFixed(weights[1], weightDigits) : '';
    隔板重 = weights[2] != null ? formatFixed(weights[2], weightDigits) : '';
  }

  let 槽价 = line.槽价.trim();
  let 盖价 = line.盖价.trim();
  let 隔板价 = line.隔板价.trim();
  if (options.recomputeFromSpec || options.recomputeComponentPrices) {
    const prices = parseScalePrices(line.称重单价.trim());
    const slotScale = pickScalePrice(prices, 0);
    const coverScale = pickScalePrice(prices, 1);
    const separatorScale = pickScalePrice(prices, 2);
    const slotWeight = parseMaybeNumber(槽重);
    const coverWeight = parseMaybeNumber(盖重);
    const separatorWeight = parseMaybeNumber(隔板重);

    槽价 = slotScale != null && slotWeight != null ? formatComputedNumber(slotWeight * slotScale, priceDigits, calcMethod) : '';
    盖价 = coverScale != null && coverWeight != null ? formatComputedNumber(coverWeight * coverScale, priceDigits, calcMethod) : '';
    隔板价 = separatorScale != null && separatorWeight != null ? formatComputedNumber(separatorWeight * separatorScale, priceDigits, calcMethod) : '';
  }

  const slotWeight = parseMaybeNumber(槽重);
  const coverWeight = parseMaybeNumber(盖重);
  const separatorWeight = parseMaybeNumber(隔板重);
  const slotPrice = parseMaybeNumber(槽价);
  const coverPrice = parseMaybeNumber(盖价);
  const separatorPrice = parseMaybeNumber(隔板价);
  const qty = parseMaybeNumber(line.数量);

  const hasAnyWeight = slotWeight != null || coverWeight != null || separatorWeight != null;
  const theoryWeight = hasAnyWeight
    ? formatComputedNumber((slotWeight ?? 0) + (coverWeight ?? 0) + (separatorWeight ?? 0), weightDigits, calcMethod)
    : '';

  const hasAnyPrice = slotPrice != null || coverPrice != null || separatorPrice != null;
  const computedUnitPriceValue = hasAnyPrice ? (slotPrice ?? 0) + (coverPrice ?? 0) + (separatorPrice ?? 0) : null;
  const currentUnitPriceValue = parseMaybeNumber(line.单价);
  const resolvedUnitPriceValue =
    options.recomputeFromSpec || options.recomputeComponentPrices
      ? computedUnitPriceValue
      : (currentUnitPriceValue ?? computedUnitPriceValue);
  const 单价 = resolvedUnitPriceValue != null ? formatComputedNumber(resolvedUnitPriceValue, priceDigits, calcMethod) : '';
  const 金额 =
    qty != null && resolvedUnitPriceValue != null
      ? formatComputedNumber(qty * resolvedUnitPriceValue, priceDigits, calcMethod)
      : '';
  const theoryWeightValue = parseMaybeNumber(theoryWeight);
  const 总重量 =
    qty != null && theoryWeightValue != null
      ? formatComputedNumber(qty * theoryWeightValue, weightDigits, calcMethod)
      : '';

  return {
    ...line,
    槽重,
    盖重,
    隔板重,
    槽价,
    盖价,
    隔板价,
    理论重量: theoryWeight,
    总重量,
    单价,
    金额,
  };
}

function buildPreviewItem(line: DraftLine, index: number): Record<string, unknown> {
  return {
    index: String(index + 1),
    id: String(index + 1),
    name: line.品名.trim(),
    productName: line.品名.trim(),
    product_name: line.品名.trim(),
    品名: line.品名.trim(),
    material: line.材质.trim(),
    材质: line.材质.trim(),
    specification: line.规格.trim(),
    spec: line.规格.trim(),
    product_spec: line.规格.trim(),
    规格: line.规格.trim(),
    unit: line.单位.trim(),
    unitName: line.单位.trim(),
    单位: line.单位.trim(),
    quantity: line.数量.trim(),
    数量: line.数量.trim(),
    weight1: line.槽重.trim(),
    重量1: line.槽重.trim(),
    槽重: line.槽重.trim(),
    price1: line.槽价.trim(),
    单价1: line.槽价.trim(),
    槽价: line.槽价.trim(),
    weight2: line.盖重.trim(),
    重量2: line.盖重.trim(),
    盖重: line.盖重.trim(),
    price2: line.盖价.trim(),
    单价2: line.盖价.trim(),
    盖价: line.盖价.trim(),
    weight3: line.隔板重.trim(),
    重量3: line.隔板重.trim(),
    隔板重: line.隔板重.trim(),
    price3: line.隔板价.trim(),
    单价3: line.隔板价.trim(),
    隔板价: line.隔板价.trim(),
    weight: line.理论重量.trim(),
    理论重量: line.理论重量.trim(),
    totalWeight: line.总重量.trim(),
    总重量: line.总重量.trim(),
    unitPrice: line.单价.trim(),
    price: line.单价.trim(),
    单价: line.单价.trim(),
    totalAmount: line.金额.trim(),
    totalPrice: line.金额.trim(),
    amount: line.金额.trim(),
    金额: line.金额.trim(),
    remark: line.备注.trim(),
    note: line.备注.trim(),
    memo: line.备注.trim(),
    备注: line.备注.trim(),
    称重单价: line.称重单价.trim(),
  };
}

export function OfferScreen() {
  const insets = useSafeAreaInsets();
  const [formulas, setFormulas] = useState<FormulaOpt[]>([]);
  const [formulasLoading, setFormulasLoading] = useState(false);

  const [customerKeyword, setCustomerKeyword] = useState('');
  const [customerIdText, setCustomerIdText] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [contactPerson, setContactPerson] = useState('');
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerRow | null>(null);
  const [customerOptions, setCustomerOptions] = useState<CustomerRow[]>([]);
  const [customerDropdownVisible, setCustomerDropdownVisible] = useState(false);
  const [customerSearching, setCustomerSearching] = useState(false);
  const [customerInputFocused, setCustomerInputFocused] = useState(false);

  const [addCustomerModalVisible, setAddCustomerModalVisible] = useState(false);
  const [lines, setLines] = useState<DraftLine[]>([]);
  const [addProductName, setAddProductName] = useState('');
  const [addScalePrice, setAddScalePrice] = useState('');
  const [addMaterial, setAddMaterial] = useState('');
  const [addSpec, setAddSpec] = useState('');
  const [formulaPickerVisible, setFormulaPickerVisible] = useState(false);
  const [addProductModalVisible, setAddProductModalVisible] = useState(false);
  const [busyAction, setBusyAction] = useState<BusyAction>(null);

  const [previewVisible, setPreviewVisible] = useState(false);
  const [previewTemplate, setPreviewTemplate] = useState<TemplateDoc | null>(null);
  const [previewData, setPreviewData] = useState<PreviewRecord | null>(null);
  const [saveOptionsVisible, setSaveOptionsVisible] = useState(false);
  const [saveCompanyOpen, setSaveCompanyOpen] = useState(false);
  const [saveCompanyName, setSaveCompanyName] = useState(DEFAULT_COMPANY_OPTIONS[0] ?? '');
  const [saveTemplatesLoading, setSaveTemplatesLoading] = useState(false);
  const [saveTemplates, setSaveTemplates] = useState<TemplateDoc[]>([]);
  const [selectedTemplateName, setSelectedTemplateName] = useState('');

  const [unshippedModalVisible, setUnshippedModalVisible] = useState(false);
  const [unshippedQuotes, setUnshippedQuotes] = useState<Record<string, unknown>[]>([]);
  const [unshippedLoading, setUnshippedLoading] = useState(false);
  const [expandedQuoteNo, setExpandedQuoteNo] = useState<string | null>(null);
  const [expandedDetailLines, setExpandedDetailLines] = useState<Record<string, unknown>[]>([]);
  const [expandedDetailLoading, setExpandedDetailLoading] = useState(false);
  const [editingQuoteNo, setEditingQuoteNo] = useState<string | null>(null);

  const customerBlurTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const customerSearchSeqRef = useRef(0);
  const customerInputRef = useRef<TextInput | null>(null);
  const isFirstFocus = useRef(true);

  const saving = busyAction === 'save';
  const pageBusy = busyAction != null;

  const normalizedLines = useMemo(() => lines.map((line) => recomputeLine(line)), [lines]);
  const tableCols = useMemo(() => {
    const nameWidth = estimateColumnWidth(normalizedLines.map((line) => line.品名), COL.name, 220);
    const materialWidth = estimateColumnWidth(normalizedLines.map((line) => line.材质), COL.material, 180);
    const specWidth = estimateColumnWidth(normalizedLines.map((line) => line.规格), COL.spec, 360);
    const remarkWidth = estimateColumnWidth(normalizedLines.map((line) => line.备注), COL.remark, 220);
    return {
      ...COL,
      name: nameWidth,
      material: materialWidth,
      spec: specWidth,
      remark: remarkWidth,
    };
  }, [normalizedLines]);
  const tableMinWidth = useMemo(
    () =>
      tableCols.idx +
      tableCols.name +
      tableCols.material +
      tableCols.spec +
      tableCols.unit +
      tableCols.qty +
      tableCols.w1 +
      tableCols.p1 +
      tableCols.w2 +
      tableCols.p2 +
      tableCols.w3 +
      tableCols.p3 +
      tableCols.theory +
      tableCols.total +
      tableCols.unitPrice +
      tableCols.amount +
      tableCols.remark +
      tableCols.del,
    [tableCols],
  );
  const selectedTemplateDoc = useMemo(
    () => saveTemplates.find((item) => item.name === selectedTemplateName) ?? null,
    [saveTemplates, selectedTemplateName],
  );
  const canOpenSaveOptions = Boolean(customerIdText.trim()) && normalizedLines.length > 0;

  const totals = useMemo(() => {
    let qtySum = 0;
    let amountSum = 0;
    for (const line of normalizedLines) {
      qtySum += parseMaybeNumber(line.数量) ?? 0;
      amountSum += parseMaybeNumber(line.金额) ?? 0;
    }
    return { qtySum, amountSum };
  }, [normalizedLines]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setFormulasLoading(true);
      try {
        const raw = await getFormulas();
        if (!cancelled) {
          setFormulas(normalizeFormulas(raw));
        }
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

  useEffect(() => () => {
    if (customerBlurTimerRef.current) {
      clearTimeout(customerBlurTimerRef.current);
    }
  }, []);

  const resetCustomerFields = useCallback(() => {
    setCustomerKeyword('');
    setCustomerIdText('');
    setContactPhone('');
    setContactPerson('');
    setSelectedCustomer(null);
    setCustomerOptions([]);
    setCustomerDropdownVisible(false);
    setCustomerSearching(false);
    setCustomerInputFocused(false);
  }, []);

  const fillCustomerFromRow = useCallback((row: CustomerRow) => {
    setSelectedCustomer(row);
    setCustomerKeyword(String(row['简称'] ?? getCustomerDisplayName(row) ?? getCustomerCommittedLabel(row)).trim());
    setCustomerIdText(getCustomerId(row));
    setContactPhone(String(row['客户电话'] ?? row['联系电话'] ?? row.phone ?? row.mobile ?? '').trim());
    setContactPerson(String(row['客户代表'] ?? row['联系人'] ?? row.contact ?? '').trim());
    setCustomerOptions([]);
    setCustomerDropdownVisible(false);
    setCustomerSearching(false);
  }, []);

  const clearWorkspace = useCallback(() => {
    resetCustomerFields();
    setLines([]);
    setAddProductName('');
    setAddScalePrice('');
    setAddMaterial('');
    setAddSpec('');
    setFormulaPickerVisible(false);
    setAddProductModalVisible(false);
    setEditingQuoteNo(null);
    setUnshippedModalVisible(false);
    setExpandedQuoteNo(null);
    setExpandedDetailLines([]);
    setExpandedDetailLoading(false);
    setPreviewVisible(false);
    setPreviewTemplate(null);
    setPreviewData(null);
    setSaveOptionsVisible(false);
    setSaveCompanyOpen(false);
    setSaveCompanyName(DEFAULT_COMPANY_OPTIONS[0] ?? '');
    setSaveTemplates([]);
    setSelectedTemplateName('');
    setBusyAction(null);
  }, [resetCustomerFields]);

  useFocusEffect(
    useCallback(() => {
      if (isFirstFocus.current) {
        isFirstFocus.current = false;
        return;
      }
      clearWorkspace();
    }, [clearWorkspace]),
  );

  const normalizeCustomerList = useCallback((raw: unknown) => normalizeCustomers(raw), []);

  const performCustomerSearch = useCallback(
    async (query: string) => {
      const text = query.trim();
      const seq = ++customerSearchSeqRef.current;
      if (!text) {
        setCustomerOptions([]);
        setCustomerSearching(false);
        return;
      }

      setCustomerSearching(true);
      try {
        const raw = await searchCustomer(text);
        if (seq !== customerSearchSeqRef.current) return;
        setCustomerOptions(normalizeCustomerList(raw));
      } catch {
        if (seq !== customerSearchSeqRef.current) return;
        setCustomerOptions([]);
      } finally {
        if (seq === customerSearchSeqRef.current) {
          setCustomerSearching(false);
        }
      }
    },
    [normalizeCustomerList],
  );

  const handleCustomerInputChange = useCallback(
    (text: string) => {
      setCustomerKeyword(text);
      setSelectedCustomer(null);
      setCustomerIdText('');
      setCustomerDropdownVisible(true);
      void performCustomerSearch(text);
    },
    [performCustomerSearch],
  );

  const handleCustomerFocus = useCallback(() => {
    if (customerBlurTimerRef.current) {
      clearTimeout(customerBlurTimerRef.current);
      customerBlurTimerRef.current = null;
    }
    setCustomerInputFocused(true);
    setCustomerDropdownVisible(true);
    if (customerKeyword.trim()) {
      void performCustomerSearch(customerKeyword);
    }
  }, [customerKeyword, performCustomerSearch]);

  const handleCustomerBlur = useCallback(() => {
    if (Platform.OS === 'web') {
      return;
    }
    if (customerBlurTimerRef.current) {
      clearTimeout(customerBlurTimerRef.current);
    }
    setCustomerInputFocused(false);
    customerBlurTimerRef.current = setTimeout(() => {
      setCustomerDropdownVisible(false);
      if (selectedCustomer && !customerKeyword.trim()) {
        setCustomerKeyword(String(selectedCustomer['简称'] ?? getCustomerDisplayName(selectedCustomer) ?? getCustomerCommittedLabel(selectedCustomer)).trim());
      }
    }, 180);
  }, [customerKeyword, selectedCustomer]);

  const cancelCustomerBlur = useCallback(() => {
    if (customerBlurTimerRef.current) {
      clearTimeout(customerBlurTimerRef.current);
      customerBlurTimerRef.current = null;
    }
  }, []);

  const closeCustomerDropdown = useCallback(() => {
    cancelCustomerBlur();
    setCustomerInputFocused(false);
    setCustomerDropdownVisible(false);
  }, [cancelCustomerBlur]);

  const dismissQuoteTransientUi = useCallback(() => {
    cancelCustomerBlur();
    customerInputRef.current?.blur();
    setCustomerInputFocused(false);
    setCustomerDropdownVisible(false);
    Keyboard.dismiss();
  }, [cancelCustomerBlur]);

  const focusCustomerInput = useCallback(() => {
    cancelCustomerBlur();
    setCustomerInputFocused(true);
    setCustomerDropdownVisible(true);
    if (customerKeyword.trim()) {
      void performCustomerSearch(customerKeyword);
    }
    requestAnimationFrame(() => {
      customerInputRef.current?.focus();
    });
  }, [cancelCustomerBlur, customerKeyword, performCustomerSearch]);

  useEffect(() => {
    if (!saveOptionsVisible && !previewVisible) return;
    dismissQuoteTransientUi();
  }, [dismissQuoteTransientUi, previewVisible, saveOptionsVisible]);

  const loadUnshippedList = useCallback(async () => {
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
  }, []);

  const openUnshippedModal = useCallback(() => {
    setUnshippedModalVisible(true);
    setExpandedQuoteNo(null);
    setExpandedDetailLines([]);
    void loadUnshippedList();
  }, [loadUnshippedList]);

  const loadExpandedDetail = useCallback(async (orderNo: string) => {
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
  }, []);

  const toggleExpandQuote = useCallback(
    (orderNo: string) => {
      if (!orderNo) return;
      if (expandedQuoteNo === orderNo) {
        setExpandedQuoteNo(null);
        setExpandedDetailLines([]);
        return;
      }
      setExpandedQuoteNo(orderNo);
      void loadExpandedDetail(orderNo);
    },
    [expandedQuoteNo, loadExpandedDetail],
  );

  const handleEditQuoteFromUnshipped = useCallback(
    async (quote: Record<string, unknown>) => {
      const orderNo = String(quote['报价单号'] ?? '').trim();
      if (!orderNo) return;

      try {
        const raw = await fetchQuoteDetail(orderNo);
        const details = normalizeQuoteDetailLines(raw);
        const customerRow = {
          客户编号: String(quote['客户ID'] ?? '').trim(),
          客户名称: String(quote['客户名称'] ?? '').trim(),
          联系电话: String(quote['联系电话'] ?? '').trim(),
          联系人: String(quote['联系人'] ?? '').trim(),
        } as CustomerRow;

        fillCustomerFromRow(customerRow);
        setLines(details.map((item) => recomputeLine(quoteDetailToDraftLine(item))));
        setEditingQuoteNo(orderNo);
        setUnshippedModalVisible(false);
        setExpandedQuoteNo(null);
        setExpandedDetailLines([]);
      } catch {
        Alert.alert('失败', '加载报价单详情失败');
      }
    },
    [fillCustomerFromRow],
  );

  const handleDeleteQuoteFromUnshipped = useCallback(
    (quote: Record<string, unknown>) => {
      const orderNo = String(quote['报价单号'] ?? '').trim();
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
                const success =
                  data && typeof data === 'object'
                    ? (data as { success?: unknown }).success
                    : undefined;
                const ok = success === true || success === 1 || success === 'true';
                if (!ok) {
                  const errorText =
                    data && typeof data === 'object'
                      ? String((data as { error?: unknown; message?: unknown }).error ?? (data as { message?: unknown }).message ?? '')
                      : '';
                  Alert.alert('失败', errorText || '删除失败');
                  return;
                }
                Alert.alert('成功', '报价单删除成功');
                await loadUnshippedList();
              } catch {
                Alert.alert('失败', '删除报价单失败');
              }
            })(),
        },
      ]);
    },
    [loadUnshippedList],
  );

  const updateLine = useCallback(
    (
      key: string,
      patch: Partial<DraftLine>,
      options: {
        recomputeFromSpec?: boolean;
        recomputeComponentPrices?: boolean;
      } = {},
    ) => {
      setLines((prev) =>
        prev.map((line) => {
          if (line.key !== key) return line;
          return recomputeLine({ ...line, ...patch }, options);
        }),
      );
    },
    [],
  );

  const removeLine = useCallback((key: string) => {
    setLines((prev) => prev.filter((line) => line.key !== key));
  }, []);

  const resetAddProductDraft = useCallback(() => {
    setAddProductName('');
    setAddMaterial('');
    setAddSpec('');
    setAddScalePrice('');
    setFormulaPickerVisible(false);
  }, []);

  const commitAddProductLine = useCallback((): boolean => {
    const formula = formulas.find((item) => item.name === addProductName);
    if (!formula) {
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

    const line = recomputeLine(
      createLineFromFormula(formula, addMaterial, addSpec, addScalePrice),
      { recomputeFromSpec: true, recomputeComponentPrices: true },
    );

    setLines((prev) => [...prev, line]);
    setAddMaterial('');
    setAddSpec('');
    return true;
  }, [addMaterial, addProductName, addScalePrice, addSpec, formulas]);

  const validateQuoteBeforeSave = useCallback((rows: DraftLine[]): boolean => {
    if (!customerIdText.trim()) {
      Alert.alert('提示', '请选择客户');
      return false;
    }
    if (rows.length === 0) {
      Alert.alert('提示', '请至少添加一行产品');
      return false;
    }

    for (const line of rows) {
      const qty = parseMaybeNumber(line.数量);
      const unitPrice = parseMaybeNumber(line.单价);
      if (!line.数量.trim() || qty == null || qty <= 0) {
        Alert.alert('提示', '请填写完整的数量');
        return false;
      }
      if (!line.单价.trim() || unitPrice == null) {
        Alert.alert('提示', '当前产品单价未计算完成，请检查规格或称重单价');
        return false;
      }
    }

    return true;
  }, [customerIdText]);

  const buildQuoteSaveArtifacts = useCallback(
    (companyName = '公司名称'): QuoteSaveArtifacts => {
      const customerDisplayName =
        getCustomerCommittedLabel(selectedCustomer) ||
        getCustomerDisplayName(selectedCustomer) ||
        customerKeyword.trim() ||
        customerIdText.trim();
      const orderNumber = editingQuoteNo?.trim() || `QT-${Date.now()}`;
      const orderDate = formatDateOnly();
      const exportBasePayload: Record<string, unknown> = {
        companyName,
        companyAddress: DEFAULT_COMPANY_ADDRESS,
        companyPhone: '',
        companyFax: '15312481011',
        customerName: customerDisplayName,
        customerPhone: contactPhone.trim(),
        contactPerson: contactPerson.trim(),
        customerAddress: String(
          selectedCustomer?.['瀹㈡埛鍦板潃'] ??
            selectedCustomer?.['鍦板潃'] ??
            selectedCustomer?.address ??
            '',
        ).trim(),
        orderNumber,
        orderDate,
        totalAmount: '0.00',
        totalAmountInWords: '',
        totalWeight: '0.000000',
        totalQuantity: totals.qtySum.toFixed(2),
      };

      const productLines = normalizedLines.map((line, index) => {
        const item = buildPreviewItem(line, index);
        return {
          品名: String(item.品名 ?? ''),
          材质: String(item.材质 ?? ''),
          规格: String(item.规格 ?? ''),
          单位: String(item.单位 ?? ''),
          数量: String(item.数量 ?? ''),
          单价: String(item.单价 ?? ''),
          金额: String(item.金额 ?? ''),
          理论重量: String(item.理论重量 ?? ''),
          总重量: String(item.总重量 ?? ''),
          备注: String(item.备注 ?? ''),
          重量1: String(item.重量1 ?? ''),
          重量2: String(item.重量2 ?? ''),
          重量3: String(item.重量3 ?? ''),
          单价1: String(item.单价1 ?? ''),
          单价2: String(item.单价2 ?? ''),
          单价3: String(item.单价3 ?? ''),
          称重单价: String(item.称重单价 ?? ''),
          公式: line.公式,
          重量小数位: line.重量小数位,
          单价小数位: line.单价小数位,
          计算方式: line.计算方式,
        };
      });

      const totalAmount = productLines.reduce((sum, line) => sum + (parseMaybeNumber(line.金额) ?? 0), 0);
      const totalWeight = productLines.reduce((sum, line) => sum + (parseMaybeNumber(line.总重量) ?? 0), 0);
      const previewItems = normalizedLines.map((line, index) => buildPreviewItem(line, index));
      const customerAddress = String(
        selectedCustomer?.['客户地址'] ??
          selectedCustomer?.['地址'] ??
          selectedCustomer?.address ??
          '',
      ).trim();

      exportBasePayload.totalAmount = totalAmount.toFixed(2);
      exportBasePayload.totalAmountInWords = amountToChineseUpper(totalAmount);
      exportBasePayload.totalWeight = totalWeight.toFixed(6);
      exportBasePayload.totalQuantity = totals.qtySum.toFixed(2);

      exportBasePayload.customerAddress = customerAddress;
      exportBasePayload['客户地址'] = customerAddress;
      exportBasePayload.contactPerson = contactPerson.trim();
      exportBasePayload['联系人'] = contactPerson.trim();
      exportBasePayload.customerPhone = contactPhone.trim();
      exportBasePayload['联系电话'] = contactPhone.trim();

      const preview: PreviewRecord = {
        companyName,
        companyAddress: DEFAULT_COMPANY_ADDRESS,
        companyPhone: '',
        companyFax: '15312481011',
        customerName: customerDisplayName,
        customerAddress,
        customerPhone: contactPhone.trim(),
        contactPerson: contactPerson.trim(),
        orderNumber,
        orderDate,
        totalAmount: totalAmount.toFixed(2),
        totalWeight: totalWeight.toFixed(6),
        totalQuantity: totals.qtySum.toFixed(2),
        totalAmountInWords: amountToChineseUpper(totalAmount),
        日期: orderDate,
        联系人: contactPerson.trim(),
        联系电话: contactPhone.trim(),
        客户地址: customerAddress,
        客户名称: customerDisplayName,
        应收金额: totalAmount.toFixed(2),
        金额: totalAmount.toFixed(2),
        总金额: totalAmount.toFixed(2),
        小写: totalAmount.toFixed(2),
        金额大写: amountToChineseUpper(totalAmount),
        大写: amountToChineseUpper(totalAmount),
        items: previewItems,
      };

      const savePayload: Record<string, unknown> = {
        客户ID: customerIdText.trim(),
        产品信息: productLines,
        应收金额: totalAmount,
        isEdit: Boolean(editingQuoteNo),
      };
      // 导出/打印需要更完整的头部信息，但保存报价接口尽量保持最小载荷，避免后端因额外字段报错。
      const exportPayload: Record<string, unknown> = {
        ...savePayload,
      };
      Object.assign(exportPayload, exportBasePayload);
      if (editingQuoteNo?.trim()) {
        savePayload['单号'] = editingQuoteNo.trim();
        exportPayload['单号'] = editingQuoteNo.trim();
      }

      return {
        exportPayload,
        savePayload,
        previewData: preview,
        orderNumber,
        customerDisplayName,
      };
    },
    [contactPerson, contactPhone, customerIdText, customerKeyword, editingQuoteNo, normalizedLines, selectedCustomer, totals.qtySum],
  );

  const loadSaveTemplates = useCallback(async () => {
    setSaveTemplatesLoading(true);
    try {
      const templates = await fetchRemoteTemplates();
      setSaveTemplates(templates);
      setSelectedTemplateName((current) => current || templates[0]?.name || '');
    } catch (error) {
      setSaveTemplates([]);
      setSelectedTemplateName('');
      Alert.alert('失败', error instanceof Error ? error.message : '加载打印模板失败');
    } finally {
      setSaveTemplatesLoading(false);
    }
  }, []);

  const openSaveOptions = useCallback(async () => {
    if (pageBusy || !canOpenSaveOptions) return;
    dismissQuoteTransientUi();
    setSaveOptionsVisible(true);
    setSaveCompanyOpen(false);
    if (saveTemplates.length === 0) {
      await loadSaveTemplates();
    }
  }, [canOpenSaveOptions, dismissQuoteTransientUi, loadSaveTemplates, pageBusy, saveTemplates.length]);

  const ensureSaveSelections = useCallback(() => {
    if (!saveCompanyName.trim()) {
      Alert.alert('提示', '请先选择公司抬头');
      return false;
    }
    if (!selectedTemplateDoc) {
      Alert.alert('提示', '请先选择打印模板');
      return false;
    }
    return true;
  }, [saveCompanyName, selectedTemplateDoc]);

  const handlePreview = useCallback(async () => {
    if (pageBusy || !saveOptionsVisible) return;
    dismissQuoteTransientUi();
    if (!validateQuoteBeforeSave(normalizedLines)) return;
    if (!ensureSaveSelections()) return;

    setBusyAction('preview');
    try {
      const artifacts = buildQuoteSaveArtifacts(saveCompanyName);
      setPreviewTemplate(selectedTemplateDoc);
      setPreviewData(artifacts.previewData);
      setSaveCompanyOpen(false);
      setSaveOptionsVisible(false);
      // iOS 上两个 Modal 同时切换容易表现为“点了没反应”，先收起保存弹层再打开预览层。
      setTimeout(() => {
        setPreviewVisible(true);
      }, 0);
    } catch (error) {
      Alert.alert('失败', error instanceof Error ? error.message : '预览失败');
    } finally {
      setBusyAction(null);
    }
  }, [buildQuoteSaveArtifacts, dismissQuoteTransientUi, ensureSaveSelections, normalizedLines, pageBusy, saveCompanyName, saveOptionsVisible, selectedTemplateDoc, validateQuoteBeforeSave]);

  const handleExport = useCallback(async () => {
    if (pageBusy || !saveOptionsVisible) return;
    dismissQuoteTransientUi();
    if (!validateQuoteBeforeSave(normalizedLines)) return;
    if (!ensureSaveSelections()) return;

    setBusyAction('export');
    try {
      const artifacts = buildQuoteSaveArtifacts(saveCompanyName);
      const shareFileName = `${artifacts.orderNumber || `quote_${Date.now()}`}.xlsx`;

      if (Platform.OS === 'web') {
        await exportQuoteToExcelInBrowser(artifacts.exportPayload, shareFileName);
        Alert.alert('成功', 'Excel 已开始下载');
        return;
      }

      const raw = await exportQuoteToExcel(artifacts.exportPayload);
      const buffer =
        raw instanceof ArrayBuffer
          ? raw
          : raw && typeof raw === 'object' && 'buffer' in raw
            ? ((raw as { buffer: ArrayBuffer }).buffer)
            : null;
      if (!buffer) {
        throw new Error('导出的 Excel 数据为空');
      }

      const fileName = `${artifacts.orderNumber || `quote_${Date.now()}`}.xlsx`;
      if ((Platform.OS as string) === 'web' && typeof window !== 'undefined') {
        const blob = new Blob([buffer], {
          type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        });
        const url = window.URL.createObjectURL(blob);
        const anchor = window.document.createElement('a');
        anchor.href = url;
        anchor.download = fileName;
        window.document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
        window.URL.revokeObjectURL(url);
        Alert.alert('成功', 'Excel 已开始下载');
        return;
      }

      const canShare = await Sharing.isAvailableAsync();
      if (!canShare) {
        throw new Error('当前设备暂不支持系统分享');
      }

      const file = new File(Paths.cache, fileName);
      file.create({ overwrite: true, intermediates: true });
      file.write(new Uint8Array(buffer));
      await Sharing.shareAsync(file.uri, {
        mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        dialogTitle: `导出报价：${artifacts.customerDisplayName}`,
      });
    } catch (error) {
      Alert.alert('失败', error instanceof Error ? error.message : 'Excel 导出失败');
    } finally {
      setBusyAction(null);
    }
  }, [buildQuoteSaveArtifacts, dismissQuoteTransientUi, ensureSaveSelections, normalizedLines, pageBusy, saveCompanyName, saveOptionsVisible, validateQuoteBeforeSave]);

  const handlePrint = useCallback(async () => {
    if (pageBusy || !saveOptionsVisible) return;
    dismissQuoteTransientUi();
    if (!validateQuoteBeforeSave(normalizedLines)) return;
    if (!ensureSaveSelections()) return;

    setBusyAction('print');
    try {
      const artifacts = buildQuoteSaveArtifacts(saveCompanyName);
      const templateDoc = selectedTemplateDoc;
      if (!templateDoc) {
        throw new Error('请选择打印模板');
      }
      const { html, pageWidth, pageHeight } = buildTemplatePrintHtml(templateDoc, artifacts.previewData);

      if (Platform.OS === 'web') {
        await printHtmlInBrowser(html, `${artifacts.customerDisplayName || '报价'}打印`);
        return;
      }

      await Print.printAsync({
        html,
        width: pageWidth,
        height: pageHeight,
      });
    } catch (error) {
      Alert.alert('失败', error instanceof Error ? error.message : '打印失败');
    } finally {
      setBusyAction(null);
    }
  }, [buildQuoteSaveArtifacts, dismissQuoteTransientUi, ensureSaveSelections, normalizedLines, pageBusy, saveCompanyName, saveOptionsVisible, selectedTemplateDoc, validateQuoteBeforeSave]);

  const handleSaveQuote = useCallback(async () => {
    if (pageBusy || !saveOptionsVisible) return;
    dismissQuoteTransientUi();
    if (!validateQuoteBeforeSave(normalizedLines)) return;
    if (!ensureSaveSelections()) return;

    setBusyAction('save');
    try {
      const artifacts = buildQuoteSaveArtifacts(saveCompanyName);
      const data = await createQuote(artifacts.savePayload);
      const body = data && typeof data === 'object' ? (data as Record<string, unknown>) : undefined;
      const success = body?.success;
      if (success === false || success === 'false' || success === 0) {
        throw new Error(String(body?.message ?? body?.error ?? '保存失败'));
      }
      Alert.alert('成功', '报价已保存');
      clearWorkspace();
    } catch (error) {
      Alert.alert('失败', error instanceof Error ? error.message : '保存失败');
    } finally {
      setBusyAction(null);
    }
  }, [buildQuoteSaveArtifacts, clearWorkspace, dismissQuoteTransientUi, ensureSaveSelections, normalizedLines, pageBusy, saveCompanyName, saveOptionsVisible, validateQuoteBeforeSave]);

  const handleClosePreview = useCallback(() => {
    setPreviewVisible(false);
    setTimeout(() => {
      setSaveOptionsVisible(true);
    }, 0);
  }, []);

  const confirmCancelCurrent = useCallback(() => {
    if (!customerKeyword.trim() && lines.length === 0) {
      clearWorkspace();
      return;
    }
    Alert.alert('确认取消', '当前报价内容将被清空，确定继续吗？', [
      { text: '继续编辑', style: 'cancel' },
      { text: '清空', style: 'destructive', onPress: clearWorkspace },
    ]);
  }, [clearWorkspace, customerKeyword, lines.length]);

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
            <Pressable
              style={({ pressed }) => [styles.addProductHeaderBtn, pressed && styles.addProductHeaderBtnPressed]}
              onPress={() => setAddCustomerModalVisible(true)}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="添加客户"
            >
              <Ionicons name="add-circle-outline" size={15} color="#204dff" />
              <Text style={styles.addProductHeaderBtnText}>添加客户</Text>
            </Pressable>
          </View>

          <View style={styles.customerComboWrap}>
            <Pressable
              style={[
                styles.customerComboInputOuter,
                customerInputFocused && styles.customerComboInputOuterFocused,
              ]}
              onPress={focusCustomerInput}
            >
              <TextInput
                ref={customerInputRef}
                style={styles.customerComboInput}
                value={customerKeyword}
                onChangeText={handleCustomerInputChange}
                onFocus={handleCustomerFocus}
                onBlur={handleCustomerBlur}
                placeholder="请输入客户名称搜索"
                placeholderTextColor="#aab4c7"
                autoCapitalize="none"
                autoCorrect={false}
              />
              <Ionicons name="search-outline" size={18} color="#64748b" />
            </Pressable>

            {customerDropdownVisible ? (
              <View
                style={styles.customerComboDropdown}
                onTouchStart={cancelCustomerBlur}
              >
                {customerSearching ? (
                  <View style={styles.customerComboDropdownLoading}>
                    <ActivityIndicator />
                  </View>
                ) : customerOptions.length > 0 ? (
                  <ScrollView
                    style={styles.customerComboDropdownScroll}
                    keyboardShouldPersistTaps="always"
                    nestedScrollEnabled={Platform.OS === 'android'}
                  >
                    {customerOptions.map((row, index) => {
                      const name = getCustomerDisplayName(row) || getCustomerCommittedLabel(row) || `客户 ${index + 1}`;
                      const sub = String(
                        row['联系电话'] ??
                          row['客户电话'] ??
                          row['客户地址'] ??
                          row['地址'] ??
                          row.phone ??
                          row.mobile ??
                          row.address ??
                          '',
                      ).trim();
                      return (
                        <Pressable
                          key={`${getCustomerId(row) || name}-${index}`}
                          style={({ pressed }) => [
                            styles.customerComboRow,
                            pressed && styles.customerComboRowPressed,
                          ]}
                          onPressIn={cancelCustomerBlur}
                          onPress={() => {
                            cancelCustomerBlur();
                            fillCustomerFromRow(row);
                            customerInputRef.current?.blur();
                          }}
                        >
                          <Text style={styles.customerComboName}>{name}</Text>
                          {sub ? <Text style={styles.customerComboSub}>{sub}</Text> : null}
                        </Pressable>
                      );
                    })}
                  </ScrollView>
                ) : (
                  <Text style={styles.customerComboHint}>
                    {customerKeyword.trim() ? '暂无匹配客户' : '请输入关键字搜索客户'}
                  </Text>
                )}
              </View>
            ) : null}
          </View>

          <View style={styles.contactRow}>
            <View style={[styles.contactField, styles.contactPhoneField]}>
              <Text style={[styles.fieldLabel, styles.contactFieldLabel]}>联系电话</Text>
              <TextInput
                style={[styles.input, styles.contactInput]}
                value={contactPhone}
                onChangeText={setContactPhone}
                onFocus={closeCustomerDropdown}
                placeholder="联系电话"
                placeholderTextColor="#aab4c7"
                keyboardType="phone-pad"
              />
            </View>

            <View style={[styles.contactField, styles.contactPersonField]}>
              <Text style={[styles.fieldLabel, styles.contactFieldLabel]}>联系人</Text>
              <TextInput
                style={[styles.input, styles.contactInput]}
                value={contactPerson}
                onChangeText={setContactPerson}
                onFocus={closeCustomerDropdown}
                placeholder="联系人"
                placeholderTextColor="#aab4c7"
              />
            </View>
          </View>

          {editingQuoteNo ? (
            <Text style={styles.editingQuoteHint}>正在编辑报价单：{editingQuoteNo}</Text>
          ) : null}
        </View>

        <View style={styles.card}>
          <View style={styles.sectionTitleRow}>
            <Text style={[styles.sectionTitle, styles.sectionTitleInRow]}>产品明细</Text>
            <Pressable
              style={({ pressed }) => [styles.addProductHeaderBtn, pressed && styles.addProductHeaderBtnPressed]}
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
            <Text style={styles.emptyHint}>暂无明细，请先添加产品；规格会自动计算重量，输入数量后自动计算金额。</Text>
          ) : (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator
              nestedScrollEnabled
              keyboardShouldPersistTaps="always"
              keyboardDismissMode="none"
            >
              <View style={{ minWidth: tableMinWidth }}>
                <View style={styles.tableHead}>
                  <Text style={[styles.th, { width: tableCols.idx }]}>序号</Text>
                  <Text style={[styles.th, { width: tableCols.name }]}>品名</Text>
                  <Text style={[styles.th, { width: tableCols.material }]}>材质</Text>
                  <Text style={[styles.th, { width: tableCols.spec }]}>规格</Text>
                  <Text style={[styles.th, { width: tableCols.unit }]}>单位</Text>
                  <Text style={[styles.th, { width: tableCols.qty }]}>数量</Text>
                  <Text style={[styles.th, { width: tableCols.w1 }]}>槽重</Text>
                  <Text style={[styles.th, { width: tableCols.p1 }]}>槽价</Text>
                  <Text style={[styles.th, { width: tableCols.w2 }]}>盖重</Text>
                  <Text style={[styles.th, { width: tableCols.p2 }]}>盖价</Text>
                  <Text style={[styles.th, { width: tableCols.w3 }]}>隔板重</Text>
                  <Text style={[styles.th, { width: tableCols.p3 }]}>隔板价</Text>
                  <Text style={[styles.th, { width: tableCols.theory }]}>理论重量</Text>
                  <Text style={[styles.th, { width: tableCols.total }]}>总重量</Text>
                  <Text style={[styles.th, { width: tableCols.unitPrice }]}>单价</Text>
                  <Text style={[styles.th, { width: tableCols.amount }]}>金额</Text>
                  <Text style={[styles.th, { width: tableCols.remark }]}>备注</Text>
                  <Text style={[styles.th, { width: tableCols.del }]} />
                </View>

                {normalizedLines.map((line, index) => (
                  <View key={line.key} style={[styles.tableRow, index % 2 === 1 && styles.tableRowAlt]}>
                    <Text style={[styles.td, styles.tdCenter, styles.tdNoWrap, { width: tableCols.idx }]} numberOfLines={1}>{index + 1}</Text>
                    <Text style={[styles.td, styles.tdCenter, styles.tdNoWrap, { width: tableCols.name }]} numberOfLines={1}>{line.品名}</Text>
                    <Text style={[styles.td, styles.tdCenter, styles.tdNoWrap, { width: tableCols.material }]} numberOfLines={1}>{line.材质 || '—'}</Text>
                    <Text style={[styles.td, styles.tdCenter, styles.tdNoWrap, { width: tableCols.spec }]} numberOfLines={1}>{line.规格 || '—'}</Text>
                    <Text style={[styles.td, styles.tdCenter, styles.tdNoWrap, { width: tableCols.unit }]} numberOfLines={1}>{line.单位}</Text>
                    <View style={[styles.tdInputCell, { width: tableCols.qty }]}>
                      <TextInput
                        style={styles.tdInput}
                        value={line.数量}
                        onChangeText={(text) => updateLine(line.key, { 数量: text })}
                        underlineColorAndroid="transparent"
                        keyboardType="decimal-pad"
                        placeholder=""
                        placeholderTextColor="#8b95aa"
                        selectionColor="#204dff"
                      />
                    </View>
                    <Text style={[styles.td, styles.tdCenter, styles.tdNoWrap, { width: tableCols.w1 }]} numberOfLines={1}>{line.槽重 || '—'}</Text>
                    <Text style={[styles.td, styles.tdCenter, styles.tdNoWrap, { width: tableCols.p1 }]} numberOfLines={1}>{line.槽价 || '—'}</Text>
                    <Text style={[styles.td, styles.tdCenter, styles.tdNoWrap, { width: tableCols.w2 }]} numberOfLines={1}>{line.盖重 || '—'}</Text>
                    <Text style={[styles.td, styles.tdCenter, styles.tdNoWrap, { width: tableCols.p2 }]} numberOfLines={1}>{line.盖价 || '—'}</Text>
                    <Text style={[styles.td, styles.tdCenter, styles.tdNoWrap, { width: tableCols.w3 }]} numberOfLines={1}>{line.隔板重 || '—'}</Text>
                    <Text style={[styles.td, styles.tdCenter, styles.tdNoWrap, { width: tableCols.p3 }]} numberOfLines={1}>{line.隔板价 || '—'}</Text>
                    <Text style={[styles.td, styles.tdCenter, styles.tdNoWrap, { width: tableCols.theory }]} numberOfLines={1}>{line.理论重量 || '—'}</Text>
                    <Text style={[styles.td, styles.tdCenter, styles.tdNoWrap, { width: tableCols.total }]} numberOfLines={1}>{line.总重量 || '—'}</Text>
                    <View style={[styles.tdInputCell, { width: tableCols.unitPrice }]}>
                      <TextInput
                        style={styles.tdInput}
                        value={line.单价}
                        onChangeText={(text) => updateLine(line.key, { 单价: text })}
                        underlineColorAndroid="transparent"
                        keyboardType="decimal-pad"
                        placeholder=""
                        placeholderTextColor="#8b95aa"
                        selectionColor="#204dff"
                      />
                    </View>
                    <Text style={[styles.td, styles.tdCenter, styles.tdNoWrap, styles.tdAmountText, { width: tableCols.amount }]} numberOfLines={1}>{line.金额 || '—'}</Text>
                    <View style={[styles.tdInputCell, { width: tableCols.remark }]}>
                      <TextInput
                        style={styles.tdInput}
                        value={line.备注}
                        onChangeText={(text) => updateLine(line.key, { 备注: text })}
                        underlineColorAndroid="transparent"
                        placeholder="备注"
                        placeholderTextColor="#8b95aa"
                      />
                    </View>
                    <Pressable style={[styles.delCell, { width: tableCols.del }]} onPress={() => removeLine(line.key)}>
                      <Text style={styles.delText}>删</Text>
                    </Pressable>
                  </View>
                ))}
              </View>
            </ScrollView>
          )}

          <View style={styles.totalRow}>
            <Text style={styles.totalText}>合计数量：{totals.qtySum.toFixed(2)}</Text>
            <Text style={styles.totalText}>合计金额：{totals.amountSum.toFixed(2)}</Text>
          </View>
          <Text style={styles.totalHint}>规格自动算重量，称重单价自动换算槽价/盖价/隔板价，金额按数量联动。</Text>

          {canOpenSaveOptions ? (
            <Pressable
              style={[styles.mainSaveBtn, pageBusy && styles.btnDisabled]}
              onPress={() => void openSaveOptions()}
              disabled={pageBusy}
            >
              <Text style={styles.mainSaveBtnText}>保存</Text>
            </Pressable>
          ) : null}
        </View>
      </ScrollView>

      <QuotePrintPreviewModal
        visible={previewVisible}
        template={previewTemplate}
        previewData={previewData}
        onClose={handleClosePreview}
      />

      <AddCustomerModal
        visible={addCustomerModalVisible}
        onRequestClose={() => setAddCustomerModalVisible(false)}
        onSaved={({ row }) => {
          if (row) {
            fillCustomerFromRow(row);
          }
          Alert.alert('成功', row ? '客户已添加，并已填入当前报价' : '客户已添加，请继续选择客户');
        }}
      />

      <Modal
        visible={saveOptionsVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setSaveOptionsVisible(false)}
      >
        <View style={styles.saveOptionsBackdrop}>
          <Pressable style={styles.saveOptionsBackdropPressable} onPress={() => setSaveOptionsVisible(false)} />
          <View style={styles.saveOptionsSheet}>
            <View style={styles.saveOptionsHeader}>
              <Text style={styles.saveOptionsTitle}>保存报价</Text>
              <Pressable onPress={() => setSaveOptionsVisible(false)} hitSlop={10}>
                <Ionicons name="close" size={28} color="#64748b" />
              </Pressable>
            </View>

            <View style={styles.saveOptionsBlock}>
              <Text style={styles.saveOptionsLabel}>公司抬头</Text>
              <View style={styles.saveSelectWrap}>
                <Pressable
                  style={[
                    styles.saveSelectTrigger,
                    saveCompanyOpen && styles.saveSelectTriggerFocused,
                  ]}
                  onPress={() => setSaveCompanyOpen((prev) => !prev)}
                >
                  <Text style={styles.saveSelectTriggerText}>{saveCompanyName || '请选择公司抬头'}</Text>
                  <Ionicons name={saveCompanyOpen ? 'chevron-up' : 'chevron-down'} size={20} color="#64748b" />
                </Pressable>

                {saveCompanyOpen ? (
                  <View style={styles.saveSelectDropdown}>
                    {DEFAULT_COMPANY_OPTIONS.map((item) => {
                      const active = item === saveCompanyName;
                      return (
                        <Pressable
                          key={item}
                          style={[styles.saveSelectOption, active && styles.saveSelectOptionActive]}
                          onPress={() => {
                            setSaveCompanyName(item);
                            setSaveCompanyOpen(false);
                          }}
                        >
                          <Text style={[styles.saveSelectOptionText, active && styles.saveSelectOptionTextActive]}>{item}</Text>
                        </Pressable>
                      );
                    })}
                  </View>
                ) : null}
              </View>
            </View>

            <View style={styles.saveOptionsBlock}>
              <Text style={styles.saveOptionsLabel}>打印模板</Text>
              {saveTemplatesLoading ? (
                <View style={styles.saveTemplateEmpty}>
                  <ActivityIndicator />
                </View>
              ) : saveTemplates.length > 0 ? (
                <View style={styles.saveTemplateList}>
                  {saveTemplates.map((item) => {
                    const active = item.name === selectedTemplateName;
                    return (
                      <Pressable
                        key={item.name}
                        style={[styles.saveTemplateRow, active && styles.saveTemplateRowActive]}
                        onPress={() => setSelectedTemplateName(item.name)}
                      >
                        <Text style={[styles.saveTemplateText, active && styles.saveTemplateTextActive]}>{item.name}</Text>
                        {active ? <Ionicons name="checkmark-circle" size={24} color="#204dff" /> : null}
                      </Pressable>
                    );
                  })}
                </View>
              ) : (
                <View style={styles.saveTemplateEmpty}>
                  <Text style={styles.saveTemplateEmptyText}>暂无可用模板</Text>
                </View>
              )}
            </View>

            <Text style={styles.saveActionHint}>先选择公司抬头和打印模板，再执行对应操作。</Text>

            <View style={styles.saveActionRow}>
              <Pressable
                style={[styles.saveActionBtn, styles.saveActionBtnGhost, pageBusy && styles.btnDisabled]}
                onPress={() => void handlePreview()}
                disabled={pageBusy}
              >
                {busyAction === 'preview' ? <ActivityIndicator /> : <Text style={styles.saveActionBtnGhostText}>预览</Text>}
              </Pressable>
              <Pressable
                style={[styles.saveActionBtn, styles.saveActionBtnGhost, pageBusy && styles.btnDisabled]}
                onPress={() => void handleExport()}
                disabled={pageBusy}
              >
                {busyAction === 'export' ? <ActivityIndicator /> : <Text style={styles.saveActionBtnGhostText}>导出</Text>}
              </Pressable>
              <Pressable
                style={[styles.saveActionBtn, styles.saveActionBtnGhost, pageBusy && styles.btnDisabled]}
                onPress={() => void handlePrint()}
                disabled={pageBusy}
              >
                {busyAction === 'print' ? <ActivityIndicator /> : <Text style={styles.saveActionBtnGhostText}>打印</Text>}
              </Pressable>
            </View>

            <View style={styles.saveActionRow}>
              <Pressable
                style={[styles.saveActionBtn, styles.saveActionBtnModalCancel]}
                onPress={() => setSaveOptionsVisible(false)}
                disabled={pageBusy}
              >
                <Text style={styles.saveActionBtnModalCancelText}>取消</Text>
              </Pressable>
              <Pressable
                style={[styles.saveActionBtn, styles.saveActionBtnPrimary, pageBusy && styles.btnDisabled]}
                onPress={() => void handleSaveQuote()}
                disabled={pageBusy}
              >
                {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveActionBtnPrimaryText}>保存</Text>}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

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
                const amountRaw = item['应收金额'];
                const amount = amountRaw != null && amountRaw !== '' ? `¥${Number(amountRaw).toFixed(2)}` : '—';
                const timeText = item['报价时间'] != null && item['报价时间'] !== '' ? formatDateTime(item['报价时间']) : '—';

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
                          <Text style={styles.unshippedAmtText}>{amount}</Text>
                          <Text style={styles.unshippedTimeText}>{timeText}</Text>
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
                          expandedDetailLines.map((row, rowIndex) => (
                            <View key={`detail-${orderNo}-${rowIndex}`} style={styles.detailLineRow}>
                              <Text style={styles.detailLineMain} numberOfLines={2}>
                                {[
                                  String(row['品名'] ?? ''),
                                  String(row['材质'] ?? row.material ?? ''),
                                  String(row['规格'] ?? ''),
                                ].filter((part) => part.trim() !== '').join(' · ')}
                              </Text>
                              <Text style={styles.detailLineSub}>
                                数量 {formatQuoteCellNum(row['数量'], 2)} · 单价 {formatQuoteCellNum(row['单价'], 2)} · 金额 {formatQuoteCellNum(row['金额'], 2)}
                              </Text>
                              <Text style={styles.detailLineSub}>
                                理论重量 {formatQuoteCellNum(row['理论重量'], 4)} · 总重量 {formatQuoteCellNum(row['总重量'], 4)}
                              </Text>
                              {row['备注'] != null && String(row['备注']).trim() ? (
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
                <Pressable style={styles.customerPickBtn} onPress={() => setFormulaPickerVisible((prev) => !prev)}>
                  <Text style={addProductName ? styles.customerPickText : styles.customerPickPlaceholder}>
                    {addProductName ? addProductName : formulasLoading ? '加载产品列表…' : '请选择产品'}
                  </Text>
                  <Ionicons
                    name={formulaPickerVisible ? 'chevron-up-outline' : 'chevron-down-outline'}
                    size={18}
                    color="#64748b"
                  />
                </Pressable>
                {formulaPickerVisible ? (
                  <View style={styles.inlineFormulaPanel}>
                    {formulasLoading ? (
                      <View style={styles.inlineFormulaLoading}>
                        <ActivityIndicator />
                        <Text style={styles.inlineFormulaLoadingText}>加载产品列表…</Text>
                      </View>
                    ) : formulas.length === 0 ? (
                      <Text style={styles.empty}>暂无产品公式，请先在「产品」中维护</Text>
                    ) : (
                      <ScrollView
                        style={styles.inlineFormulaList}
                        nestedScrollEnabled={Platform.OS === 'android'}
                        keyboardShouldPersistTaps="always"
                      >
                        {formulas.map((item, index) => (
                          <Pressable
                            key={`${item.name}-${item.unit}-${item.parameters}-${index}`}
                            style={styles.formulaRow}
                            onPress={() => {
                              setAddProductName(item.name);
                              setFormulaPickerVisible(false);
                            }}
                          >
                            <Text style={styles.formulaName}>{item.name}</Text>
                            <Text style={styles.formulaSub}>
                              {item.unit} · {item.parameters || '—'}
                            </Text>
                          </Pressable>
                        ))}
                      </ScrollView>
                    )}
                  </View>
                ) : null}

                <Text style={styles.fieldLabel}>
                  <Text style={styles.required}>* </Text>过磅价（称重单价）
                </Text>
                <TextInput
                  style={styles.input}
                  value={addScalePrice}
                  onChangeText={setAddScalePrice}
                  placeholder="如 6.50 / 6.40 / 6.30"
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
                  placeholder="规格，如 1*2*3*3"
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
    </PageScaffold>
  );
}

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
  contactRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    marginTop: 6,
  },
  contactField: {
    flex: 1,
    minWidth: 0,
  },
  contactPhoneField: {
    maxWidth: undefined,
  },
  contactPersonField: {
    flex: 1,
    maxWidth: undefined,
  },
  contactFieldLabel: {
    marginTop: 0,
    marginBottom: 6,
  },
  contactInput: {
    marginBottom: 0,
    paddingVertical: 4,
    minHeight: 36,
    fontSize: 13,
    lineHeight: 18,
  },
  customerNameRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 12,
    marginTop: 4,
    marginBottom: 8,
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
    ...Platform.select({
      web: {
        outlineWidth: 0,
      },
      default: {},
    }),
  },
  customerComboWrap: {
    position: 'relative',
    zIndex: 10,
    marginBottom: 6,
  },
  customerComboInputOuter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: '#dbe1ec',
    borderRadius: 8,
    backgroundColor: '#fafbfd',
    paddingHorizontal: 10,
    height: 36,
  },
  customerComboInputOuterFocused: {
    borderColor: '#204dff',
    shadowColor: '#204dff',
    shadowOpacity: 0.08,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
  },
  customerComboInput: {
    flex: 1,
    height: 36,
    paddingVertical: 0,
    fontSize: 13,
    lineHeight: 18,
    color: '#102248',
    ...Platform.select({
      web: {
        outlineWidth: 0,
      },
      default: {},
    }),
  },
  customerComboDropdown: {
    position: 'absolute',
    top: 42,
    left: 0,
    right: 0,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#dbe1ec',
    backgroundColor: '#fff',
    overflow: 'hidden',
    zIndex: 20,
    shadowColor: '#0f172a',
    shadowOpacity: 0.08,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
  },
  customerComboDropdownLoading: {
    paddingVertical: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  customerComboDropdownScroll: {
    maxHeight: 240,
  },
  customerComboRow: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#eef2f7',
    gap: 3,
  },
  customerComboRowPressed: {
    backgroundColor: '#f8fbff',
  },
  customerComboName: {
    fontSize: 14,
    fontWeight: '700',
    color: '#102248',
  },
  customerComboSub: {
    fontSize: 12,
    color: '#64748b',
  },
  customerComboHint: {
    paddingHorizontal: 12,
    paddingVertical: 14,
    fontSize: 13,
    color: '#64748b',
  },
  hiddenCustomerIdInput: {
    position: 'absolute',
    width: 1,
    height: 1,
    opacity: 0,
  },
  editingQuoteHint: {
    marginTop: 8,
    fontSize: 13,
    fontWeight: '600',
    color: '#b45309',
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
    textAlign: 'center',
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
  tdNoWrap: Platform.select({
    web: {
      whiteSpace: 'nowrap',
    } as unknown as TextStyle,
    default: {} as TextStyle,
  }) as TextStyle,
  tdAmountText: {
    color: '#e53935',
    fontWeight: '700',
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
    backgroundColor: '#f8fbff',
    minHeight: 36,
    textAlign: 'center',
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
    gap: 12,
  },
  totalText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#102248',
  },
  totalHint: {
    fontSize: 12,
    color: '#64748b',
    marginBottom: 10,
  },
  mainSaveBtn: {
    marginTop: 10,
    minHeight: 48,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#204dff',
  },
  mainSaveBtnText: {
    fontSize: 18,
    fontWeight: '700',
    color: '#fff',
  },
  saveOptionsBackdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(15, 23, 42, 0.3)',
  },
  saveOptionsBackdropPressable: {
    flex: 1,
  },
  saveOptionsSheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 18,
    paddingTop: 18,
    paddingBottom: 24,
    gap: 14,
  },
  saveOptionsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  saveOptionsTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: '#102248',
  },
  saveOptionsBlock: {
    gap: 10,
    overflow: 'visible',
  },
  saveOptionsLabel: {
    fontSize: 16,
    fontWeight: '700',
    color: '#334155',
  },
  saveSelectWrap: {
    position: 'relative',
    zIndex: 5,
  },
  saveSelectTrigger: {
    minHeight: 52,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#dbe1ec',
    backgroundColor: '#f8fbff',
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  saveSelectTriggerFocused: {
    borderColor: '#204dff',
  },
  saveSelectTriggerText: {
    flex: 1,
    fontSize: 17,
    fontWeight: '700',
    color: '#102248',
  },
  saveSelectDropdown: {
    position: 'absolute',
    top: 60,
    left: 0,
    right: 0,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#dbe1ec',
    backgroundColor: '#fff',
    overflow: 'hidden',
    zIndex: 30,
    shadowColor: '#0f172a',
    shadowOpacity: 0.08,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
  },
  saveSelectOption: {
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  saveSelectOptionActive: {
    backgroundColor: '#eef4ff',
  },
  saveSelectOptionText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#334155',
  },
  saveSelectOptionTextActive: {
    color: '#204dff',
  },
  saveTemplateList: {
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: '#f8fbff',
    borderWidth: 1,
    borderColor: '#dbe1ec',
  },
  saveTemplateRow: {
    minHeight: 58,
    paddingHorizontal: 16,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  saveTemplateRowActive: {
    backgroundColor: '#e9efff',
  },
  saveTemplateText: {
    flex: 1,
    fontSize: 16,
    fontWeight: '700',
    color: '#334155',
  },
  saveTemplateTextActive: {
    color: '#204dff',
  },
  saveTemplateEmpty: {
    minHeight: 72,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#dbe1ec',
    backgroundColor: '#f8fbff',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  saveTemplateEmptyText: {
    fontSize: 14,
    color: '#64748b',
  },
  saveActionHint: {
    fontSize: 14,
    lineHeight: 20,
    color: '#64748b',
  },
  saveActionRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 10,
  },
  saveActionBtn: {
    flex: 1,
    minHeight: 44,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  saveActionBtnGhost: {
    backgroundColor: '#fff',
    borderColor: '#dbe1ec',
  },
  saveActionBtnGhostText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#204dff',
  },
  saveActionBtnCancel: {
    backgroundColor: '#fff7ed',
    borderColor: '#fdba74',
  },
  saveActionBtnCancelText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#c2410c',
  },
  saveActionBtnModalCancel: {
    backgroundColor: '#fff',
    borderColor: '#dbe1ec',
  },
  saveActionBtnModalCancelText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#475569',
  },
  saveActionBtnPrimary: {
    backgroundColor: '#204dff',
    borderColor: '#204dff',
  },
  saveActionBtnPrimaryText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#fff',
  },
  btnDisabled: {
    opacity: 0.58,
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
  unshippedCardRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  unshippedIdx: {
    fontSize: 13,
    fontWeight: '700',
    color: '#64748b',
    minWidth: 22,
    paddingTop: 2,
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
  customerPickBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
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
  inlineFormulaPanel: {
    marginTop: -2,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#dbe1ec',
    borderRadius: 10,
    backgroundColor: '#fff',
    overflow: 'hidden',
  },
  inlineFormulaLoading: {
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  inlineFormulaLoadingText: {
    fontSize: 13,
    color: '#64748b',
  },
  inlineFormulaList: {
    maxHeight: 260,
  },
  formulaRow: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#eef2f7',
    gap: 3,
  },
  formulaName: {
    fontSize: 14,
    fontWeight: '700',
    color: '#102248',
  },
  formulaSub: {
    fontSize: 12,
    color: '#64748b',
  },
  empty: {
    textAlign: 'center',
    color: '#8892a6',
    paddingVertical: 20,
  },
  addProductModalOuter: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  addProductModalBackdropFlex: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(15, 23, 42, 0.35)',
  },
  addProductModalKb: {
    width: '100%',
  },
  addProductModalSheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    paddingHorizontal: 16,
    paddingTop: 14,
  },
  addProductModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  addProductModalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#102248',
  },
  addProductModalClose: {
    fontSize: 15,
    fontWeight: '600',
    color: '#204dff',
  },
  addProductModalScrollContent: {
    paddingBottom: 8,
  },
  addProductModalActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 10,
  },
  addProductModalBtn: {
    flex: 1,
    minHeight: 42,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  addProductModalBtnGhost: {
    backgroundColor: '#fff',
    borderColor: '#dbe1ec',
  },
  addProductModalBtnGhostText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#475569',
  },
  addProductModalBtnPrimary: {
    backgroundColor: '#eff6ff',
    borderColor: '#bfdbfe',
  },
  addProductModalBtnPrimaryText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1d4ed8',
  },
  addProductModalBtnConfirm: {
    backgroundColor: '#204dff',
    borderColor: '#204dff',
  },
  addProductModalBtnConfirmText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#fff',
  },
});

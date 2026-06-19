import type { PaperOrientation, PaperSizeKey, TemplateComponent, TemplateDoc, TemplateInput, TemplateTable } from '../types/printTemplate';

/** 与桌面预览一致的 mm→px（96dpi 近似） */
export const MM_TO_PX = 3.779527559;

export const PAPER_MM: Record<
  PaperSizeKey,
  {
    widthMm: number;
    heightMm: number;
    label: string;
  }
> = {
  half: { widthMm: 216, heightMm: 140, label: '二等分' },
  a5: { widthMm: 210, heightMm: 148, label: 'A5' },
  a4: { widthMm: 210, heightMm: 297, label: 'A4' },
  a3: { widthMm: 297, heightMm: 420, label: 'A3' },
};

export function normalizePaperKey(key: string | undefined): PaperSizeKey {
  if (key === 'half' || key === 'a5' || key === 'a4' || key === 'a3') return key;
  return 'a4';
}

export function paperDimensionsPx(paperSize: PaperSizeKey, orientation: PaperOrientation) {
  const spec = PAPER_MM[paperSize];
  let w = MM_TO_PX * spec.widthMm;
  let h = MM_TO_PX * spec.heightMm;
  if (orientation === 'landscape') {
    const t = w;
    w = h;
    h = t;
  }
  return { widthPx: w, heightPx: h, label: spec.label };
}

/** lodash.get 风格：支持 a.b、items[0].name */
export function getByPath(obj: unknown, path: string | undefined): unknown {
  if (!path || obj == null) return '';
  const normalized = path.replace(/\[(\d+)\]/g, '.$1');
  const parts = normalized.split('.').filter(Boolean);
  let cur: unknown = obj;
  for (const p of parts) {
    if (cur == null || typeof cur !== 'object') return '';
    cur = (cur as Record<string, unknown>)[p];
  }
  return cur ?? '';
}

export function bindToDisplay(value: unknown): string {
  if (value == null) return '';
  if (typeof value === 'object') return '';
  return String(value);
}

/**
 * 与桌面打印模板 chunk 346 一致：EXE 下拉「数据绑定」展示中文 label，JSON 里 bindTo 存 canonical（每组第一项）。
 * 打印时会按别名数组解析字段（见桌面 s/c/d 辅助函数）。
 */
export type PrintTemplateBindOption = {
  label: string;
  bindTo: string;
  aliases: string[];
};

export const PRINT_TEMPLATE_BIND_BASE: PrintTemplateBindOption[] = [
  { label: '公司名称', bindTo: 'companyName', aliases: ['公司名称', 'company_name'] },
  { label: '公司地址', bindTo: 'companyAddress', aliases: ['公司地址', 'company_address'] },
  { label: '客户名称', bindTo: 'customerName', aliases: ['客户名称', 'customer_name'] },
  { label: '客户地址', bindTo: 'customerAddress', aliases: ['客户地址', 'customer_address'] },
  { label: '客户电话', bindTo: 'customerPhone', aliases: ['联系电话', 'phone', 'customer_phone'] },
  { label: '订单号', bindTo: 'orderNumber', aliases: ['单号', 'order_number'] },
  { label: '订单日期', bindTo: 'orderDate', aliases: ['日期', 'order_date'] },
  { label: '总重量', bindTo: 'totalWeight', aliases: ['总重', 'total_weight'] },
  { label: '总金额', bindTo: 'totalAmount', aliases: ['总价', 'total_amount'] },
  { label: '总数量', bindTo: 'totalQuantity', aliases: ['数量合计', 'total_quantity'] },
  { label: '大写金额', bindTo: 'totalAmountInWords', aliases: ['金额大写', 'amount_in_words'] },
];

/** 明细列：canonical 与桌面 d() 一致（每组中取首个英文字段名）；路径示例为首行 items[0].xxx */
export const PRINT_TEMPLATE_BIND_ITEM_ROW: PrintTemplateBindOption[] = [
  { label: '序号（第1行）', bindTo: 'items[0].index', aliases: ['items[0].序号', 'items[0].id'] },
  { label: '品名（第1行）', bindTo: 'items[0].name', aliases: ['items[0].品名', 'items[0].productName', 'items[0].product_name'] },
  { label: '规格（第1行）', bindTo: 'items[0].specification', aliases: ['items[0].规格', 'items[0].spec', 'items[0].product_spec'] },
  { label: '单位（第1行）', bindTo: 'items[0].unit', aliases: ['items[0].单位', 'items[0].unitName'] },
  { label: '数量（第1行）', bindTo: 'items[0].quantity', aliases: ['items[0].数量', 'items[0].amount'] },
  { label: '槽重（第1行）', bindTo: 'items[0].weight1', aliases: ['items[0].槽重', 'items[0].重量1'] },
  { label: '槽价（第1行）', bindTo: 'items[0].price1', aliases: ['items[0].槽价', 'items[0].单价1'] },
  { label: '盖重（第1行）', bindTo: 'items[0].weight2', aliases: ['items[0].盖重', 'items[0].重量2'] },
  { label: '盖价（第1行）', bindTo: 'items[0].price2', aliases: ['items[0].盖价', 'items[0].单价2'] },
  { label: '隔板重（第1行）', bindTo: 'items[0].weight3', aliases: ['items[0].隔板重', 'items[0].重量3'] },
  { label: '隔板价（第1行）', bindTo: 'items[0].price3', aliases: ['items[0].隔板价', 'items[0].单价3'] },
  { label: '重量（第1行）', bindTo: 'items[0].weight', aliases: ['items[0].重量'] },
  { label: '单价（第1行）', bindTo: 'items[0].unitPrice', aliases: ['items[0].单价', 'items[0].price'] },
  {
    label: '金额（第1行）',
    bindTo: 'items[0].totalAmount',
    aliases: ['items[0].金额', 'items[0].amount', 'items[0].小计', 'items[0].totalPrice'],
  },
  { label: '备注（第1行）', bindTo: 'items[0].remark', aliases: ['items[0].备注', 'items[0].note', 'items[0].memo'] },
];

export function normalizeBindToCanonical(raw: string | undefined): string {
  const t = raw?.trim() ?? '';
  if (!t) return '';
  for (const row of PRINT_TEMPLATE_BIND_BASE) {
    if (t === row.bindTo || row.aliases.includes(t)) return row.bindTo;
  }
  for (const row of PRINT_TEMPLATE_BIND_ITEM_ROW) {
    if (t === row.bindTo || row.aliases.includes(t)) return row.bindTo;
  }
  return t;
}

/** 当前 bindTo 对应 EXE 下拉中的中文说明（未知路径则原样显示） */
export function bindToChineseLabel(bindTo: string | undefined): string {
  const t = bindTo?.trim() ?? '';
  if (!t) return '（未选择）';
  for (const row of PRINT_TEMPLATE_BIND_BASE) {
    if (t === row.bindTo || row.aliases.includes(t)) return row.label;
  }
  for (const row of PRINT_TEMPLATE_BIND_ITEM_ROW) {
    if (t === row.bindTo || row.aliases.includes(t)) return row.label;
  }
  return t;
}

/** 表格列「数据绑定」：相对每一行明细对象的字段名，与桌面 chunk 明细映射 o 一致（canonical 为英文字段）。 */
export type PrintTemplateTableColumnBindOption = {
  label: string;
  dataIndex: string;
  aliases: string[];
};

export const PRINT_TEMPLATE_TABLE_COLUMN_BIND: PrintTemplateTableColumnBindOption[] = [
  { label: '序号', dataIndex: 'index', aliases: ['序号', 'id'] },
  { label: '品名', dataIndex: 'name', aliases: ['品名', 'productName', 'product_name'] },
  { label: '规格', dataIndex: 'specification', aliases: ['规格', 'spec', 'product_spec'] },
  { label: '单位', dataIndex: 'unit', aliases: ['单位', 'unitName'] },
  { label: '数量', dataIndex: 'quantity', aliases: ['数量', 'amount'] },
  { label: '槽重', dataIndex: 'weight1', aliases: ['槽重', '重量1'] },
  { label: '槽价', dataIndex: 'price1', aliases: ['槽价', '单价1'] },
  { label: '盖重', dataIndex: 'weight2', aliases: ['盖重', '重量2'] },
  { label: '盖价', dataIndex: 'price2', aliases: ['盖价', '单价2'] },
  { label: '隔板重', dataIndex: 'weight3', aliases: ['隔板重', '重量3'] },
  { label: '隔板价', dataIndex: 'price3', aliases: ['隔板价', '单价3'] },
  { label: '重量', dataIndex: 'weight', aliases: ['重量'] },
  { label: '单价', dataIndex: 'unitPrice', aliases: ['单价', 'price'] },
  {
    label: '金额',
    dataIndex: 'totalAmount',
    aliases: ['金额', 'amount', '小计', 'totalPrice'],
  },
  { label: '备注', dataIndex: 'remark', aliases: ['备注', 'note', 'memo'] },
];

export function normalizeTableColumnDataIndex(raw: string | undefined): string {
  const t = raw?.trim() ?? '';
  if (!t) return '';
  for (const row of PRINT_TEMPLATE_TABLE_COLUMN_BIND) {
    if (t === row.dataIndex || row.aliases.includes(t)) return row.dataIndex;
  }
  return t;
}

export function tableColumnDataIndexLabel(dataIndex: string | undefined): string {
  const t = dataIndex?.trim() ?? '';
  if (!t) return '（未选择）';
  const canon = normalizeTableColumnDataIndex(t);
  for (const row of PRINT_TEMPLATE_TABLE_COLUMN_BIND) {
    if (canon === row.dataIndex) return row.label;
  }
  return t;
}

/** 取单元格显示文本：支持 canonical 与中文字段别名（与桌面行数据一致） */
export function resolveTableRowCellDisplay(row: Record<string, unknown>, dataIndex: string): string {
  const canon = normalizeTableColumnDataIndex(dataIndex);
  if (Object.prototype.hasOwnProperty.call(row, canon)) {
    const v = row[canon];
    if (v !== undefined && v !== null) return bindToDisplay(v);
  }
  const opt = PRINT_TEMPLATE_TABLE_COLUMN_BIND.find((o) => o.dataIndex === canon);
  if (opt) {
    for (const a of opt.aliases) {
      if (Object.prototype.hasOwnProperty.call(row, a)) {
        const v = row[a];
        if (v !== undefined && v !== null) return bindToDisplay(v);
      }
    }
  }
  if (dataIndex !== canon && Object.prototype.hasOwnProperty.call(row, dataIndex)) {
    return bindToDisplay(row[dataIndex]);
  }
  return '';
}

/** 桌面预览占位数据（chunk 346 中对象 K / J 的合并形状） */
export function defaultPreviewData(): Record<string, unknown> {
  return {
    companyName: '您的公司名称',
    companyAddress: '公司地址',
    customerName: '示例客户',
    customerPhone: '13800138000',
    customerAddress: '客户地址',
    orderNumber: 'QT20260001',
    orderDate: '2026-05-16',
    totalAmount: '12,580.00',
    totalWeight: '256.8',
    totalQuantity: '120',
    totalAmountInWords: '壹万贰仟伍佰捌拾元整',
    items: Array.from({ length: 12 }).map((_, i) => ({
      index: String(i + 1),
      name: `产品${i + 1}`,
      specification: `规格${i + 1}`,
      quantity: String((i + 1) * 2),
      unitPrice: (100 + i * 10).toFixed(2),
      totalPrice: ((100 + i * 10) * (i + 1) * 2).toFixed(2),
      totalAmount: ((100 + i * 10) * (i + 1) * 2).toFixed(2),
    })),
  };
}

export function newComponentId(): number {
  return Date.now() + Math.floor(Math.random() * 1000);
}

export function createDefaultInput(): TemplateComponent {
  return {
    id: newComponentId(),
    type: 'Input',
    x: 48,
    y: 48,
    width: 220,
    height: 36,
    fontSize: 14,
    textAlign: 'center',
    showBorder: true,
    placeholder: '请输入',
    bindTo: 'companyName',
  };
}

export function createDefaultTag(): TemplateComponent {
  return {
    id: newComponentId(),
    type: 'Tag',
    x: 48,
    y: 96,
    width: 100,
    height: 32,
    fontSize: 13,
    textAlign: 'center',
    showBorder: false,
    title: '新标签',
    color: 'default',
  };
}

export function createDefaultTable(): TemplateComponent {
  return {
    id: newComponentId(),
    type: 'Table',
    x: 48,
    y: 160,
    width: 500,
    height: 220,
    fontSize: 12,
    textAlign: 'center',
    showBorder: true,
    rows: 8,
    columns: [
      { title: '列1', dataIndex: 'name', key: 'col-name', textAlign: 'center' },
      { title: '列2', dataIndex: 'specification', key: 'col-spec', textAlign: 'center' },
    ],
    dataSource: [],
  };
}

export function createDefaultImage(): TemplateComponent {
  return {
    id: newComponentId(),
    type: 'Image',
    x: 400,
    y: 48,
    width: 160,
    height: 120,
    showBorder: false,
    src: '',
  };
}

/** 自桌面加载 JSON 时补齐必要字段 */
export function normalizeImportedTemplate(raw: unknown): TemplateDoc | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const name = typeof o.name === 'string' && o.name.trim() !== '' ? o.name.trim() : '未命名模板';
  const paperSize = normalizePaperKey(typeof o.paperSize === 'string' ? o.paperSize : 'a4');
  const orientation =
    o.orientation === 'landscape' || o.orientation === 'portrait' ? o.orientation : 'portrait';
  const comps = Array.isArray(o.components) ? (o.components as TemplateComponent[]) : [];
  return {
    name,
    paperSize,
    orientation,
    components: comps.map((c, idx) => {
      const base: TemplateComponent = { ...c, id: c.id ?? `${Date.now()}-${idx}` };
      if (c.type === 'Input') {
        const b = (c as TemplateInput).bindTo;
        if (typeof b === 'string' && b.trim() !== '') {
          const canon = normalizeBindToCanonical(b.trim()) || b.trim();
          return { ...(base as TemplateInput), bindTo: canon };
        }
      }
      if (c.type === 'Table') {
        const tbl = base as TemplateTable;
        const cols = (tbl.columns ?? []).map((col) => ({
          ...col,
          dataIndex: normalizeTableColumnDataIndex(col.dataIndex) || col.dataIndex,
          textAlign: 'center' as const,
        }));
        return { ...tbl, textAlign: 'center', columns: cols };
      }
      if (base.type === 'Input' || base.type === 'Tag') {
        return { ...base, textAlign: 'center' };
      }
      return base;
    }),
  };
}

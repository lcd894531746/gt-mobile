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

function firstPreviewText(preview: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const value = getByPath(preview, key);
    const text = bindToDisplay(value).trim();
    if (text !== '') return text;
  }
  return '';
}

export function formatCnDateText(value: unknown): string {
  if (value == null || value === '') return '';
  const date = value instanceof Date ? value : new Date(value as string | number);
  if (Number.isNaN(date.getTime())) return String(value);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}年${pad(date.getMonth() + 1)}月${pad(date.getDate())}日`;
}

export function formatMoneyText(value: unknown, digits = 2): string {
  if (value == null || value === '') return '';
  const normalized = String(value).replace(/,/g, '').trim();
  const num = Number(normalized);
  if (!Number.isFinite(num)) return String(value);
  return num.toFixed(digits);
}

export function getPreviewValue(preview: Record<string, unknown>, bindTo: string | undefined): unknown {
  const bind = bindTo?.trim();
  if (!bind) return '';
  const exact = getByPath(preview, bind);
  if (exact !== '') return exact;

  const aliases: Record<string, string[]> = {
    totalAmount: ['应收金额', '金额', '总金额', '小写', '合计金额', 'total_amount'],
    totalAmountInWords: ['金额大写', '大写', '合计（大写）', '合计(大写)', 'amount_in_words'],
    orderDate: ['日期', '报价日期', 'order_date'],
  };

  for (const [canonical, names] of Object.entries(aliases)) {
    if (bind === canonical || names.includes(bind)) {
      return getByPath(preview, canonical) || names.map((name) => getByPath(preview, name)).find((value) => value !== '') || '';
    }
  }

  return '';
}

export function resolveTemplateInputText(comp: Pick<TemplateInput, 'id' | 'bindTo' | 'placeholder'>, preview: Record<string, unknown>): string {
  const bind = comp.bindTo?.trim();
  if (bind) {
    return bindToDisplay(getPreviewValue(preview, bind));
  }

  const id = String(comp.id ?? '').trim();
  switch (id) {
    case 'company-title':
      return firstPreviewText(preview, ['companyName', '公司名称']);
    case 'quote-title':
      return '产品报价单';
    case 'info-l-1':
      return `客户单位： ${firstPreviewText(preview, ['customerName', '客户名称'])}`;
    case 'info-l-2':
      return `客户电话： ${firstPreviewText(preview, ['customerPhone', '联系电话', 'phone'])}`;
    case 'info-l-3':
      return `联 系 人： ${firstPreviewText(preview, ['contactPerson', '联系人'])}`;
    case 'info-l-4':
      return `客户地址： ${firstPreviewText(preview, ['customerAddress', '客户地址'])}`;
    case 'info-r-1':
      return `业务经办人： ${firstPreviewText(preview, ['businessPerson', '业务经办人'])}`;
    case 'info-r-2': {
      const phone = firstPreviewText(preview, ['companyPhone', 'companyTel', 'companyTelephone']);
      const fax = firstPreviewText(preview, ['companyFax', 'fax']);
      return `电话： ${phone}${fax ? `  传真： ${fax}` : '  传真：'}`;
    }
    case 'info-r-3':
      return `地址： ${firstPreviewText(preview, ['companyAddress', '公司地址'])}`;
    case 'info-r-4':
      return '币种： 人民币（RMB）';
    case 'sum-label':
      return '合计（大写）：';
    case 'sum-words':
      return firstPreviewText(preview, ['totalAmountInWords', '金额大写', '大写']);
    case 'sum-number':
      return `小写： ¥${formatMoneyText(firstPreviewText(preview, ['totalAmount', '应收金额', '金额', '总金额']) || '0')}`;
    case 'secret':
      return '产品报价，请注意保密。';
    case 'date':
      return `日期： ${formatCnDateText(firstPreviewText(preview, ['orderDate', '日期']) || new Date())}`;
    default:
      return comp.placeholder ?? '';
  }
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
  { label: '材质', dataIndex: 'material', aliases: ['材质', 'material'] },
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
      material: `材质${i + 1}`,
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
      { title: '列2', dataIndex: 'material', key: 'col-material', textAlign: 'center' },
      { title: '列3', dataIndex: 'specification', key: 'col-spec', textAlign: 'center' },
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

function cloneTemplateComponent<T extends TemplateComponent>(comp: T): T {
  if (comp.type === 'Table') {
    return {
      ...comp,
      columns: comp.columns ? comp.columns.map((col) => ({ ...col })) : [],
      dataSource: Array.isArray(comp.dataSource) ? comp.dataSource.map((row) => ({ ...row })) : [],
    } as T;
  }
  return { ...comp };
}

function findComponentIndexById(components: TemplateComponent[], id: string) {
  return components.findIndex((comp) => String(comp.id) === id);
}

function setComponentFrame(
  comp: TemplateComponent | undefined,
  frame: Partial<Pick<TemplateComponent, 'x' | 'y' | 'width' | 'height' | 'fontSize' | 'fontWeight' | 'textAlign'>>,
) {
  if (!comp) return;
  if (frame.x != null) comp.x = frame.x;
  if (frame.y != null) comp.y = frame.y;
  if (frame.width != null) comp.width = frame.width;
  if (frame.height != null) comp.height = frame.height;
  if (frame.fontSize != null) comp.fontSize = frame.fontSize;
  if (frame.fontWeight != null) comp.fontWeight = frame.fontWeight;
  if (frame.textAlign != null) comp.textAlign = frame.textAlign;
}

function applySuzhongQuoteCanonicalLayout(components: TemplateComponent[]) {
  const byId = (id: string) => {
    const index = findComponentIndexById(components, id);
    return index >= 0 ? components[index] : undefined;
  };

  const logo = byId('logo');
  const companyTitle = byId('company-title');
  const quoteTitle = byId('quote-title');
  const table = byId('quote-items-table');

  if (!logo || !companyTitle || !quoteTitle || !table || table.type !== 'Table') {
    return;
  }

  setComponentFrame(logo, { x: 36, y: 8, width: 94, height: 72 });
  setComponentFrame(companyTitle, {
    x: 185,
    y: 24,
    width: 425,
    height: 34,
    fontSize: 28,
    fontWeight: '700',
    textAlign: 'center',
  });
  setComponentFrame(quoteTitle, {
    x: 255,
    y: 64,
    width: 280,
    height: 30,
    fontSize: 24,
    fontWeight: '700',
    textAlign: 'center',
  });

  const left = 10;
  const top = 126;
  const totalWidth = 760;
  const rowHeight = 32;
  const midX = 460;
  const leftWidth = midX - left;
  const rightWidth = totalWidth - leftWidth;

  const infoLeftIds = ['info-l-1', 'info-l-2', 'info-l-3', 'info-l-4'];
  const infoRightIds = ['info-r-1', 'info-r-2', 'info-r-3', 'info-r-4'];

  infoLeftIds.forEach((id, index) => {
    setComponentFrame(byId(id), {
      x: left,
      y: top + rowHeight * index,
      width: leftWidth,
      height: rowHeight,
      fontSize: 16,
      textAlign: 'left',
    });
  });

  infoRightIds.forEach((id, index) => {
    setComponentFrame(byId(id), {
      x: midX,
      y: top + rowHeight * index,
      width: rightWidth,
      height: rowHeight,
      fontSize: 16,
      textAlign: 'left',
    });
  });

  table.x = left;
  table.y = top + rowHeight * 4;
  table.width = totalWidth;
  table.fontSize = 16;
  table.rowHeight = 36;
  table.textAlign = 'center';

  const sumTop = table.y + table.height;
  setComponentFrame(byId('sum-label'), {
    x: left,
    y: sumTop,
    width: 150,
    height: 34,
    fontSize: 16,
    fontWeight: '700',
    textAlign: 'left',
  });
  setComponentFrame(byId('sum-words'), {
    x: left + 150,
    y: sumTop,
    width: 430,
    height: 34,
    fontSize: 16,
    fontWeight: '700',
    textAlign: 'left',
  });
  setComponentFrame(byId('sum-number'), {
    x: left + 580,
    y: sumTop,
    width: 190,
    height: 34,
    fontSize: 16,
    fontWeight: '700',
    textAlign: 'center',
  });
  setComponentFrame(byId('secret'), {
    x: left,
    y: sumTop + 42,
    width: 260,
    height: 28,
    fontSize: 16,
    fontWeight: '700',
    textAlign: 'left',
  });
  setComponentFrame(byId('date'), {
    x: 570,
    y: sumTop + 84,
    width: 190,
    height: 28,
    fontSize: 16,
    fontWeight: '700',
    textAlign: 'center',
  });
}

export function normalizeTemplateLayout(doc: TemplateDoc): TemplateDoc {
  const components = doc.components.map((comp) => cloneTemplateComponent(comp));
  applySuzhongQuoteCanonicalLayout(components);
  const tableIndex = findComponentIndexById(components, 'quote-items-table');
  const tableComp = tableIndex >= 0 && components[tableIndex]?.type === 'Table'
    ? (components[tableIndex] as TemplateTable)
    : null;

  if (tableComp) {
    const tableLeft = tableComp.x;
    const tableRight = tableComp.x + tableComp.width;

    const infoLeftIds = ['info-l-1', 'info-l-2', 'info-l-3', 'info-l-4'];
    const infoRightIds = ['info-r-1', 'info-r-2', 'info-r-3', 'info-r-4'];
    const infoLeftIndexes = infoLeftIds.map((id) => findComponentIndexById(components, id)).filter((idx) => idx >= 0);
    const infoRightIndexes = infoRightIds.map((id) => findComponentIndexById(components, id)).filter((idx) => idx >= 0);

    if (infoLeftIndexes.length > 0 && infoRightIndexes.length > 0) {
      const totalWidth = tableRight - tableLeft;
      const halfWidth = Math.round(totalWidth / 2);
      const leftWidth = halfWidth;
      const rightX = tableLeft + leftWidth;
      const rightWidth = tableRight - rightX;

      infoLeftIndexes.forEach((idx) => {
        const comp = components[idx];
        if (!comp) return;
        comp.x = tableLeft;
        comp.width = leftWidth;
      });
      infoRightIndexes.forEach((idx) => {
        const comp = components[idx];
        if (!comp) return;
        comp.x = rightX;
        comp.width = rightWidth;
      });
    }

    const sumLabelIndex = findComponentIndexById(components, 'sum-label');
    const sumWordsIndex = findComponentIndexById(components, 'sum-words');
    const sumNumberIndex = findComponentIndexById(components, 'sum-number');
    if (sumLabelIndex >= 0 && sumWordsIndex >= 0 && sumNumberIndex >= 0) {
      const sumLabel = components[sumLabelIndex];
      const sumWords = components[sumWordsIndex];
      const sumNumber = components[sumNumberIndex];
      const labelWidth = sumWords.x - sumLabel.x;
      const numberWidth = sumNumber.width;
      sumLabel.x = tableLeft;
      sumLabel.width = labelWidth;
      sumWords.x = sumLabel.x + labelWidth;
      sumNumber.x = tableRight - numberWidth;
      sumWords.width = sumNumber.x - sumWords.x;
      sumNumber.width = tableRight - sumNumber.x;
    }
  }

  return {
    ...doc,
    components,
  };
}

export type BorderSides = {
  top: number;
  right: number;
  bottom: number;
  left: number;
};

export type TemplateBorderTheme = {
  borderColor: string;
  borderWidth: number;
  gridColor: string;
};

const EMPHASIS_BORDER_IDS = new Set([
  'info-l-1',
  'info-l-2',
  'info-l-3',
  'info-l-4',
  'info-r-1',
  'info-r-2',
  'info-r-3',
  'info-r-4',
  'sum-label',
  'sum-words',
  'sum-number',
]);

export function getTemplateBorderTheme(comp: Pick<TemplateComponent, 'id' | 'type'>): TemplateBorderTheme {
  const id = String(comp.id ?? '').trim();
  if (comp.type === 'Table' || id === 'quote-items-table') {
    return {
      borderColor: '#1f2937',
      borderWidth: 1.5,
      gridColor: '#cbd5e1',
    };
  }
  if (EMPHASIS_BORDER_IDS.has(id)) {
    return {
      borderColor: '#1f2937',
      borderWidth: 1.35,
      gridColor: '#cbd5e1',
    };
  }
  return {
    borderColor: '#111827',
    borderWidth: 1,
    gridColor: '#dbe4ef',
  };
}

function overlapSize(aStart: number, aEnd: number, bStart: number, bEnd: number) {
  return Math.max(0, Math.min(aEnd, bEnd) - Math.max(aStart, bStart));
}

export function resolveComponentBorderSides(
  components: TemplateComponent[],
  target: TemplateComponent,
  tolerance = 1,
): BorderSides {
  if (!target.showBorder) {
    return { top: 0, right: 0, bottom: 0, left: 0 };
  }

  const sides: BorderSides = { top: 1, right: 1, bottom: 1, left: 1 };
  const targetLeft = target.x;
  const targetRight = target.x + target.width;
  const targetTop = target.y;
  const targetBottom = target.y + target.height;

  for (const other of components) {
    if (other === target || !other.showBorder) continue;
    const otherLeft = other.x;
    const otherRight = other.x + other.width;
    const otherTop = other.y;
    const otherBottom = other.y + other.height;
    const verticalOverlap = overlapSize(targetTop, targetBottom, otherTop, otherBottom);
    const horizontalOverlap = overlapSize(targetLeft, targetRight, otherLeft, otherRight);

    if (verticalOverlap > 0) {
      // Keep a single shared vertical line by letting the left component own it.
      if (Math.abs(otherRight - targetLeft) <= tolerance) sides.left = 0;
    }
    if (horizontalOverlap > 0) {
      // Keep a single shared horizontal line by letting the upper component own it.
      if (Math.abs(otherBottom - targetTop) <= tolerance) sides.top = 0;
    }
  }

  return sides;
}

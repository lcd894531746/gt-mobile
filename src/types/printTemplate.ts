/** 与桌面「打印模板编辑器」保存的 JSON 对齐（chunk 346）。 */

export type PaperSizeKey = 'half' | 'a5' | 'a4' | 'a3';

export type PaperOrientation = 'portrait' | 'landscape';

export type TemplateTextAlign = 'left' | 'center' | 'right';

export interface TemplateColumnDef {
  title: string;
  dataIndex: string;
  key: string;
  width?: number;
  textAlign?: TemplateTextAlign;
}

export interface TemplateTableRow {
  key: string;
  [dataIndex: string]: string | number | undefined;
}

export interface PrintComponentBase {
  id: number | string;
  type: string;
  x: number;
  y: number;
  width: number;
  height: number;
  fontSize?: number;
  rowHeight?: number;
  textAlign?: TemplateTextAlign;
  showBorder?: boolean;
}

export interface TemplateInput extends PrintComponentBase {
  type: 'Input';
  placeholder?: string;
  title?: string;
  bindTo?: string;
  color?: string;
}

export interface TemplateTag extends PrintComponentBase {
  type: 'Tag';
  title?: string;
  color?: string;
  placeholder?: string;
}

export interface TemplateTable extends PrintComponentBase {
  type: 'Table';
  columns?: TemplateColumnDef[];
  rows?: number;
  dataSource?: TemplateTableRow[];
}

export interface TemplateImage extends PrintComponentBase {
  type: 'Image';
  src?: string;
}

export type TemplateComponent = TemplateInput | TemplateTag | TemplateTable | TemplateImage;

export interface TemplateDoc {
  name: string;
  paperSize: PaperSizeKey | string;
  orientation?: PaperOrientation;
  components: TemplateComponent[];
}

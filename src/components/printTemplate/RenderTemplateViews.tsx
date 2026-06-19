import { Image, StyleSheet, Text, View, type ViewStyle } from 'react-native';
import type {
  TemplateComponent,
  TemplateImage,
  TemplateInput,
  TemplateTable,
} from '../../types/printTemplate';
import { bindToDisplay, getByPath, resolveTableRowCellDisplay } from '../../utils/printTemplateHelpers';

export type PreviewRecord = Record<string, unknown>;

function isPagedBind(bindTo?: string): boolean {
  return Boolean(bindTo && bindTo.startsWith('items'));
}

export function resolveInputText(
  comp: TemplateInput,
  preview: PreviewRecord,
  pageIndex: number,
  totalPages: number,
): string {
  const bind = comp.bindTo?.trim();
  if (!bind) return comp.placeholder ?? '';
  if (isPagedBind(bind) && totalPages > 1 && pageIndex < totalPages - 1) {
    return '见下页';
  }
  return bindToDisplay(getByPath(preview, bind));
}

function tagColors(color?: string): { bg: string; fg: string } {
  switch (color) {
    case 'processing':
      return { bg: '#e6f7ff', fg: '#096dd9' };
    case 'success':
      return { bg: '#f6ffed', fg: '#389e0d' };
    case 'error':
      return { bg: '#fff2f0', fg: '#cf1322' };
    case 'warning':
      return { bg: '#fffbe6', fg: '#d48806' };
    default:
      return { bg: '#fafafa', fg: '#595959' };
  }
}

export function RenderTemplateComponent(props: {
  comp: TemplateComponent;
  preview: PreviewRecord;
  scale: number;
  pageIndex?: number;
  totalPages?: number;
  selected?: boolean;
}) {
  const { comp, preview, scale, pageIndex = 0, totalPages = 1, selected } = props;
  const fs = (comp.fontSize ?? 14) * scale;
  const borderW = comp.showBorder ? StyleSheet.hairlineWidth * (scale < 1 ? 2 : 1) : 0;

  const frameStyle: ViewStyle = {
    width: '100%' as const,
    height: '100%' as const,
    borderWidth: borderW,
    borderColor: selected ? '#204dff' : '#111827',
    overflow: 'hidden' as const,
  };

  /** 标签等仍居中；输入框左对齐见 Input 分支 */
  const boxStyle: ViewStyle = {
    ...frameStyle,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 6 * scale,
  };

  switch (comp.type) {
    case 'Input': {
      const txt = resolveInputText(comp, preview, pageIndex, totalPages);
      return (
        <View
          style={[
            frameStyle,
            {
              justifyContent: 'center',
              alignItems: 'stretch',
              paddingHorizontal: 6 * scale,
            },
          ]}
        >
          <Text style={{ fontSize: fs, color: comp.color ?? '#111827', textAlign: 'left' }}>{txt}</Text>
        </View>
      );
    }
    case 'Tag': {
      const { bg, fg } = tagColors(comp.color);
      return (
        <View style={[boxStyle, { borderWidth: 0, justifyContent: 'center', alignItems: 'center' }]}>
          <View style={[styles.tagPill, { backgroundColor: bg, paddingHorizontal: 8 * scale }]}>
            <Text style={{ fontSize: fs * 0.95, color: fg, fontWeight: '600' }}>{comp.title ?? '标签'}</Text>
          </View>
        </View>
      );
    }
    case 'Image': {
      const img = comp as TemplateImage;
      return (
        <View style={[boxStyle, { borderColor: selected ? '#204dff' : '#cbd5e1', paddingHorizontal: 0 }]}>
          {img.src ? (
            <Image source={{ uri: img.src }} style={{ width: '100%', height: '100%' }} resizeMode="contain" />
          ) : (
            <View style={styles.imgPh}>
              <Text style={{ fontSize: fs * 0.85, color: '#94a3b8', textAlign: 'center' }}>图片</Text>
            </View>
          )}
        </View>
      );
    }
    case 'Table': {
      return (
        <TableInner
          comp={comp as TemplateTable}
          preview={preview}
          scale={scale}
          frameStyle={frameStyle}
          fs={fs}
        />
      );
    }
    default:
      return (
        <View style={boxStyle}>
          <Text style={{ fontSize: fs * 0.9, color: '#64748b' }}>
            {(comp as { type?: string }).type ?? '?'}
          </Text>
        </View>
      );
  }
}

function TableInner(props: {
  comp: TemplateTable;
  preview: PreviewRecord;
  scale: number;
  frameStyle: ViewStyle;
  fs: number;
}) {
  const { comp, preview, scale, frameStyle, fs } = props;
  const cols = comp.columns ?? [];
  const rowCount = Math.max(1, comp.rows ?? 8);
  const items = (preview.items as Record<string, unknown>[]) ?? [];
  const ds = comp.dataSource ?? [];

  const rowSlice = items.length > 0 ? items : ds;

  const cellFlexStyle = (c: { width?: number }) => ({
    flexGrow: Math.max(1, c.width ?? 120),
    flexShrink: 1,
    flexBasis: 0,
    minWidth: Math.max(40, 48 * scale),
  });

  return (
    <View
      style={[
        frameStyle,
        {
          paddingHorizontal: 0,
          justifyContent: 'flex-start',
          alignItems: 'stretch',
        },
      ]}
    >
      <View style={{ flex: 1, width: '100%' }}>
        <View style={[styles.tr, { borderBottomWidth: StyleSheet.hairlineWidth, width: '100%' }]}>
          {cols.map((c) => (
            <View
              key={c.key}
              style={[
                styles.thCell,
                cellFlexStyle(c),
                {
                  borderRightWidth: StyleSheet.hairlineWidth,
                  paddingVertical: 4 * scale,
                  paddingHorizontal: 4 * scale,
                  justifyContent: 'center',
                  alignItems: 'center',
                },
              ]}
            >
              <Text style={{ fontSize: fs * 0.92, fontWeight: '700', color: '#334155', textAlign: 'center' }}>
                {c.title}
              </Text>
            </View>
          ))}
        </View>
        {Array.from({ length: rowCount }).map((_, ri) => {
          const rowObj = (rowSlice[ri] ?? {}) as Record<string, unknown>;
          return (
            <View
              key={`r-${ri}`}
              style={[
                styles.tr,
                {
                  borderBottomWidth: StyleSheet.hairlineWidth,
                  minHeight: (comp.rowHeight ?? 28) * scale,
                  width: '100%',
                },
              ]}
            >
              {cols.map((c) => {
                const cell = resolveTableRowCellDisplay(rowObj, c.dataIndex);
                return (
                  <View
                    key={c.key}
                    style={[
                      styles.tdCell,
                      cellFlexStyle(c),
                      {
                        borderRightWidth: StyleSheet.hairlineWidth,
                        paddingVertical: 3 * scale,
                        paddingHorizontal: 4 * scale,
                        justifyContent: 'center',
                        alignItems: 'center',
                      },
                    ]}
                  >
                    <Text style={{ fontSize: fs * 0.88, color: '#1e293b', textAlign: 'center' }} numberOfLines={3}>
                      {cell}
                    </Text>
                  </View>
                );
              })}
            </View>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  tagPill: {
    borderRadius: 4,
    paddingVertical: 2,
    justifyContent: 'center',
    alignItems: 'center',
  },
  imgPh: {
    flex: 1,
    width: '100%',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f8fafc',
  },
  tr: {
    flexDirection: 'row',
    alignItems: 'stretch',
    borderColor: '#cbd5e1',
  },
  thCell: {
    borderColor: '#cbd5e1',
    justifyContent: 'center',
  },
  tdCell: {
    borderColor: '#e2e8f0',
  },
});

import { useEffect, useMemo, useRef } from 'react';
import { PanResponder, Pressable, StyleSheet, View } from 'react-native';
import type { TemplateComponent } from '../../types/printTemplate';
import { RenderTemplateComponent } from './RenderTemplateViews';
import type { PreviewRecord } from './RenderTemplateViews';

type Props = {
  paperWidthPx: number;
  paperHeightPx: number;
  scale: number;
  components: TemplateComponent[];
  preview: PreviewRecord;
  selectedId: string | number | null;
  onSelect: (id: string | number | null) => void;
  /** 双击组件时打开属性面板（单击仅选中） */
  onEditComponent?: (id: string | number) => void;
  onMove: (id: string | number, x: number, y: number) => void;
  readOnly?: boolean;
  pageIndex?: number;
  totalPages?: number;
};

export function PrintTemplateCanvas({
  paperWidthPx,
  paperHeightPx,
  scale,
  components,
  preview,
  selectedId,
  onSelect,
  onEditComponent,
  onMove,
  readOnly,
  pageIndex = 0,
  totalPages = 1,
}: Props) {
  const pw = paperWidthPx * scale;
  const ph = paperHeightPx * scale;

  return (
    <Pressable
      style={[styles.paper, { width: pw, height: ph }]}
      onPress={() => {
        if (!readOnly) onSelect(null);
      }}
    >
      <View style={styles.inner}>
        {components.map((comp) => (
          <DraggableComponent
            key={String(comp.id)}
            comp={comp}
            scale={scale}
            preview={preview}
            selected={selectedId === comp.id}
            readOnly={readOnly}
            paperW={paperWidthPx}
            paperH={paperHeightPx}
            pageIndex={pageIndex}
            totalPages={totalPages}
            onSelect={onSelect}
            onEditComponent={readOnly ? undefined : onEditComponent}
            onMove={onMove}
          />
        ))}
      </View>
    </Pressable>
  );
}

function DraggableComponent({
  comp,
  scale,
  preview,
  selected,
  readOnly,
  paperW,
  paperH,
  pageIndex,
  totalPages,
  onSelect,
  onEditComponent,
  onMove,
}: {
  comp: TemplateComponent;
  scale: number;
  preview: PreviewRecord;
  selected: boolean;
  readOnly?: boolean;
  paperW: number;
  paperH: number;
  pageIndex: number;
  totalPages: number;
  onSelect: (id: string | number | null) => void;
  onEditComponent?: (id: string | number) => void;
  onMove: (id: string | number, x: number, y: number) => void;
}) {
  const compRef = useRef(comp);
  compRef.current = comp;
  const origin = useRef({ x: 0, y: 0 });
  const tapTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const firstTapRef = useRef(0);

  useEffect(
    () => () => {
      if (tapTimerRef.current) clearTimeout(tapTimerRef.current);
    },
    [],
  );

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => false,
        onMoveShouldSetPanResponder: (_, g) =>
          !readOnly && (Math.abs(g.dx) > 6 || Math.abs(g.dy) > 6),
        onPanResponderGrant: () => {
          if (tapTimerRef.current) {
            clearTimeout(tapTimerRef.current);
            tapTimerRef.current = null;
          }
          firstTapRef.current = 0;
          const c = compRef.current;
          origin.current = { x: c.x, y: c.y };
          onSelect(c.id);
        },
        onPanResponderMove: (_, g) => {
          const c = compRef.current;
          let nx = origin.current.x + g.dx / scale;
          let ny = origin.current.y + g.dy / scale;
          const maxX = Math.max(0, paperW - c.width);
          const maxY = Math.max(0, paperH - c.height);
          nx = Math.min(Math.max(0, nx), maxX);
          ny = Math.min(Math.max(0, ny), maxY);
          onMove(c.id, nx, ny);
        },
      }),
    [readOnly, scale, paperW, paperH, onMove, onSelect],
  );

  const handlePress = () => {
    if (readOnly) return;
    if (!onEditComponent) {
      onSelect(comp.id);
      return;
    }
    const now = Date.now();
    if (now - firstTapRef.current < 280) {
      if (tapTimerRef.current) {
        clearTimeout(tapTimerRef.current);
        tapTimerRef.current = null;
      }
      firstTapRef.current = 0;
      onEditComponent(comp.id);
      return;
    }
    firstTapRef.current = now;
    onSelect(comp.id);
    tapTimerRef.current = setTimeout(() => {
      tapTimerRef.current = null;
      firstTapRef.current = 0;
    }, 280);
  };

  const left = comp.x * scale;
  const top = comp.y * scale;
  const w = comp.width * scale;
  const h = comp.height * scale;

  return (
    <View style={[styles.abs, { left, top, width: w, height: h }]} {...(!readOnly ? panResponder.panHandlers : {})}>
      <Pressable style={{ flex: 1 }} disabled={readOnly} onPress={handlePress}>
        <RenderTemplateComponent
          comp={comp}
          preview={preview}
          scale={scale}
          pageIndex={pageIndex}
          totalPages={totalPages}
          selected={selected}
        />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  paper: {
    backgroundColor: '#fff',
    borderRadius: 4,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#cbd5e1',
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  inner: {
    flex: 1,
    position: 'relative',
  },
  abs: {
    position: 'absolute',
  },
});

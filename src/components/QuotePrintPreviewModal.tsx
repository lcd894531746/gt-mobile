import { createElement } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { Dimensions, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { PrintTemplateCanvas } from './printTemplate/PrintTemplateCanvas';
import type { PreviewRecord } from './printTemplate/RenderTemplateViews';
import type { TemplateDoc } from '../types/printTemplate';
import { normalizePaperKey, normalizeTemplateLayout, paperDimensionsPx } from '../utils/printTemplateHelpers';
import { buildTemplatePrintHtml } from '../utils/printTemplatePrint';

type Props = {
  visible: boolean;
  template: TemplateDoc | null;
  previewData: PreviewRecord | null;
  onClose: () => void;
};

export function QuotePrintPreviewModal({ visible, template, previewData, onClose }: Props) {
  const insets = useSafeAreaInsets();

  if (!template || !previewData) return null;

  const normalizedTemplate = normalizeTemplateLayout(template);
  const orientation = normalizedTemplate.orientation === 'landscape' ? 'landscape' : 'portrait';
  const paper = paperDimensionsPx(normalizePaperKey(normalizedTemplate.paperSize), orientation);
  const screenWidth = Dimensions.get('window').width;
  const scale = Math.min((screenWidth - 24) / paper.widthPx, 1);
  const { html } = buildTemplatePrintHtml(normalizedTemplate, previewData);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={[styles.previewWrap, { paddingTop: Math.max(insets.top, 16) + 12 }]}>
        <View style={styles.previewBar}>
          <Text style={styles.previewTitle}>打印预览</Text>
          <Pressable style={styles.previewCloseBtn} onPress={onClose} hitSlop={16}>
            <Ionicons name="close" size={26} color="#fff" />
          </Pressable>
        </View>
        <ScrollView contentContainerStyle={styles.previewScroll}>
          {Platform.OS === 'web' ? (
            <View style={{ width: paper.widthPx * scale, height: paper.heightPx * scale, overflow: 'hidden' }}>
              {createElement('iframe', {
                srcDoc: html,
                style: {
                  width: `${paper.widthPx}px`,
                  height: `${paper.heightPx}px`,
                  border: '0',
                  transform: `scale(${scale})`,
                  transformOrigin: 'top left',
                  backgroundColor: '#fff',
                },
              })}
            </View>
          ) : (
            <PrintTemplateCanvas
              paperWidthPx={paper.widthPx}
              paperHeightPx={paper.heightPx}
              scale={scale}
              components={normalizedTemplate.components}
              preview={previewData}
              selectedId={null}
              onSelect={() => {}}
              onMove={() => {}}
              readOnly
            />
          )}
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  previewWrap: {
    flex: 1,
    backgroundColor: '#0f172a',
  },
  previewBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  previewCloseBtn: {
    minWidth: 44,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 22,
  },
  previewTitle: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  previewScroll: {
    paddingHorizontal: 12,
    paddingBottom: 32,
    alignItems: 'center',
  },
});

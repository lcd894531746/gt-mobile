import { Ionicons } from '@expo/vector-icons';
import { File, Paths } from 'expo-file-system';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { useCallback, useEffect, useMemo, useRef, useState, type ComponentProps } from 'react';
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { PrintTemplateCanvas } from '../components/printTemplate/PrintTemplateCanvas';
import type { PreviewRecord } from '../components/printTemplate/RenderTemplateViews';
import { PageScaffold } from '../components/PageScaffold';
import { fetchRemotePrintTemplateNames, fetchRemoteTemplateConfig } from '../services/api';
import type {
  PaperOrientation,
  PaperSizeKey,
  TemplateComponent,
  TemplateDoc,
  TemplateInput,
  TemplateTable,
  TemplateTableRow,
} from '../types/printTemplate';
import {
  bindToChineseLabel,
  createDefaultImage,
  createDefaultInput,
  createDefaultTable,
  createDefaultTag,
  defaultPreviewData,
  normalizeBindToCanonical,
  normalizeImportedTemplate,
  normalizePaperKey,
  normalizeTableColumnDataIndex,
  paperDimensionsPx,
  PAPER_MM,
  PRINT_TEMPLATE_BIND_BASE,
  PRINT_TEMPLATE_BIND_ITEM_ROW,
  PRINT_TEMPLATE_TABLE_COLUMN_BIND,
  tableColumnDataIndexLabel,
} from '../utils/printTemplateHelpers';
import {
  deleteTemplateOnDevice,
  loadTemplatesFromDevice,
  saveTemplateToDevice,
} from '../utils/printTemplateStorage';

type Props = {
  embedInStackHeader?: boolean;
};

export function PrintTemplateEditorScreen({ embedInStackHeader }: Props = {}) {
  const [listLoading, setListLoading] = useState(true);
  const [templates, setTemplates] = useState<TemplateDoc[]>([]);
  const [editorDoc, setEditorDoc] = useState<TemplateDoc | null>(null);
  const initialNameRef = useRef('');
  const [selectedId, setSelectedId] = useState<string | number | null>(null);
  /** 与选中分离：从组件库添加后不应自动弹出；单击仅选中，双击才打开 */
  const [propsSheetOpen, setPropsSheetOpen] = useState(false);
  const [bindPickerOpen, setBindPickerOpen] = useState(false);
  const [tableColBindPickerIdx, setTableColBindPickerIdx] = useState<number | null>(null);

  const [previewOpen, setPreviewOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [importText, setImportText] = useState('');
  const [exportOpen, setExportOpen] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [pullRefreshing, setPullRefreshing] = useState(false);

  const [canvasHostLayout, setCanvasHostLayout] = useState(() => {
    const w = Dimensions.get('window').width;
    return { w: Math.max(80, w - 24), h: 0 };
  });

  const previewSample = useMemo(() => defaultPreviewData(), []);

  const screenW = Dimensions.get('window').width;

  const fitCanvasScale = useMemo(() => {
    if (!editorDoc) return 1;
    const pk = normalizePaperKey(editorDoc.paperSize);
    const ori = editorDoc.orientation === 'landscape' ? 'landscape' : 'portrait';
    const { widthPx, heightPx } = paperDimensionsPx(pk, ori);
    const pad = 12;
    const availW = Math.max(80, canvasHostLayout.w - pad * 2);
    if (canvasHostLayout.h < 48) {
      const s = (screenW - 28) / widthPx;
      return Math.min(Math.max(s, 0.28), 1.12);
    }
    const availH = Math.max(80, canvasHostLayout.h - pad * 2);
    const sx = availW / widthPx;
    const sy = availH / heightPx;
    const s = Math.min(sx, sy);
    return Math.min(Math.max(s, 0.22), 1.12);
  }, [editorDoc, screenW, canvasHostLayout.w, canvasHostLayout.h]);

  const reloadList = useCallback(async () => {
    const rows = await loadTemplatesFromDevice();
    setTemplates(rows.sort((a, b) => a.name.localeCompare(b.name, 'zh-Hans-CN')));
  }, []);

  useEffect(() => {
    let alive = true;
    (async () => {
      setListLoading(true);
      try {
        await reloadList();
      } finally {
        if (alive) setListLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [reloadList]);

  useEffect(() => {
    if (!propsSheetOpen) {
      setBindPickerOpen(false);
      setTableColBindPickerIdx(null);
    }
  }, [propsSheetOpen]);

  const openCreate = () => {
    const doc: TemplateDoc = {
      name: `模板_${Date.now()}`,
      paperSize: 'a4',
      orientation: 'portrait',
      components: [],
    };
    initialNameRef.current = doc.name;
    setEditorDoc(doc);
    setSelectedId(null);
    setPropsSheetOpen(false);
  };

  const openEdit = (doc: TemplateDoc) => {
    initialNameRef.current = doc.name;
    setEditorDoc({ ...doc, components: [...doc.components] });
    setSelectedId(null);
    setPropsSheetOpen(false);
  };

  const closeEditor = () => {
    setPreviewOpen(false);
    setExportOpen(false);
    setImportOpen(false);
    setEditorDoc(null);
    setSelectedId(null);
    setPropsSheetOpen(false);
  };

  const persistDoc = async (doc: TemplateDoc) => {
    if (initialNameRef.current && initialNameRef.current !== doc.name) {
      await deleteTemplateOnDevice(initialNameRef.current);
    }
    await saveTemplateToDevice(doc);
    initialNameRef.current = doc.name;
    await reloadList();
  };

  const saveCurrent = async () => {
    if (!editorDoc) return;
    if (!editorDoc.name.trim()) {
      Alert.alert('提示', '模板名称不能为空');
      return;
    }
    try {
      await persistDoc(editorDoc);
      Alert.alert('成功', '模板已保存到本机');
    } catch (e) {
      Alert.alert('失败', e instanceof Error ? e.message : '保存失败');
    }
  };

  const syncRemote = async () => {
    setSyncing(true);
    try {
      const names = await fetchRemotePrintTemplateNames();
      if (!names || names.length === 0) {
        Alert.alert('提示', '未获取到服务端模板列表（接口不可用或列表为空）');
        return;
      }
      let ok = 0;
      for (const name of names) {
        const raw = await fetchRemoteTemplateConfig(name);
        const doc = normalizeImportedTemplate(raw);
        if (!doc) continue;
        await saveTemplateToDevice({ ...doc, name: doc.name || name });
        ok++;
      }
      await reloadList();
      Alert.alert('完成', `已尝试同步 ${names.length} 个名称，成功解析 ${ok} 个`);
    } catch (e) {
      Alert.alert('失败', e instanceof Error ? e.message : '同步失败');
    } finally {
      setSyncing(false);
    }
  };

  const exportCurrentToDevice = async () => {
    if (!editorDoc) return;
    try {
      const canShare = await Sharing.isAvailableAsync();
      if (!canShare) {
        Alert.alert('提示', '当前设备暂不支持导出到系统文件或分享面板');
        return;
      }

      const safeName = (editorDoc.name.trim() || `template_${Date.now()}`)
        .replace(/[<>:"/\\|?*\u0000-\u001F]/g, '_');
      const file = new File(Paths.cache, `${safeName}.json`);
      file.create({ overwrite: true, intermediates: true });
      file.write(JSON.stringify(editorDoc, null, 2));

      await Sharing.shareAsync(file.uri, {
        mimeType: 'application/json',
        dialogTitle: `导出模板：${editorDoc.name}`,
        UTI: 'public.json',
      });
    } catch (e) {
      Alert.alert('失败', e instanceof Error ? e.message : '导出失败');
    }
  };

  const exportCurrentPdf = async () => {
    if (!editorDoc) return;
    try {
      const canShare = await Sharing.isAvailableAsync();
      if (!canShare) {
        Alert.alert('提示', '当前设备暂不支持导出到系统文件或分享面板');
        return;
      }

      const pageWidth = Math.round(paperPx.widthPx);
      const pageHeight = Math.round(paperPx.heightPx);
      const safeName = formatExportTimestamp();

      const esc = (value: unknown) =>
        String(value ?? '')
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
          .replace(/"/g, '&quot;')
          .replace(/'/g, '&#39;');

      const pickTagTheme = (color?: string) => {
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
      };

      const componentsHtml = editorDoc.components.map((comp) => {
        const left = Math.round(comp.x);
        const top = Math.round(comp.y);
        const width = Math.round(comp.width);
        const height = Math.round(comp.height);
        const fontSize = Math.max(8, Math.round(comp.fontSize ?? 14));
        const border = comp.showBorder ? '1px solid #111827' : 'none';
        const color = esc((comp as { color?: string }).color ?? '#111827');

        if (comp.type === 'Input') {
          const bindTo = (comp as { bindTo?: string }).bindTo?.trim();
          const text = bindTo
            ? esc(bindTo)
            : esc((comp as { placeholder?: string }).placeholder ?? '');
          return `
            <div style="position:absolute;left:${left}px;top:${top}px;width:${width}px;height:${height}px;border:${border};box-sizing:border-box;padding:0 6px;display:flex;align-items:center;justify-content:flex-start;font-size:${fontSize}px;color:${color};overflow:hidden;white-space:nowrap;">
              ${text}
            </div>
          `;
        }

        if (comp.type === 'Tag') {
          const theme = pickTagTheme((comp as { color?: string }).color);
          return `
            <div style="position:absolute;left:${left}px;top:${top}px;width:${width}px;height:${height}px;box-sizing:border-box;display:flex;align-items:center;justify-content:center;">
              <div style="padding:2px 8px;border-radius:4px;background:${theme.bg};color:${theme.fg};font-size:${Math.max(8, Math.round(fontSize * 0.95))}px;font-weight:600;max-width:100%;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;">
                ${esc((comp as { title?: string }).title ?? '标签')}
              </div>
            </div>
          `;
        }

        if (comp.type === 'Image') {
          const src = (comp as { src?: string }).src?.trim();
          if (src) {
            return `
              <div style="position:absolute;left:${left}px;top:${top}px;width:${width}px;height:${height}px;border:${comp.showBorder ? '1px solid #cbd5e1' : 'none'};box-sizing:border-box;display:flex;align-items:center;justify-content:center;overflow:hidden;">
                <img src="${esc(src)}" style="max-width:100%;max-height:100%;object-fit:contain;" />
              </div>
            `;
          }
          return `
            <div style="position:absolute;left:${left}px;top:${top}px;width:${width}px;height:${height}px;border:${comp.showBorder ? '1px solid #cbd5e1' : 'none'};box-sizing:border-box;display:flex;align-items:center;justify-content:center;background:#f8fafc;color:#94a3b8;font-size:${Math.max(8, Math.round(fontSize * 0.85))}px;">
              图片
            </div>
          `;
        }

        if (comp.type === 'Table') {
          const table = comp as import('../types/printTemplate').TemplateTable;
          const cols = table.columns ?? [];
          const rows = Math.max(1, table.rows ?? 8);
          const dataRows = (table.dataSource ?? []).slice(0, rows);
          const rowHeight = Math.max(18, Math.round(table.rowHeight ?? 28));

          const head = cols.map((col) => `
            <div style="flex:${Math.max(1, col.width ?? 120)} 1 0;min-width:40px;border-right:1px solid #cbd5e1;padding:4px;box-sizing:border-box;display:flex;align-items:center;justify-content:center;font-weight:700;color:#334155;text-align:center;">
              ${esc(col.title)}
            </div>
          `).join('');

          const body = Array.from({ length: rows }).map((_, rowIndex) => {
            const row = (dataRows[rowIndex] ?? {}) as Record<string, unknown>;
            const cells = cols.map((col) => `
              <div style="flex:${Math.max(1, col.width ?? 120)} 1 0;min-width:40px;border-right:1px solid #e2e8f0;padding:3px 4px;box-sizing:border-box;display:flex;align-items:center;justify-content:center;text-align:center;color:#1e293b;overflow:hidden;">
                ${esc(String(row[col.dataIndex] ?? ''))}
              </div>
            `).join('');
            return `<div style="display:flex;min-height:${rowHeight}px;border-bottom:1px solid #cbd5e1;">${cells}</div>`;
          }).join('');

          return `
            <div style="position:absolute;left:${left}px;top:${top}px;width:${width}px;height:${height}px;border:${border};box-sizing:border-box;overflow:hidden;background:#fff;">
              <div style="width:100%;height:100%;display:flex;flex-direction:column;">
                <div style="display:flex;border-bottom:1px solid #cbd5e1;background:#fff;">${head}</div>
                ${body}
              </div>
            </div>
          `;
        }

        return '';
      }).join('');

      const html = `
        <!DOCTYPE html>
        <html>
          <head>
            <meta charset="utf-8" />
            <style>
              * { box-sizing: border-box; }
              html, body { margin: 0; padding: 0; background: #ffffff; font-family: Arial, "PingFang SC", "Microsoft YaHei", sans-serif; }
              .page {
                position: relative;
                width: ${pageWidth}px;
                height: ${pageHeight}px;
                background: #ffffff;
                overflow: hidden;
              }
            </style>
          </head>
          <body>
            <div class="page">${componentsHtml}</div>
          </body>
        </html>
      `;

      const pdf = await Print.printToFileAsync({
        html,
        width: pageWidth,
        height: pageHeight,
        base64: false,
      });

      const targetPdf = new File(Paths.cache, `${safeName}.pdf`);
      if (targetPdf.exists) {
        targetPdf.delete();
      }
      const sourcePdf = new File(pdf.uri);
      sourcePdf.copy(targetPdf);

      await Sharing.shareAsync(targetPdf.uri, {
        mimeType: 'application/pdf',
        dialogTitle: `导出 PDF：${editorDoc.name}`,
        UTI: 'com.adobe.pdf',
      });
    } catch (e) {
      Alert.alert('失败', e instanceof Error ? e.message : 'PDF 导出失败');
    }
  };

  const confirmImportJson = () => {
    try {
      const parsed = JSON.parse(importText) as unknown;
      const doc = normalizeImportedTemplate(parsed);
      if (!doc) {
        Alert.alert('失败', 'JSON 格式不符合模板结构');
        return;
      }
      setImportOpen(false);
      setImportText('');
      initialNameRef.current = doc.name;
      setEditorDoc(doc);
      setSelectedId(null);
      setPropsSheetOpen(false);
    } catch {
      Alert.alert('失败', 'JSON 解析错误');
    }
  };

  const patchSelectedTable = useCallback(
    (fn: (t: TemplateTable) => TemplateTable) => {
      setEditorDoc((prev) => {
        if (!prev || selectedId == null) return prev;
        const cur = prev.components.find((c) => c.id === selectedId);
        if (!cur || cur.type !== 'Table') return prev;
        const next = fn({ ...(cur as TemplateTable) });
        return {
          ...prev,
          components: prev.components.map((c) => (c.id === selectedId ? next : c)),
        };
      });
    },
    [selectedId],
  );

  const patchSelected = useCallback(
    (patch: Partial<TemplateComponent>) => {
      if (selectedId == null) return;
      setEditorDoc((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          components: prev.components.map((c) =>
            c.id === selectedId ? ({ ...c, ...patch } as TemplateComponent) : c,
          ),
        };
      });
    },
    [selectedId],
  );

  /** 必须用函数式更新并保持回调稳定，否则拖拽时每帧 editorDoc 变化会重建子组件 PanResponder，导致画布闪烁 */
  const moveComponent = useCallback((id: string | number, x: number, y: number) => {
    setEditorDoc((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        components: prev.components.map((c) => (c.id === id ? { ...c, x, y } : c)),
      };
    });
  }, []);

  const addComponent = useCallback(
    (create: () => TemplateComponent) => {
      if (!editorDoc) return;
      const pk = normalizePaperKey(editorDoc.paperSize);
      const ori = editorDoc.orientation === 'landscape' ? 'landscape' : 'portrait';
      const { widthPx, heightPx } = paperDimensionsPx(pk, ori);
      let c = create();
      const nx = Math.min(Math.max(12, widthPx / 2 - c.width / 2), Math.max(12, widthPx - c.width - 12));
      const ny = Math.min(Math.max(12, heightPx / 2 - c.height / 2), Math.max(12, heightPx - c.height - 12));
      c = { ...c, x: nx, y: ny };
      setEditorDoc({ ...editorDoc, components: [...editorDoc.components, c] });
      setSelectedId(null);
      setPropsSheetOpen(false);
    },
    [editorDoc],
  );

  const handleCanvasSelect = useCallback((id: string | number | null) => {
    setSelectedId(id);
    if (id === null) setPropsSheetOpen(false);
  }, []);

  const handleOpenProps = useCallback((id: string | number) => {
    setSelectedId(id);
    setPropsSheetOpen(true);
  }, []);

  const deleteSelected = () => {
    if (!editorDoc || selectedId == null) return;
    setEditorDoc({
      ...editorDoc,
      components: editorDoc.components.filter((c) => c.id !== selectedId),
    });
    setSelectedId(null);
    setPropsSheetOpen(false);
  };

  const deleteTemplateRow = (name: string) => {
    Alert.alert('确认删除', `删除模板「${name}」？`, [
      { text: '取消', style: 'cancel' },
      {
        text: '删除',
        style: 'destructive',
        onPress: async () => {
          await deleteTemplateOnDevice(name);
          await reloadList();
        },
      },
    ]);
  };

  const selected = editorDoc?.components.find((c) => c.id === selectedId) ?? null;

  const listView = (
    <View style={styles.screenFill}>
      <View style={styles.listToolbar}>
        <Pressable style={styles.tbPrimary} onPress={openCreate}>
          <Ionicons name="add-outline" size={18} color="#fff" />
          <Text style={styles.tbPrimaryText}>新建模板</Text>
        </Pressable>
        <Pressable
          style={[styles.tbGhost, syncing && styles.tbDisabled]}
          onPress={() => void syncRemote()}
          disabled={syncing}
        >
          {syncing ? (
            <ActivityIndicator color="#204dff" />
          ) : (
            <Ionicons name="cloud-download-outline" size={18} color="#204dff" />
          )}
          <Text style={styles.tbGhostText}>同步服务端</Text>
        </Pressable>
        <Pressable style={styles.tbGhost} onPress={() => setImportOpen(true)}>
          <Ionicons name="document-outline" size={18} color="#204dff" />
          <Text style={styles.tbGhostText}>导入 JSON</Text>
        </Pressable>
      </View>
      {listLoading ? (
        <View style={styles.center}>
          <ActivityIndicator color="#204dff" />
          <Text style={styles.hint}>加载模板列表…</Text>
        </View>
      ) : (
        <FlatList
          style={styles.tableScroll}
          contentContainerStyle={
            templates.length === 0 ? [styles.listPad, styles.listGrow] : styles.listPad
          }
          data={templates}
          keyExtractor={(item) => item.name}
          refreshing={pullRefreshing}
          onRefresh={() => {
            setPullRefreshing(true);
            void reloadList().finally(() => setPullRefreshing(false));
          }}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Ionicons name="print-outline" size={44} color="#c5cee0" />
              <Text style={styles.emptyTitle}>暂无本地模板</Text>
              <Text style={styles.emptySub}>
                新建或与桌面端一致的 JSON 导入；若服务端提供接口可点「同步服务端」。
              </Text>
            </View>
          }
          renderItem={({ item }) => (
            <Pressable style={styles.rowCard} onPress={() => openEdit(item)}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={styles.rowTitle} numberOfLines={1}>
                  {item.name}
                </Text>
                <Text style={styles.rowSub} numberOfLines={1}>
                  {PAPER_MM[normalizePaperKey(item.paperSize)].label} · {item.components.length} 个组件
                </Text>
              </View>
              <Pressable hitSlop={10} onPress={() => deleteTemplateRow(item.name)} accessibilityLabel="删除模板">
                <Ionicons name="trash-outline" size={18} color="#dc2626" />
              </Pressable>
            </Pressable>
          )}
        />
      )}
    </View>
  );

  const pk = editorDoc ? normalizePaperKey(editorDoc.paperSize) : 'a4';
  const ori: PaperOrientation = editorDoc?.orientation === 'landscape' ? 'landscape' : 'portrait';
  const paperPx = paperDimensionsPx(pk, ori);

  const editorView = editorDoc ? (
    <View style={styles.screenFill}>
      <View style={styles.editorHeader}>
        {!embedInStackHeader ? (
          <Pressable style={styles.iconBtn} onPress={closeEditor} accessibilityLabel="返回">
            <Ionicons name="chevron-back" size={20} color="#204dff" />
          </Pressable>
        ) : null}
        <TextInput
          style={[styles.nameInput, embedInStackHeader && styles.nameInputEmbed]}
          value={editorDoc.name}
          onChangeText={(t) => setEditorDoc({ ...editorDoc, name: t })}
          placeholder="模板名称"
          placeholderTextColor="#94a3b8"
          multiline={false}
          scrollEnabled={false}
          textAlignVertical="center"
        />
        <Pressable style={styles.iconBtn} onPress={() => setExportOpen(true)} accessibilityLabel="导出">
          <Ionicons name="share-outline" size={18} color="#204dff" />
        </Pressable>
        <Pressable style={styles.iconBtn} onPress={() => setPreviewOpen(true)} accessibilityLabel="预览">
          <Ionicons name="eye-outline" size={18} color="#204dff" />
        </Pressable>
        <Pressable style={styles.saveChip} onPress={() => void saveCurrent()}>
          <Text style={styles.saveChipText}>保存</Text>
        </Pressable>
      </View>

      <View style={styles.paperRow}>
        {(Object.keys(PAPER_MM) as PaperSizeKey[]).map((k) => (
          <Pressable
            key={k}
            style={[styles.chip, pk === k && styles.chipOn]}
            onPress={() => setEditorDoc({ ...editorDoc, paperSize: k })}
          >
            <Text style={[styles.chipText, pk === k && styles.chipTextOn]}>{PAPER_MM[k].label}</Text>
          </Pressable>
        ))}
        <Pressable
          style={[styles.chip, ori === 'landscape' && styles.chipOn]}
          onPress={() =>
            setEditorDoc({
              ...editorDoc,
              orientation: ori === 'portrait' ? 'landscape' : 'portrait',
            })
          }
        >
          <Text style={[styles.chipText, ori === 'landscape' && styles.chipTextOn]}>横向</Text>
        </Pressable>
      </View>

      <View style={styles.editorWorkspace}>
        <View style={styles.chromeCompact}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.paletteScroll}
            contentContainerStyle={styles.paletteRow}
            keyboardShouldPersistTaps="handled"
            nestedScrollEnabled={Platform.OS === 'android'}
          >
            <Pressable style={styles.palBtn} onPress={() => addComponent(createDefaultInput)}>
              <Text style={styles.palBtnText}>+输入框</Text>
            </Pressable>
            <Pressable style={styles.palBtn} onPress={() => addComponent(createDefaultTag)}>
              <Text style={styles.palBtnText}>+标签</Text>
            </Pressable>
            <Pressable style={styles.palBtn} onPress={() => addComponent(createDefaultTable)}>
              <Text style={styles.palBtnText}>+表格</Text>
            </Pressable>
            <Pressable style={styles.palBtn} onPress={() => addComponent(createDefaultImage)}>
              <Text style={styles.palBtnText}>+图片</Text>
            </Pressable>
          </ScrollView>
          <Text style={styles.hintMicro} numberOfLines={2}>
            点击上栏添加至画布 · 拖拽移动 · 单击选中 · 双击属性
          </Text>
        </View>

        <View
          style={styles.canvasHost}
          onLayout={(e) => {
            const { width, height } = e.nativeEvent.layout;
            setCanvasHostLayout({ w: width, h: height });
          }}
        >
          <View style={styles.canvasPlate}>
            <PrintTemplateCanvas
              paperWidthPx={paperPx.widthPx}
              paperHeightPx={paperPx.heightPx}
              scale={fitCanvasScale}
              components={editorDoc.components}
              preview={previewSample as PreviewRecord}
              selectedId={selectedId}
              onSelect={handleCanvasSelect}
              onEditComponent={handleOpenProps}
              onMove={moveComponent}
            />
          </View>
        </View>
      </View>

      <Modal
        visible={propsSheetOpen && selected != null}
        transparent
        animationType="slide"
        onRequestClose={() => setPropsSheetOpen(false)}
      >
        <KeyboardAvoidingView style={styles.mask} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <Pressable style={styles.maskBackdrop} onPress={() => setPropsSheetOpen(false)} />
          <View style={styles.propSheet}>
            <Text style={styles.propTitle}>组件属性 · {selected?.type}</Text>
            <ScrollView
              keyboardShouldPersistTaps="handled"
              style={{ maxHeight: selected?.type === 'Table' ? 480 : selected?.type === 'Input' ? 340 : 300 }}
            >
              {selected?.type === 'Input' ? (
                <>
                  <Text style={styles.propSectionTitle}>基础属性</Text>
                  <DimsRow
                    width={String(selected.width ?? '')}
                    height={String(selected.height ?? '')}
                    fontSize={String(selected.fontSize ?? 14)}
                    onWidth={(t) => patchSelected({ width: Math.max(1, parseCoordInput(t) || 40) })}
                    onHeight={(t) => patchSelected({ height: Math.max(1, parseCoordInput(t) || 24) })}
                    onFontSize={(t) => patchSelected({ fontSize: Math.max(6, parseCoordInput(t) || 12) })}
                  />
                  <View style={styles.switchRow}>
                    <Text style={styles.subLabel}>显示边框</Text>
                    <Switch
                      value={Boolean(selected.showBorder)}
                      onValueChange={(v) => patchSelected({ showBorder: v })}
                      trackColor={{ false: '#cbd5e1', true: '#94b8ff' }}
                      thumbColor={selected.showBorder ? '#204dff' : '#f4f4f5'}
                    />
                  </View>
                  <Text style={styles.propSectionTitle}>输入框配置</Text>
                  <Text style={styles.fieldLab}>数据绑定</Text>
                  <Pressable style={styles.bindTrigger} onPress={() => setBindPickerOpen(true)}>
                    <Text style={styles.bindTriggerText} numberOfLines={1}>
                      {bindToChineseLabel((selected as TemplateInput).bindTo)}
                    </Text>
                    <Ionicons name="chevron-forward" size={18} color="#64748b" />
                  </Pressable>
                </>
              ) : (
                <>
                  <DimsRow
                    width={String(selected?.width ?? '')}
                    height={String(selected?.height ?? '')}
                    fontSize={String(selected?.fontSize ?? 14)}
                    onWidth={(t) => patchSelected({ width: Math.max(1, parseCoordInput(t) || 40) })}
                    onHeight={(t) => patchSelected({ height: Math.max(1, parseCoordInput(t) || 24) })}
                    onFontSize={(t) => patchSelected({ fontSize: Math.max(6, parseCoordInput(t) || 12) })}
                  />
                  {selected?.type === 'Tag' ? (
                    <>
                      <Field
                        label="标题"
                        value={(selected as TemplateComponent & { title?: string }).title ?? ''}
                        onChange={(t) => patchSelected({ title: t })}
                      />
                      <Field
                        label="颜色主题"
                        value={(selected as TemplateComponent & { color?: string }).color ?? 'default'}
                        onChange={(t) => patchSelected({ color: t })}
                      />
                      <Text style={styles.fieldHint}>可选 default / success / processing / warning / error</Text>
                    </>
                  ) : null}
                  {selected?.type === 'Table' ? (
                    <>
                      <Text style={styles.propSectionTitle}>列表配置</Text>
                      {((selected as TemplateTable).columns ?? []).length === 0 ? (
                        <Text style={styles.fieldHint}>暂无列，点击下方添加列。</Text>
                      ) : null}
                      {((selected as TemplateTable).columns ?? []).map((col, colIdx) => {
                        const cols = (selected as TemplateTable).columns ?? [];
                        return (
                          <View key={col.key} style={styles.tableColCard}>
                            <View style={styles.tableColOneLine}>
                              <TextInput
                                style={styles.tableColTitleInputFlex}
                                value={col.title}
                                placeholder="列标题"
                                onChangeText={(t) =>
                                  patchSelectedTable((tbl) => {
                                    const c2 = [...(tbl.columns ?? [])];
                                    c2[colIdx] = { ...c2[colIdx], title: t };
                                    return { ...tbl, columns: c2 };
                                  })
                                }
                                placeholderTextColor="#94a3b8"
                              />
                              <Pressable
                                style={styles.tableColBindPressFlex}
                                onPress={() => setTableColBindPickerIdx(colIdx)}
                              >
                                <Text style={styles.tableColBindText} numberOfLines={1}>
                                  {tableColumnDataIndexLabel(col.dataIndex)}
                                </Text>
                                <Ionicons name="chevron-forward" size={16} color="#64748b" />
                              </Pressable>
                              <View style={styles.tableColIconGroup}>
                                <Pressable
                                  hitSlop={6}
                                  disabled={colIdx === 0}
                                  style={colIdx === 0 ? styles.tbIconDisabled : undefined}
                                  onPress={() =>
                                    patchSelectedTable((t) => {
                                      const next = [...(t.columns ?? [])];
                                      if (colIdx <= 0) return t;
                                      const [x] = next.splice(colIdx, 1);
                                      next.splice(colIdx - 1, 0, x);
                                      return { ...t, columns: next };
                                    })
                                  }
                                >
                                  <Ionicons name="chevron-up" size={19} color="#204dff" />
                                </Pressable>
                                <Pressable
                                  hitSlop={6}
                                  disabled={colIdx >= cols.length - 1}
                                  style={colIdx >= cols.length - 1 ? styles.tbIconDisabled : undefined}
                                  onPress={() =>
                                    patchSelectedTable((t) => {
                                      const next = [...(t.columns ?? [])];
                                      if (colIdx >= next.length - 1) return t;
                                      const [x] = next.splice(colIdx, 1);
                                      next.splice(colIdx + 1, 0, x);
                                      return { ...t, columns: next };
                                    })
                                  }
                                >
                                  <Ionicons name="chevron-down" size={19} color="#204dff" />
                                </Pressable>
                                <Pressable
                                  hitSlop={6}
                                  onPress={() =>
                                    patchSelectedTable((t) => {
                                      const next = [...(t.columns ?? [])];
                                      const [removed] = next.splice(colIdx, 1);
                                      if (!removed) return t;
                                      const ds = (t.dataSource ?? []).map((row) => {
                                        const copy = { ...row };
                                        delete copy[removed.dataIndex];
                                        return copy;
                                      });
                                      return { ...t, columns: next, dataSource: ds };
                                    })
                                  }
                                >
                                  <Ionicons name="remove-circle-outline" size={20} color="#dc2626" />
                                </Pressable>
                              </View>
                            </View>
                          </View>
                        );
                      })}
                      <Pressable style={styles.addColBtn} onPress={() => patchSelectedTable((t) => {
                        const cols = [...(t.columns ?? [])];
                        const n = cols.length + 1;
                        const dataIndex = `col_${Date.now()}`;
                        cols.push({
                          title: `列${n}`,
                          dataIndex,
                          key: `k-${Date.now()}`,
                          textAlign: 'center',
                        });
                        const ds = (t.dataSource ?? []).map((row) => ({ ...row, [dataIndex]: '' }));
                        return { ...t, columns: cols, dataSource: ds };
                      })}>
                        <Ionicons name="add-circle-outline" size={22} color="#204dff" />
                        <Text style={styles.addColBtnText}>添加列</Text>
                      </Pressable>
                      <Text style={styles.propSectionTitle}>表格属性</Text>
                      <View style={styles.dimsRow}>
                        <View style={styles.dimsCell}>
                          <Text style={styles.dimsLab}>行数</Text>
                          <TextInput
                            style={styles.dimsIn}
                            keyboardType="number-pad"
                            value={String((selected as TemplateTable).rows ?? 8)}
                            onChangeText={(t) =>
                              patchSelected({ rows: Math.max(1, parseCoordInput(t) || 8) })
                            }
                            placeholderTextColor="#94a3b8"
                          />
                        </View>
                        <View style={styles.dimsCell}>
                          <Text style={styles.dimsLab}>行高</Text>
                          <TextInput
                            style={styles.dimsIn}
                            keyboardType="decimal-pad"
                            value={String((selected as TemplateTable).rowHeight ?? 28)}
                            onChangeText={(t) =>
                              patchSelected({ rowHeight: Math.max(8, parseCoordInput(t) || 28) })
                            }
                            placeholderTextColor="#94a3b8"
                          />
                        </View>
                      </View>
                      <View style={styles.switchRow}>
                        <Text style={styles.subLabel}>显示边框</Text>
                        <Switch
                          value={Boolean(selected.showBorder)}
                          onValueChange={(v) => patchSelected({ showBorder: v })}
                          trackColor={{ false: '#cbd5e1', true: '#94b8ff' }}
                          thumbColor={selected.showBorder ? '#204dff' : '#f4f4f5'}
                        />
                      </View>
                    </>
                  ) : null}
                  {selected?.type === 'Image' ? (
                    <Field
                      label="图片 URL"
                      value={(selected as TemplateComponent & { src?: string }).src ?? ''}
                      onChange={(t) => patchSelected({ src: t })}
                    />
                  ) : null}
                  {(selected?.type === 'Tag' || selected?.type === 'Image') ? (
                    <View style={styles.switchRow}>
                      <Text style={styles.subLabel}>显示边框</Text>
                      <Switch
                        value={Boolean(selected?.showBorder)}
                        onValueChange={(v) => patchSelected({ showBorder: v })}
                        trackColor={{ false: '#cbd5e1', true: '#94b8ff' }}
                        thumbColor={selected?.showBorder ? '#204dff' : '#f4f4f5'}
                      />
                    </View>
                  ) : null}
                </>
              )}
            </ScrollView>
            <View style={styles.propActions}>
              <Pressable style={styles.dangerBtn} onPress={deleteSelected}>
                <Text style={styles.dangerBtnText}>删除组件</Text>
              </Pressable>
              <Pressable style={styles.propOk} onPress={() => setPropsSheetOpen(false)}>
                <Text style={styles.propOkText}>完成</Text>
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <Modal
        visible={bindPickerOpen && selected?.type === 'Input'}
        transparent
        animationType="fade"
        onRequestClose={() => setBindPickerOpen(false)}
      >
        <KeyboardAvoidingView style={styles.bindPickerOverlay} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <Pressable style={styles.maskBackdrop} onPress={() => setBindPickerOpen(false)} />
          <View style={styles.bindPickerSheet}>
            <Text style={styles.modalTitle}>数据绑定</Text>
            <Text style={styles.bindPickerHint}>选项与桌面 EXE 打印模板编辑器中的「数据绑定」一致。</Text>
            <ScrollView keyboardShouldPersistTaps="handled" style={{ maxHeight: 420 }}>
              <Text style={styles.bindPickerSection}>单据字段</Text>
              {PRINT_TEMPLATE_BIND_BASE.map((opt) => {
                const cur =
                  selected?.type === 'Input'
                    ? normalizeBindToCanonical((selected as TemplateInput).bindTo)
                    : '';
                const on = cur === opt.bindTo;
                return (
                  <Pressable
                    key={opt.bindTo}
                    style={[styles.bindPickerRow, on && styles.bindPickerRowOn]}
                    onPress={() => {
                      patchSelected({ bindTo: opt.bindTo });
                      setBindPickerOpen(false);
                    }}
                  >
                    <Text style={[styles.bindPickerRowText, on && styles.bindPickerRowTextOn]}>{opt.label}</Text>
                    {on ? <Ionicons name="checkmark-circle" size={20} color="#204dff" /> : null}
                  </Pressable>
                );
              })}
              <Text style={styles.bindPickerSection}>明细（首行）</Text>
              {PRINT_TEMPLATE_BIND_ITEM_ROW.map((opt) => {
                const cur =
                  selected?.type === 'Input'
                    ? normalizeBindToCanonical((selected as TemplateInput).bindTo)
                    : '';
                const on = cur === opt.bindTo;
                return (
                  <Pressable
                    key={opt.bindTo}
                    style={[styles.bindPickerRow, on && styles.bindPickerRowOn]}
                    onPress={() => {
                      patchSelected({ bindTo: opt.bindTo });
                      setBindPickerOpen(false);
                    }}
                  >
                    <Text style={[styles.bindPickerRowText, on && styles.bindPickerRowTextOn]}>{opt.label}</Text>
                    {on ? <Ionicons name="checkmark-circle" size={20} color="#204dff" /> : null}
                  </Pressable>
                );
              })}
            </ScrollView>
            <Pressable style={styles.bindPickerClose} onPress={() => setBindPickerOpen(false)}>
              <Text style={styles.bindPickerCloseText}>关闭</Text>
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <Modal
        visible={tableColBindPickerIdx !== null && selected?.type === 'Table'}
        transparent
        animationType="fade"
        onRequestClose={() => setTableColBindPickerIdx(null)}
      >
        <KeyboardAvoidingView style={styles.bindPickerOverlay} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <Pressable style={styles.maskBackdrop} onPress={() => setTableColBindPickerIdx(null)} />
          <View style={styles.bindPickerSheet}>
            <Text style={styles.modalTitle}>列 · 数据绑定</Text>
            <Text style={styles.bindPickerHint}>绑定到每一条明细行上的字段（与桌面 EXE「列表配置」一致）。</Text>
            <ScrollView keyboardShouldPersistTaps="handled" style={{ maxHeight: 420 }}>
              {PRINT_TEMPLATE_TABLE_COLUMN_BIND.map((opt) => {
                const tbl = selected as TemplateTable;
                const pickIdx = tableColBindPickerIdx ?? -1;
                const col = pickIdx >= 0 ? tbl.columns?.[pickIdx] : undefined;
                const cur = normalizeTableColumnDataIndex(col?.dataIndex);
                const on = cur === opt.dataIndex;
                return (
                  <Pressable
                    key={opt.dataIndex}
                    style={[styles.bindPickerRow, on && styles.bindPickerRowOn]}
                    onPress={() => {
                      if (tableColBindPickerIdx == null || selected?.type !== 'Table') return;
                      const idx = tableColBindPickerIdx;
                      patchSelectedTable((t) => {
                        const c2 = [...(t.columns ?? [])];
                        const oldIdx = c2[idx]?.dataIndex;
                        if (oldIdx == null) return t;
                        const canon = opt.dataIndex;
                        c2[idx] = { ...c2[idx], dataIndex: canon };
                        const ds = (t.dataSource ?? []).map((row) => {
                          const copy: Record<string, unknown> = { ...row };
                          const val = copy[oldIdx];
                          delete copy[oldIdx];
                          copy[canon] = val !== undefined && val !== null ? val : '';
                          return copy as TemplateTableRow;
                        });
                        return { ...t, columns: c2, dataSource: ds };
                      });
                      setTableColBindPickerIdx(null);
                    }}
                  >
                    <Text style={[styles.bindPickerRowText, on && styles.bindPickerRowTextOn]}>{opt.label}</Text>
                    {on ? <Ionicons name="checkmark-circle" size={20} color="#204dff" /> : null}
                  </Pressable>
                );
              })}
            </ScrollView>
            <Pressable style={styles.bindPickerClose} onPress={() => setTableColBindPickerIdx(null)}>
              <Text style={styles.bindPickerCloseText}>关闭</Text>
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  ) : null;

  const previewModal =
    editorDoc && previewOpen ? (
      <Modal visible transparent animationType="fade" onRequestClose={() => setPreviewOpen(false)}>
        <View style={styles.previewWrap}>
          <View style={styles.previewBar}>
            <Text style={styles.previewTitle}>预览（示例数据）</Text>
            <Pressable onPress={() => setPreviewOpen(false)} hitSlop={12}>
              <Ionicons name="close" size={26} color="#fff" />
            </Pressable>
          </View>
          <ScrollView contentContainerStyle={styles.previewScroll}>
            <PrintTemplateCanvas
              paperWidthPx={paperPx.widthPx}
              paperHeightPx={paperPx.heightPx}
              scale={Math.min((screenW - 24) / paperPx.widthPx, 1)}
              components={editorDoc.components}
              preview={previewSample as PreviewRecord}
              selectedId={null}
              onSelect={() => {}}
              onMove={() => {}}
              readOnly
            />
          </ScrollView>
        </View>
      </Modal>
    ) : null;

  return (
    <PageScaffold
      omitOuterScrollView
      dense={embedInStackHeader}
      title={embedInStackHeader ? undefined : '打印模板'}
      description={
        embedInStackHeader
          ? undefined
          : '与桌面「打印模板编辑器」相同的 JSON：纸张规格 + 画布组件（输入框 / 标签 / 表格 / 图片）。本机保存；可选同步服务端 getPrintTemplateFiles / getTemplateConfig。'
      }
    >
      {editorDoc ? editorView : listView}

      <Modal visible={importOpen} transparent animationType="slide" onRequestClose={() => setImportOpen(false)}>
        <KeyboardAvoidingView style={styles.mask} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <Pressable style={styles.maskBackdrop} onPress={() => setImportOpen(false)} />
          <View style={styles.importSheet}>
            <Text style={styles.modalTitle}>粘贴模板 JSON</Text>
            <TextInput
              style={styles.importArea}
              multiline
              value={importText}
              onChangeText={setImportText}
              placeholder={'{ "name": "...", "paperSize": "a4", "components": [] }'}
              placeholderTextColor="#94a3b8"
            />
            <View style={styles.modalRow}>
              <Pressable style={styles.cancelShadow} onPress={() => setImportOpen(false)}>
                <Text style={styles.cancelShadowText}>取消</Text>
              </Pressable>
              <Pressable style={styles.confirmSolid} onPress={confirmImportJson}>
                <Text style={styles.confirmSolidText}>导入并编辑</Text>
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <Modal visible={exportOpen} transparent animationType="slide" onRequestClose={() => setExportOpen(false)}>
        <KeyboardAvoidingView style={styles.mask} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <Pressable style={styles.maskBackdrop} onPress={() => setExportOpen(false)} />
          <View style={styles.importSheet}>
            <Text style={styles.modalTitle}>导出模板</Text>
            <TextInput
              style={styles.importArea}
              multiline
              editable={false}
              selectTextOnFocus
              value={editorDoc ? JSON.stringify(editorDoc, null, 2) : ''}
            />
            <View style={styles.modalRow}>
              <Pressable style={styles.cancelShadow} onPress={() => setExportOpen(false)}>
                <Text style={styles.cancelShadowText}>关闭</Text>
              </Pressable>
              <Pressable style={styles.confirmSolid} onPress={() => void exportCurrentToDevice()}>
                <Text style={styles.confirmSolidText}>导出 JSON</Text>
              </Pressable>
            </View>
            <View style={styles.modalRowTight}>
              <Pressable style={styles.confirmSolidAlt} onPress={() => void exportCurrentPdf()}>
                <Text style={styles.confirmSolidText}>导出 PDF</Text>
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {previewModal}
    </PageScaffold>
  );
}

function DimsRow(props: {
  width: string;
  height: string;
  fontSize: string;
  onWidth: (t: string) => void;
  onHeight: (t: string) => void;
  onFontSize: (t: string) => void;
}) {
  return (
    <View style={styles.dimsRow}>
      <View style={styles.dimsCell}>
        <Text style={styles.dimsLab}>宽</Text>
        <TextInput
          style={styles.dimsIn}
          keyboardType="decimal-pad"
          value={props.width}
          onChangeText={props.onWidth}
          placeholderTextColor="#94a3b8"
        />
      </View>
      <View style={styles.dimsCell}>
        <Text style={styles.dimsLab}>高</Text>
        <TextInput
          style={styles.dimsIn}
          keyboardType="decimal-pad"
          value={props.height}
          onChangeText={props.onHeight}
          placeholderTextColor="#94a3b8"
        />
      </View>
      <View style={styles.dimsCell}>
        <Text style={styles.dimsLab}>字号</Text>
        <TextInput
          style={styles.dimsIn}
          keyboardType="decimal-pad"
          value={props.fontSize}
          onChangeText={props.onFontSize}
          placeholderTextColor="#94a3b8"
        />
      </View>
    </View>
  );
}

function parseCoordInput(t: string): number {
  const v = parseFloat(String(t).trim().replace(/,/g, ''));
  return Number.isFinite(v) ? v : 0;
}

function formatExportTimestamp(date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}_${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
}

function Field(props: {
  label: string;
  value: string;
  onChange: (t: string) => void;
  keyboardType?: ComponentProps<typeof TextInput>['keyboardType'];
}) {
  return (
    <>
      <Text style={styles.fieldLab}>{props.label}</Text>
      <TextInput
        style={styles.fieldIn}
        value={props.value}
        onChangeText={props.onChange}
        keyboardType={props.keyboardType}
        placeholderTextColor="#94a3b8"
      />
    </>
  );
}

const styles = StyleSheet.create({
  screenFill: {
    flex: 1,
    minHeight: 0,
  },
  tableScroll: {
    flex: 1,
    minHeight: 0,
  },
  listPad: {
    paddingBottom: 24,
    paddingHorizontal: 4,
    gap: 8,
  },
  listGrow: {
    flexGrow: 1,
  },
  listToolbar: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 10,
  },
  tbPrimary: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#204dff',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
  },
  tbPrimaryText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  tbGhost: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(32,77,255,0.35)',
    backgroundColor: '#fff',
  },
  tbGhostText: { color: '#204dff', fontWeight: '600', fontSize: 13 },
  tbDisabled: { opacity: 0.55 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 10 },
  hint: { fontSize: 14, color: '#64748b' },
  rowCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#e8ecf4',
  },
  rowTitle: { fontSize: 16, fontWeight: '700', color: '#102248' },
  rowSub: { marginTop: 4, fontSize: 12, color: '#64748b' },
  empty: { alignItems: 'center', paddingHorizontal: 20, paddingVertical: 48, gap: 8 },
  emptyTitle: { fontSize: 16, fontWeight: '700', color: '#475569' },
  emptySub: { fontSize: 13, color: '#94a3b8', textAlign: 'center', lineHeight: 20 },

  editorHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 4,
    flexShrink: 0,
  },
  iconBtn: {
    width: 32,
    height: 32,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 8,
    backgroundColor: '#fff',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#e8ecf4',
  },
  nameInput: {
    flex: 1,
    minWidth: 0,
    height: 38,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#dbe1ec',
    paddingHorizontal: 10,
    paddingVertical: 0,
    fontSize: 14,
    lineHeight: 18,
    fontWeight: '700',
    color: '#102248',
    backgroundColor: '#fafbfd',
    textAlignVertical: 'center',
    includeFontPadding: false,
  },
  nameInputEmbed: {
    marginLeft: 0,
  },
  saveChip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: '#204dff',
  },
  saveChipText: { color: '#fff', fontWeight: '700', fontSize: 13 },

  paperRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 5,
    marginBottom: 4,
    flexShrink: 0,
  },
  chip: {
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 8,
    backgroundColor: '#fff',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#dbe1ec',
  },
  chipOn: {
    borderColor: '#204dff',
    backgroundColor: 'rgba(32,77,255,0.08)',
  },
  chipText: { fontSize: 12, fontWeight: '600', color: '#475569' },
  chipTextOn: { color: '#204dff' },

  editorWorkspace: {
    flex: 1,
    minHeight: 0,
  },
  chromeCompact: {
    flexShrink: 0,
    gap: 2,
    marginBottom: 4,
  },
  hintMicro: {
    fontSize: 11,
    color: '#94a3b8',
    lineHeight: 14,
    paddingHorizontal: 2,
  },
  paletteScroll: {
    flexGrow: 0,
    flexShrink: 0,
    height: 38,
  },
  paletteRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 2,
    paddingVertical: 2,
    flexGrow: 0,
  },
  palBtn: {
    height: 34,
    paddingHorizontal: 11,
    borderRadius: 8,
    backgroundColor: '#fff',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#e8ecf4',
    justifyContent: 'center',
    alignItems: 'center',
    alignSelf: 'center',
  },
  palBtnText: { fontSize: 12, fontWeight: '600', color: '#334155' },

  canvasHost: {
    flex: 1,
    minHeight: 0,
    justifyContent: 'center',
  },
  canvasPlate: {
    width: '100%',
    maxWidth: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#e8ecf4',
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#cbd5e1',
  },

  mask: { flex: 1, justifyContent: 'flex-end' },
  bindPickerOverlay: { flex: 1, justifyContent: 'center', paddingHorizontal: 14 },
  maskBackdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.35)' },
  propSheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: Platform.OS === 'ios' ? 28 : 16,
    maxHeight: '85%',
  },
  propTitle: { fontSize: 17, fontWeight: '700', color: '#102248', marginBottom: 10 },
  propSectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#334155',
    marginTop: 4,
    marginBottom: 6,
  },
  dimsRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 8,
  },
  dimsCell: { flex: 1, minWidth: 0 },
  dimsLab: { fontSize: 12, fontWeight: '600', color: '#475569', marginBottom: 3 },
  dimsIn: {
    borderWidth: 1,
    borderColor: '#dbe1ec',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: Platform.OS === 'ios' ? 8 : 6,
    fontSize: 14,
    color: '#102248',
    backgroundColor: '#fafbfd',
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 8,
    paddingVertical: 2,
  },
  bindTrigger: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: '#dbe1ec',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: Platform.OS === 'ios' ? 10 : 8,
    backgroundColor: '#fafbfd',
    marginBottom: 8,
  },
  bindTriggerText: { flex: 1, fontSize: 14, color: '#102248', fontWeight: '600', marginRight: 8 },
  tableColCard: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#e2e8f0',
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 10,
    marginBottom: 6,
    backgroundColor: '#fafbfd',
  },
  tableColOneLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  tableColTitleInputFlex: {
    flex: 1,
    minWidth: 72,
    height: 36,
    borderWidth: 1,
    borderColor: '#dbe1ec',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 0,
    fontSize: 13,
    color: '#102248',
    backgroundColor: '#fff',
    ...(Platform.OS === 'android' ? ({ textAlignVertical: 'center' } as const) : null),
  },
  tableColBindPressFlex: {
    flex: 1,
    minWidth: 88,
    height: 36,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
    borderWidth: 1,
    borderColor: '#dbe1ec',
    borderRadius: 8,
    backgroundColor: '#fff',
  },
  tableColBindText: {
    flex: 1,
    fontSize: 13,
    fontWeight: '600',
    color: '#102248',
    marginRight: 4,
  },
  tableColIconGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    flexShrink: 0,
  },
  tbIconDisabled: { opacity: 0.35 },
  addColBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: 'rgba(32,77,255,0.45)',
    marginBottom: 12,
    backgroundColor: 'rgba(32,77,255,0.04)',
  },
  addColBtnText: { fontSize: 14, fontWeight: '700', color: '#204dff' },
  bindPickerSheet: {
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 16,
    maxHeight: '80%',
  },
  bindPickerHint: { fontSize: 12, color: '#64748b', marginBottom: 12, lineHeight: 18 },
  bindPickerSection: {
    fontSize: 12,
    fontWeight: '700',
    color: '#64748b',
    marginTop: 10,
    marginBottom: 6,
  },
  bindPickerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 10,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#e8ecf4',
    marginBottom: 6,
    backgroundColor: '#fff',
  },
  bindPickerRowOn: {
    borderColor: '#204dff',
    backgroundColor: 'rgba(32,77,255,0.06)',
  },
  bindPickerRowText: { fontSize: 15, color: '#102248', flex: 1 },
  bindPickerRowTextOn: { fontWeight: '700', color: '#204dff' },
  bindPickerClose: {
    marginTop: 12,
    height: 44,
    borderRadius: 10,
    backgroundColor: '#f1f5f9',
    justifyContent: 'center',
    alignItems: 'center',
  },
  bindPickerCloseText: { fontWeight: '700', color: '#475569', fontSize: 15 },
  fieldLab: { fontSize: 13, fontWeight: '600', color: '#475569', marginTop: 8, marginBottom: 4 },
  fieldIn: {
    borderWidth: 1,
    borderColor: '#dbe1ec',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: Platform.OS === 'ios' ? 10 : 8,
    fontSize: 14,
    color: '#102248',
    backgroundColor: '#fafbfd',
  },
  miniChip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: '#f1f5f9',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#e2e8f0',
  },
  miniChipText: { fontSize: 11, fontWeight: '600', color: '#475569' },
  subLabel: { fontSize: 14, fontWeight: '600', color: '#334155' },
  fieldHint: { fontSize: 11, color: '#94a3b8', marginBottom: 8 },
  propActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#e8ecf4',
  },
  dangerBtn: {
    flex: 1,
    height: 44,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#fecaca',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#fff5f5',
  },
  dangerBtnText: { color: '#b91c1c', fontWeight: '700' },
  propOk: {
    flex: 1,
    height: 44,
    borderRadius: 10,
    backgroundColor: '#204dff',
    justifyContent: 'center',
    alignItems: 'center',
  },
  propOkText: { color: '#fff', fontWeight: '700', fontSize: 15 },

  previewWrap: {
    flex: 1,
    backgroundColor: '#0f172a',
    paddingTop: Platform.OS === 'ios' ? 48 : 28,
  },
  previewBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  previewTitle: { color: '#fff', fontSize: 16, fontWeight: '700' },
  previewScroll: {
    paddingHorizontal: 12,
    paddingBottom: 32,
    alignItems: 'center',
  },

  importSheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: Platform.OS === 'ios' ? 28 : 16,
    maxHeight: '88%',
  },
  modalTitle: { fontSize: 17, fontWeight: '700', color: '#102248', marginBottom: 10 },
  importArea: {
    minHeight: 180,
    maxHeight: 360,
    borderWidth: 1,
    borderColor: '#dbe1ec',
    borderRadius: 10,
    padding: 10,
    fontSize: 12,
    color: '#334155',
    backgroundColor: '#fafbfd',
    textAlignVertical: 'top',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  modalRow: { flexDirection: 'row', gap: 10, marginTop: 12 },
  modalRowTight: { marginTop: 10 },
  cancelShadow: {
    flex: 1,
    height: 44,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    justifyContent: 'center',
    alignItems: 'center',
  },
  cancelShadowText: { fontWeight: '700', color: '#475569' },
  confirmSolid: {
    flex: 1,
    height: 44,
    borderRadius: 10,
    backgroundColor: '#204dff',
    justifyContent: 'center',
    alignItems: 'center',
  },
  confirmSolidAlt: {
    height: 44,
    borderRadius: 10,
    backgroundColor: '#16a34a',
    justifyContent: 'center',
    alignItems: 'center',
  },
  confirmSolidText: { color: '#fff', fontWeight: '700' },
});

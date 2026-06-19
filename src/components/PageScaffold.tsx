import type { PropsWithChildren, ReactNode } from 'react';
import { Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

type Props = PropsWithChildren<{
  title?: string;
  description?: string;
  /** 标题行右侧（与桌面端「未发货订单」等按钮对齐） */
  headerRight?: ReactNode;
  /** 为 false 时禁止整页滚动（例如内嵌下拉列表需要独占纵向手势） */
  scrollEnabled?: boolean;
  /**
   * 为 true 时不使用外层 ScrollView，仅用 View 包裹（页内已有纵向 ScrollView 时使用）。
   * 避免安卓上双层纵向 ScrollView + TextInput 导致焦点丢失、键盘闪退。
   */
  omitOuterScrollView?: boolean;
  /** 嵌入原生 Stack 标题栏时收紧外边距，减少标题与内容之间的空白 */
  dense?: boolean;
}>;

export function PageScaffold({
  title,
  description,
  headerRight,
  children,
  scrollEnabled = true,
  omitOuterScrollView = false,
  dense = false,
}: Props) {
  const insets = useSafeAreaInsets();
  const showTitle = Boolean(title?.trim());
  const showDesc = Boolean(description?.trim());
  const showTitleRow = showTitle || headerRight != null;

  const contentMarginTop = dense ? 0 : showTitleRow || showDesc ? 16 : 8;
  // const topPadding = dense ? Math.max(insets.top, 4) : Math.max(insets.top, 8);
  const topPadding = 10;
  const bottomPadding = dense ? Math.max(insets.bottom, 8) : Math.max(insets.bottom, 14);

  const inner = (
    <>
      {showTitleRow ? (
        <View style={styles.titleRow}>
          {showTitle ? (
            <Text style={[styles.title, headerRight != null && styles.titleShrink]}>{title}</Text>
          ) : (
            <View style={styles.titleFlex} />
          )}
          {headerRight != null ? <View style={styles.headerRightWrap}>{headerRight}</View> : null}
        </View>
      ) : null}
      {showDesc ? <Text style={styles.description}>{description}</Text> : null}
      <View
        style={[
          styles.content,
          { marginTop: contentMarginTop },
          omitOuterScrollView && styles.contentFlex,
          dense && styles.contentDense,
        ]}
      >
        {children}
      </View>
    </>
  );

  if (omitOuterScrollView) {
    return (
      <View
        style={[
          styles.container,
          styles.containerFill,
          { paddingTop: topPadding, paddingBottom: bottomPadding },
          dense && styles.containerDense,
        ]}
      >
        {inner}
      </View>
    );
  }

  return (
    <ScrollView
      scrollEnabled={scrollEnabled}
      keyboardShouldPersistTaps="always"
      keyboardDismissMode="none"
      nestedScrollEnabled={Platform.OS === 'android'}
      contentContainerStyle={[
        styles.container,
        { paddingTop: topPadding, paddingBottom: bottomPadding },
        dense && styles.containerDense,
      ]}
    >
      {inner}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 8,
    backgroundColor: '#f3f5f9',
    minHeight: '100%',
  },
  containerDense: {
    paddingHorizontal: 8,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  titleFlex: {
    flex: 1,
  },
  titleShrink: {
    flex: 1,
    flexShrink: 1,
  },
  headerRightWrap: {
    flexShrink: 0,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: '#11203b',
  },
  description: {
    marginTop: 8,
    fontSize: 14,
    color: '#44506b',
    lineHeight: 20,
  },
  content: {
    gap: 12,
  },
  contentDense: {
    gap: 6,
  },
  /** omitOuterScrollView 时让页内 ScrollView 获得明确高度（flex 子项需 minHeight:0） */
  contentFlex: {
    flex: 1,
    minHeight: 0,
  },
  /** 与外层 ScrollView 的 content 等价铺满 Tab 屏，避免 omitOuterScrollView 时高度塌陷 */
  containerFill: {
    flex: 1,
  },
});

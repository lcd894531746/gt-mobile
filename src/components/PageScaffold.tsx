import type { PropsWithChildren, ReactNode } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

type Props = PropsWithChildren<{
  title?: string;
  description?: string;
  /** 标题行右侧（与桌面端「未发货订单」等按钮对齐） */
  headerRight?: ReactNode;
}>;

export function PageScaffold({ title, description, headerRight, children }: Props) {
  const showTitle = Boolean(title?.trim());
  const showDesc = Boolean(description?.trim());
  const showTitleRow = showTitle || headerRight != null;

  return (
    <ScrollView contentContainerStyle={styles.container}>
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
      <View style={[styles.content, { marginTop: showTitleRow || showDesc ? 16 : 8 }]}>{children}</View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingVertical: 14,
    paddingHorizontal: 8,
    backgroundColor: '#f3f5f9',
    minHeight: '100%',
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
});

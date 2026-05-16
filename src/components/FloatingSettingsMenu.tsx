import { Ionicons } from '@expo/vector-icons';
import { useCallback, useRef, useState } from 'react';
import {
  Dimensions,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

type Props = {
  onTemplate: () => void;
  onQuoteStatistics: () => void;
  onCustomer: () => void;
  onEmployee: () => void;
};

/** 右侧纵向居中悬浮设置：模板、报价统计、客户、员工等入口（桌面 Web 支持划入展开） */
export function FloatingSettingsMenu({
  onTemplate,
  onQuoteStatistics,
  onCustomer,
  onEmployee,
}: Props) {
  const insets = useSafeAreaInsets();
  const [expanded, setExpanded] = useState(false);
  const leaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearLeaveTimer = useCallback(() => {
    if (leaveTimer.current != null) {
      clearTimeout(leaveTimer.current);
      leaveTimer.current = null;
    }
  }, []);

  const scheduleCollapse = useCallback(() => {
    clearLeaveTimer();
    leaveTimer.current = setTimeout(() => setExpanded(false), 220);
  }, [clearLeaveTimer]);

  const openNow = useCallback(() => {
    clearLeaveTimer();
    setExpanded(true);
  }, [clearLeaveTimer]);

  const webHoverHandlers =
    Platform.OS === 'web'
      ? ({ onMouseEnter: openNow, onMouseLeave: scheduleCollapse } as Record<string, unknown>)
      : {};

  const winH = Dimensions.get('window').height;
  const topBarApprox = Math.max(insets.top, 8) + 36;
  const tabBarApprox = 52 + insets.bottom;
  const verticalCenter = topBarApprox + (winH - topBarApprox - tabBarApprox) / 2;

  const toggle = () => setExpanded((v) => !v);

  const goTemplate = () => {
    setExpanded(false);
    onTemplate();
  };

  const goQuoteStatistics = () => {
    setExpanded(false);
    onQuoteStatistics();
  };

  const goCustomer = () => {
    setExpanded(false);
    onCustomer();
  };

  const goEmployee = () => {
    setExpanded(false);
    onEmployee();
  };

  return (
    <>
      {expanded ? (
        <Pressable style={styles.backdrop} onPress={() => setExpanded(false)} accessibilityRole="button" />
      ) : null}

      <View
        style={[styles.anchor, { top: verticalCenter - 26 }]}
        pointerEvents="box-none"
        {...webHoverHandlers}
      >
        <View style={styles.row}>
          {expanded ? (
            <View style={styles.panel} accessibilityRole="menu">
              <Pressable
                style={({ pressed }) => [styles.menuRow, pressed && styles.menuRowPressed]}
                onPress={goTemplate}
                accessibilityRole="menuitem"
                accessibilityLabel="模板"
              >
                <Ionicons name="document-text-outline" size={18} color="#204dff" />
                <Text style={styles.menuRowText}>模板</Text>
              </Pressable>
              <Pressable
                style={({ pressed }) => [styles.menuRow, styles.menuRowBorderTop, pressed && styles.menuRowPressed]}
                onPress={goQuoteStatistics}
                accessibilityRole="menuitem"
                accessibilityLabel="报价统计"
              >
                <Ionicons name="bar-chart-outline" size={18} color="#204dff" />
                <Text style={styles.menuRowText}>报价统计</Text>
              </Pressable>
              <Pressable
                style={({ pressed }) => [styles.menuRow, styles.menuRowBorderTop, pressed && styles.menuRowPressed]}
                onPress={goCustomer}
                accessibilityRole="menuitem"
                accessibilityLabel="客户"
              >
                <Ionicons name="people-outline" size={18} color="#204dff" />
                <Text style={styles.menuRowText}>客户</Text>
              </Pressable>
              <Pressable
                style={({ pressed }) => [styles.menuRow, styles.menuRowBorderTop, pressed && styles.menuRowPressed]}
                onPress={goEmployee}
                accessibilityRole="menuitem"
                accessibilityLabel="员工"
              >
                <Ionicons name="id-card-outline" size={18} color="#204dff" />
                <Text style={styles.menuRowText}>员工</Text>
              </Pressable>
            </View>
          ) : null}

          <Pressable
            style={({ pressed }) => [styles.fab, pressed && styles.fabPressed]}
            onPress={toggle}
            accessibilityRole="button"
            accessibilityLabel="设置"
            hitSlop={6}
          >
            <Ionicons name="settings-outline" size={22} color="#fff" />
          </Pressable>
        </View>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(15, 23, 42, 0.12)',
    zIndex: 50,
  },
  anchor: {
    position: 'absolute',
    right: 10,
    zIndex: 60,
    alignItems: 'flex-end',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  panel: {
    backgroundColor: '#fff',
    borderRadius: 12,
    paddingVertical: 4,
    minWidth: 152,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#e2e8f0',
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  menuRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  menuRowBorderTop: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#eef2f7',
  },
  menuRowPressed: {
    backgroundColor: '#f1f5f9',
  },
  menuRowText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#102248',
  },
  fab: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: '#2f68ff',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 8,
  },
  fabPressed: {
    opacity: 0.92,
  },
});

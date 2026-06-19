import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  PanResponder,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../context/AuthContext';

type Props = {
  onTemplate: () => void;
  onQuoteStatistics: () => void;
  onCustomer: () => void;
  onEmployee: () => void;
};

const FAB_SIZE = 52;
const FAB_RADIUS = FAB_SIZE / 2;
const EDGE_MARGIN = 10;
const PANEL_WIDTH = 152;
const PANEL_GAP = 10;
const DRAG_THRESHOLD = 4;

export function FloatingSettingsMenu({
  onTemplate,
  onQuoteStatistics,
  onCustomer,
  onEmployee,
}: Props) {
  const { signOut } = useAuth();
  const insets = useSafeAreaInsets();
  const { width: winW, height: winH } = useWindowDimensions();
  const [expanded, setExpanded] = useState(false);
  const [position, setPosition] = useState<{ x: number; y: number } | null>(null);
  const leaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const positionRef = useRef({ x: 0, y: 0 });
  const dragStartRef = useRef({ x: 0, y: 0 });
  const draggedRef = useRef(false);

  const topInset = Math.max(insets.top, 8);
  const bottomInset = Math.max(insets.bottom, 8);
  const tabBarApprox = 56 + bottomInset;
  const maxX = Math.max(EDGE_MARGIN, winW - FAB_SIZE - EDGE_MARGIN);
  const maxY = Math.max(topInset, winH - tabBarApprox - FAB_SIZE - EDGE_MARGIN);
  const defaultX = maxX;
  const defaultY = Math.min(
    Math.max(topInset, topInset + (winH - topInset - tabBarApprox) / 2 - FAB_RADIUS),
    maxY,
  );

  const clampPosition = useCallback(
    (x: number, y: number) => ({
      x: Math.min(Math.max(EDGE_MARGIN, x), maxX),
      y: Math.min(Math.max(topInset, y), maxY),
    }),
    [maxX, maxY, topInset],
  );

  useEffect(() => {
    setPosition((prev) => {
      const next = prev == null ? clampPosition(defaultX, defaultY) : clampPosition(prev.x, prev.y);
      positionRef.current = next;
      return next;
    });
  }, [clampPosition, defaultX, defaultY]);

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

  const toggle = useCallback(() => {
    if (draggedRef.current) {
      draggedRef.current = false;
      return;
    }
    setExpanded((v) => !v);
  }, []);

  const closeAndRun = (cb: () => void) => {
    setExpanded(false);
    cb();
  };

  const confirmSignOut = () => {
    setExpanded(false);
    Alert.alert('退出登录', '确定要退出当前账号吗？', [
      { text: '取消', style: 'cancel' },
      { text: '退出', style: 'destructive', onPress: () => void signOut() },
    ]);
  };

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => false,
        onMoveShouldSetPanResponder: (_evt, gestureState) =>
          Math.abs(gestureState.dx) > DRAG_THRESHOLD || Math.abs(gestureState.dy) > DRAG_THRESHOLD,
        onPanResponderGrant: () => {
          clearLeaveTimer();
          setExpanded(false);
          draggedRef.current = false;
          dragStartRef.current = positionRef.current;
        },
        onPanResponderMove: (_evt, gestureState) => {
          draggedRef.current = true;
          const next = clampPosition(
            dragStartRef.current.x + gestureState.dx,
            dragStartRef.current.y + gestureState.dy,
          );
          positionRef.current = next;
          setPosition(next);
        },
        onPanResponderRelease: () => {
          setPosition(positionRef.current);
        },
        onPanResponderTerminate: () => {
          setPosition(positionRef.current);
        },
      }),
    [clampPosition, clearLeaveTimer],
  );

  const currentPosition = position ?? clampPosition(defaultX, defaultY);
  const openPanelToLeft = currentPosition.x + FAB_SIZE + PANEL_GAP + PANEL_WIDTH > winW - EDGE_MARGIN;
  const panelPositionStyle = openPanelToLeft
    ? { right: FAB_SIZE + PANEL_GAP, bottom: 0 }
    : { left: FAB_SIZE + PANEL_GAP, bottom: 0 };

  return (
    <>
      {expanded ? (
        <Pressable style={styles.backdrop} onPress={() => setExpanded(false)} accessibilityRole="button" />
      ) : null}

      <View
        style={[styles.anchor, { left: currentPosition.x, top: currentPosition.y }]}
        pointerEvents="box-none"
        {...webHoverHandlers}
      >
        <View style={styles.row}>
          {expanded ? (
            <View style={[styles.panel, panelPositionStyle]} accessibilityRole="menu">
              <Pressable
                style={({ pressed }) => [styles.menuRow, pressed && styles.menuRowPressed]}
                onPress={() => closeAndRun(onTemplate)}
                accessibilityRole="menuitem"
                accessibilityLabel="模板"
              >
                <Ionicons name="document-text-outline" size={18} color="#204dff" />
                <Text style={styles.menuRowText}>模板</Text>
              </Pressable>
              <Pressable
                style={({ pressed }) => [styles.menuRow, styles.menuRowBorderTop, pressed && styles.menuRowPressed]}
                onPress={() => closeAndRun(onQuoteStatistics)}
                accessibilityRole="menuitem"
                accessibilityLabel="报价统计"
              >
                <Ionicons name="bar-chart-outline" size={18} color="#204dff" />
                <Text style={styles.menuRowText}>报价统计</Text>
              </Pressable>
              <Pressable
                style={({ pressed }) => [styles.menuRow, styles.menuRowBorderTop, pressed && styles.menuRowPressed]}
                onPress={() => closeAndRun(onCustomer)}
                accessibilityRole="menuitem"
                accessibilityLabel="客户"
              >
                <Ionicons name="people-outline" size={18} color="#204dff" />
                <Text style={styles.menuRowText}>客户</Text>
              </Pressable>
              <Pressable
                style={({ pressed }) => [styles.menuRow, styles.menuRowBorderTop, pressed && styles.menuRowPressed]}
                onPress={() => closeAndRun(onEmployee)}
                accessibilityRole="menuitem"
                accessibilityLabel="员工"
              >
                <Ionicons name="id-card-outline" size={18} color="#204dff" />
                <Text style={styles.menuRowText}>员工</Text>
              </Pressable>
              <Pressable
                style={({ pressed }) => [styles.menuRow, styles.menuRowBorderTop, pressed && styles.menuRowPressed]}
                onPress={confirmSignOut}
                accessibilityRole="menuitem"
                accessibilityLabel="退出登录"
              >
                <Ionicons name="log-out-outline" size={18} color="#dc2626" />
                <Text style={[styles.menuRowText, styles.menuRowDanger]}>退出登录</Text>
              </Pressable>
            </View>
          ) : null}

          <View {...panResponder.panHandlers}>
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
    zIndex: 60,
  },
  row: {
    position: 'relative',
    minWidth: FAB_SIZE,
    minHeight: FAB_SIZE,
  },
  panel: {
    position: 'absolute',
    backgroundColor: '#fff',
    borderRadius: 12,
    paddingVertical: 4,
    minWidth: PANEL_WIDTH,
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
  menuRowDanger: {
    color: '#dc2626',
  },
  fab: {
    width: FAB_SIZE,
    height: FAB_SIZE,
    borderRadius: FAB_RADIUS,
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

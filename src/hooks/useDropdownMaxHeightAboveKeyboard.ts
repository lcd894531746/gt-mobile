import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { RefObject } from 'react';
import { Keyboard, Platform, View } from 'react-native';

/**
 * 键盘从下往上、下拉从输入框往下伸时容易在垂直方向“撞车”。
 * 用键盘顶边的 screenY 与客户区的 measureInWindow 底边，算出下拉列表可用的 maxHeight。
 */
export function useDropdownMaxHeightAboveKeyboard(
  defaultMax = 260,
  minMax = 96,
  gap = 10,
): {
  wrapRef: RefObject<View | null>;
  measureAnchor: () => void;
  maxHeight: number;
} {
  const wrapRef = useRef<View | null>(null);
  const [anchorBottom, setAnchorBottom] = useState(0);
  const [keyboardTopY, setKeyboardTopY] = useState<number | null>(null);

  const measureAnchor = useCallback(() => {
    wrapRef.current?.measureInWindow((_x, y, _w, h) => {
      setAnchorBottom(y + h);
    });
  }, []);

  useEffect(() => {
    const showEvt = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvt = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const showSub = Keyboard.addListener(showEvt, (e) => {
      setKeyboardTopY(e.endCoordinates.screenY);
      requestAnimationFrame(measureAnchor);
    });
    const hideSub = Keyboard.addListener(hideEvt, () => {
      setKeyboardTopY(null);
      requestAnimationFrame(measureAnchor);
    });
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, [measureAnchor]);

  const maxHeight = useMemo(() => {
    if (keyboardTopY == null || anchorBottom <= 0) return defaultMax;
    const raw = keyboardTopY - anchorBottom - gap;
    return Math.max(minMax, Math.min(defaultMax, raw));
  }, [keyboardTopY, anchorBottom, defaultMax, minMax, gap]);

  return { wrapRef, measureAnchor, maxHeight };
}

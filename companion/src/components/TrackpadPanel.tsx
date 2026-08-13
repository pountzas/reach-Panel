import { useRef } from 'react';
import {
  GestureResponderEvent,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import type { CompanionClient } from '../companionClient';
import {
  DOUBLE_TAP_MS,
  TAP_SLOP_PX,
  isTapGesture,
} from '../trackpadTap';

type Props = {
  client: CompanionClient;
  enabled: boolean;
};

export function TrackpadPanel({ client, enabled }: Props) {
  const last = useRef<{ x: number; y: number } | null>(null);
  const pressStart = useRef<{ x: number; y: number; t: number } | null>(null);
  const travelPx = useRef(0);
  const lastTapAt = useRef(0);
  const pendingClickTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearPendingClick = () => {
    if (pendingClickTimer.current !== null) {
      clearTimeout(pendingClickTimer.current);
      pendingClickTimer.current = null;
    }
  };

  const fireLeftClick = () => {
    void client.send('mouse.click', { button: 'left' });
  };

  const fireDoubleClick = () => {
    void client.send('mouse.doubleClick', {});
  };

  const handleTap = () => {
    const now = Date.now();
    if (lastTapAt.current > 0 && now - lastTapAt.current <= DOUBLE_TAP_MS) {
      clearPendingClick();
      lastTapAt.current = 0;
      fireDoubleClick();
      return;
    }
    lastTapAt.current = now;
    clearPendingClick();
    pendingClickTimer.current = setTimeout(() => {
      pendingClickTimer.current = null;
      lastTapAt.current = 0;
      fireLeftClick();
    }, DOUBLE_TAP_MS);
  };

  const onTouchStart = (e: GestureResponderEvent) => {
    const t = e.nativeEvent;
    last.current = { x: t.pageX, y: t.pageY };
    pressStart.current = { x: t.pageX, y: t.pageY, t: Date.now() };
    travelPx.current = 0;
  };

  const onTouchMove = (e: GestureResponderEvent) => {
    if (!enabled || !last.current) {
      return;
    }
    const t = e.nativeEvent;
    const dx = t.pageX - last.current.x;
    const dy = t.pageY - last.current.y;
    travelPx.current += Math.hypot(dx, dy);
    // Dragging past tap slop cancels a waiting single-click from a prior tap.
    if (travelPx.current > TAP_SLOP_PX) {
      clearPendingClick();
      lastTapAt.current = 0;
    }
    const rdx = Math.round(dx);
    const rdy = Math.round(dy);
    last.current = { x: t.pageX, y: t.pageY };
    if (rdx === 0 && rdy === 0) {
      return;
    }
    client.sendFireAndForget('mouse.moveRel', { dx: rdx, dy: rdy });
  };

  const onTouchEnd = () => {
    const start = pressStart.current;
    const duration = start ? Date.now() - start.t : Number.POSITIVE_INFINITY;
    const wasTap = isTapGesture(travelPx.current, duration);

    last.current = null;
    pressStart.current = null;
    travelPx.current = 0;

    if (wasTap && enabled) {
      handleTap();
    }
  };

  return (
    <View style={styles.wrap}>
      <View
        style={[styles.pad, !enabled && styles.padDisabled]}
        onStartShouldSetResponder={() => enabled}
        onMoveShouldSetResponder={() => enabled}
        onResponderGrant={onTouchStart}
        onResponderMove={onTouchMove}
        onResponderRelease={onTouchEnd}
        onResponderTerminate={onTouchEnd}
        accessibilityLabel="Trackpad"
      >
        <Text style={styles.hint}>Drag to move · tap to click</Text>
      </View>
      <View style={styles.buttons}>
        <PadButton
          label="Left click"
          enabled={enabled}
          onPress={() => void client.send('mouse.click', { button: 'left' })}
        />
        <PadButton
          label="Right click"
          enabled={enabled}
          onPress={() => void client.send('mouse.click', { button: 'right' })}
        />
        <PadButton
          label="Scroll ↑"
          enabled={enabled}
          onPress={() =>
            void client.send('mouse.scroll', { delta: 3, horizontal: false })
          }
        />
        <PadButton
          label="Scroll ↓"
          enabled={enabled}
          onPress={() =>
            void client.send('mouse.scroll', { delta: -3, horizontal: false })
          }
        />
      </View>
    </View>
  );
}

function PadButton({
  label,
  onPress,
  enabled,
}: {
  label: string;
  onPress: () => void;
  enabled: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={!enabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        !enabled && styles.buttonDisabled,
        pressed && enabled && styles.buttonPressed,
      ]}
    >
      <Text style={styles.buttonLabel}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    gap: 12,
    padding: 8,
  },
  pad: {
    flex: 1,
    minHeight: 220,
    backgroundColor: '#1c2433',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#3a465c',
    alignItems: 'center',
    justifyContent: 'center',
  },
  padDisabled: {
    opacity: 0.45,
  },
  hint: {
    color: '#9aa7bd',
    fontSize: 18,
  },
  buttons: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  button: {
    flexGrow: 1,
    minWidth: '45%',
    minHeight: 56,
    backgroundColor: '#2a3140',
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  buttonPressed: {
    backgroundColor: '#3d4a63',
  },
  buttonDisabled: {
    opacity: 0.45,
  },
  buttonLabel: {
    color: '#f2f4f8',
    fontSize: 16,
    fontWeight: '600',
  },
});

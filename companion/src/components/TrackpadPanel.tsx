import { useRef } from 'react';
import {
  GestureResponderEvent,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import type { CompanionClient } from '../companionClient';

type Props = {
  client: CompanionClient;
  enabled: boolean;
};

export function TrackpadPanel({ client, enabled }: Props) {
  const last = useRef<{ x: number; y: number } | null>(null);

  const onTouchStart = (e: GestureResponderEvent) => {
    const t = e.nativeEvent;
    last.current = { x: t.pageX, y: t.pageY };
  };

  const onTouchMove = (e: GestureResponderEvent) => {
    if (!enabled || !last.current) {
      return;
    }
    const t = e.nativeEvent;
    const dx = Math.round(t.pageX - last.current.x);
    const dy = Math.round(t.pageY - last.current.y);
    last.current = { x: t.pageX, y: t.pageY };
    if (dx === 0 && dy === 0) {
      return;
    }
    client.sendFireAndForget('mouse.moveRel', { dx, dy });
  };

  const onTouchEnd = () => {
    last.current = null;
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
        <Text style={styles.hint}>Drag to move pointer</Text>
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

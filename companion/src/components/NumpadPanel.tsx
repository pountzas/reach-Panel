import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { CompanionClient } from '../companionClient';

type Props = {
  client: CompanionClient;
  enabled: boolean;
};

const KEYS: string[][] = [
  ['7', '8', '9'],
  ['4', '5', '6'],
  ['1', '2', '3'],
  ['0', '.', '⌫'],
];

export function NumpadPanel({ client, enabled }: Props) {
  const onKey = (label: string) => {
    if (!enabled) {
      return;
    }
    if (label === '⌫') {
      void client.send('key.press', { key: 'backspace', modifiers: [] });
      return;
    }
    void client.send('text.type', { text: label });
  };

  return (
    <View style={styles.wrap}>
      {KEYS.map((row) => (
        <View key={row.join('-')} style={styles.row}>
          {row.map((key) => (
            <Pressable
              key={key}
              accessibilityRole="button"
              accessibilityLabel={key === '⌫' ? 'Backspace' : key}
              disabled={!enabled}
              onPress={() => onKey(key)}
              style={({ pressed }) => [
                styles.key,
                !enabled && styles.keyDisabled,
                pressed && enabled && styles.keyPressed,
              ]}
            >
              <Text style={styles.label}>{key}</Text>
            </Pressable>
          ))}
        </View>
      ))}
      <Pressable
        accessibilityRole="button"
        disabled={!enabled}
        onPress={() => {
          if (enabled) {
            void client.send('key.press', { key: 'enter', modifiers: [] });
          }
        }}
        style={({ pressed }) => [
          styles.enter,
          !enabled && styles.keyDisabled,
          pressed && enabled && styles.keyPressed,
        ]}
      >
        <Text style={styles.label}>Enter</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    maxWidth: 420,
    alignSelf: 'center',
    width: '100%',
    gap: 8,
    padding: 16,
  },
  row: {
    flexDirection: 'row',
    gap: 8,
  },
  key: {
    flex: 1,
    minHeight: 64,
    backgroundColor: '#2a3140',
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  enter: {
    minHeight: 64,
    backgroundColor: '#2f4f78',
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  keyPressed: {
    backgroundColor: '#3d4a63',
  },
  keyDisabled: {
    opacity: 0.45,
  },
  label: {
    color: '#f2f4f8',
    fontSize: 22,
    fontWeight: '700',
  },
});

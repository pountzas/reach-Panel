import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { PredictionEntry } from '../types';

type Props = {
  suggestions: PredictionEntry[];
  enabled: boolean;
  predictionEnabled: boolean;
  onPick: (word: string) => void;
};

export function SuggestionsBar({
  suggestions,
  enabled,
  predictionEnabled,
  onPick,
}: Props) {
  if (!predictionEnabled) {
    return (
      <View style={styles.bar}>
        <Text style={styles.off}>Predictions off in synced profile</Text>
      </View>
    );
  }

  if (suggestions.length === 0) {
    return (
      <View style={styles.bar}>
        <Text style={styles.off}>Suggestions appear as you type</Text>
      </View>
    );
  }

  return (
    <ScrollView
      horizontal
      style={styles.bar}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
    >
      {suggestions.map((s) => (
        <Pressable
          key={`${s.word}-${s.frequency}`}
          accessibilityRole="button"
          disabled={!enabled}
          onPress={() => onPick(s.word)}
          style={({ pressed }) => [
            styles.chip,
            !enabled && styles.disabled,
            pressed && enabled && styles.pressed,
          ]}
        >
          <Text style={styles.chipText}>{s.word}</Text>
        </Pressable>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  bar: {
    maxHeight: 56,
    backgroundColor: '#1a2230',
    borderBottomWidth: 1,
    borderBottomColor: '#2a3140',
  },
  content: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    gap: 8,
    alignItems: 'center',
  },
  chip: {
    minHeight: 40,
    paddingHorizontal: 14,
    borderRadius: 20,
    backgroundColor: '#2a3140',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: {
    backgroundColor: '#2f4f78',
  },
  disabled: {
    opacity: 0.45,
  },
  chipText: {
    color: '#f2f4f8',
    fontSize: 16,
    fontWeight: '600',
  },
  off: {
    color: '#6b7585',
    fontSize: 13,
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
});

import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { CompanionClient } from '../companionClient';
import { speakOnTablet } from '../tts';
import type { Phrase } from '../types';

type Props = {
  client: CompanionClient;
  phrases: Phrase[];
  language: string;
  enabled: boolean;
  emergencyOnly?: boolean;
};

export function PhrasesPanel({
  client,
  phrases,
  language,
  enabled,
  emergencyOnly = false,
}: Props) {
  const list = emergencyOnly
    ? phrases.filter((p) => p.is_emergency)
    : phrases.filter((p) => !p.is_emergency);

  const favorites = list.filter((p) => p.is_favorite);
  const others = list.filter((p) => !p.is_favorite);
  const ordered = [...favorites, ...others];

  const runPhrase = async (phrase: Phrase, mode: 'type' | 'speak' | 'both') => {
    if (!enabled) {
      return;
    }
    if (mode === 'type' || mode === 'both') {
      await client.send('phrase.type', { text: phrase.text });
    }
    if (mode === 'speak' || mode === 'both') {
      // Host TTS stays off for companion flows — Speak is tablet-local.
      speakOnTablet(phrase.text, language);
    }
  };

  if (ordered.length === 0) {
    return (
      <View style={styles.empty}>
        <Text style={styles.emptyText}>
          {emergencyOnly ? 'No emergency phrases synced.' : 'No phrases synced yet.'}
        </Text>
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.wrap}>
      {emergencyOnly && (
        <Text style={styles.banner}>Emergency — speak uses this tablet</Text>
      )}
      {ordered.map((phrase) => (
        <View
          key={phrase.id}
          style={[styles.card, phrase.is_emergency && styles.emergencyCard]}
        >
          <Text style={styles.text}>{phrase.text}</Text>
          <View style={styles.actions}>
            <ActionBtn
              label="Type"
              enabled={enabled}
              onPress={() => void runPhrase(phrase, 'type')}
            />
            <ActionBtn
              label="Speak"
              enabled={enabled}
              onPress={() => void runPhrase(phrase, 'speak')}
            />
            <ActionBtn
              label="Both"
              enabled={enabled}
              onPress={() => void runPhrase(phrase, 'both')}
            />
          </View>
        </View>
      ))}
    </ScrollView>
  );
}

function ActionBtn({
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
        styles.btn,
        !enabled && styles.btnDisabled,
        pressed && enabled && styles.btnPressed,
      ]}
    >
      <Text style={styles.btnLabel}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: {
    padding: 12,
    gap: 10,
  },
  banner: {
    color: '#ffb4b4',
    fontWeight: '700',
    fontSize: 15,
    marginBottom: 4,
  },
  card: {
    backgroundColor: '#1c2433',
    borderRadius: 12,
    padding: 12,
    gap: 10,
  },
  emergencyCard: {
    borderWidth: 1,
    borderColor: '#b45353',
    backgroundColor: '#2a1c1c',
  },
  text: {
    color: '#f2f4f8',
    fontSize: 18,
    fontWeight: '600',
  },
  actions: {
    flexDirection: 'row',
    gap: 8,
  },
  btn: {
    flex: 1,
    minHeight: 48,
    borderRadius: 10,
    backgroundColor: '#2a3140',
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnPressed: {
    backgroundColor: '#3d4a63',
  },
  btnDisabled: {
    opacity: 0.45,
  },
  btnLabel: {
    color: '#f2f4f8',
    fontWeight: '700',
    fontSize: 15,
  },
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  emptyText: {
    color: '#9aa7bd',
    fontSize: 16,
  },
});

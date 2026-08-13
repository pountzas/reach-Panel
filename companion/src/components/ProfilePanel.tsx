import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { ProfileSnapshot } from '../types';

type Props = {
  snapshot: ProfileSnapshot | null;
  loading: boolean;
  error: string | null;
  onRefresh: () => void;
};

function flag(value: unknown): string {
  if (typeof value === 'boolean') {
    return value ? 'On' : 'Off';
  }
  if (value == null) {
    return '—';
  }
  return String(value);
}

export function ProfilePanel({ snapshot, loading, error, onRefresh }: Props) {
  const settings = snapshot?.settings ?? {};

  return (
    <ScrollView contentContainerStyle={styles.wrap}>
      <View style={styles.headerRow}>
        <Text style={styles.title}>Profile sync</Text>
        <Pressable
          accessibilityRole="button"
          onPress={onRefresh}
          style={({ pressed }) => [styles.refresh, pressed && styles.pressed]}
        >
          <Text style={styles.refreshText}>{loading ? '…' : 'Refresh'}</Text>
        </Pressable>
      </View>

      {error && <Text style={styles.error}>{error}</Text>}

      {!snapshot ? (
        <Text style={styles.muted}>Waiting for host snapshot…</Text>
      ) : (
        <>
          <Row label="Profile" value={snapshot.profile.name} />
          <Row label="Profile id" value={snapshot.profile.id} />
          <Row
            label="Typing language"
            value={flag(settings.typingLanguage ?? 'en')}
          />
          <Row
            label="Predictions"
            value={flag(settings.predictionEnabled)}
          />
          <Row label="Phrases section" value={flag(settings.phrasesVisible)} />
          <Row
            label="Quick actions"
            value={flag(settings.quickActionsVisible)}
          />
          <Row label="Mouse / trackpad" value={flag(settings.mouseVisible)} />
          <Row label="Phrases synced" value={String(snapshot.phrases.length)} />
          <Row
            label="Quick actions synced"
            value={String(snapshot.quickActions.length)}
          />
          <Text style={styles.note}>
            API keys never sync. Speak uses this tablet while connected.
          </Text>
        </>
      )}
    </ScrollView>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.value}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    padding: 16,
    gap: 10,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  title: {
    color: '#f2f4f8',
    fontSize: 20,
    fontWeight: '700',
  },
  refresh: {
    backgroundColor: '#2a3140',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  pressed: {
    backgroundColor: '#3d4a63',
  },
  refreshText: {
    color: '#f2f4f8',
    fontWeight: '600',
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
    backgroundColor: '#1c2433',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  label: {
    color: '#9aa7bd',
    fontSize: 15,
  },
  value: {
    color: '#f2f4f8',
    fontSize: 15,
    fontWeight: '600',
    flexShrink: 1,
    textAlign: 'right',
  },
  muted: {
    color: '#9aa7bd',
    fontSize: 16,
  },
  error: {
    color: '#ff8f8f',
    fontSize: 14,
  },
  note: {
    color: '#6b7585',
    fontSize: 13,
    marginTop: 8,
    lineHeight: 18,
  },
});

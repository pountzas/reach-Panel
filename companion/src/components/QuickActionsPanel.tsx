import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { CompanionClient } from '../companionClient';
import type { QuickAction } from '../types';

type Props = {
  client: CompanionClient;
  actions: QuickAction[];
  enabled: boolean;
};

export function QuickActionsPanel({ client, actions, enabled }: Props) {
  const sorted = [...actions].sort((a, b) => a.sort_order - b.sort_order);

  const launch = (action: QuickAction) => {
    if (!enabled) {
      return;
    }
    void client.send('qa.launch', {
      actionType: action.action_type,
      target: action.target,
    });
  };

  if (sorted.length === 0) {
    return (
      <View style={styles.empty}>
        <Text style={styles.emptyText}>No quick actions synced.</Text>
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.wrap}>
      {sorted.map((action) => (
        <Pressable
          key={action.id}
          accessibilityRole="button"
          accessibilityLabel={action.label}
          disabled={!enabled}
          onPress={() => launch(action)}
          style={({ pressed }) => [
            styles.card,
            !enabled && styles.disabled,
            pressed && enabled && styles.pressed,
          ]}
        >
          <Text style={styles.label}>{action.label}</Text>
          <Text style={styles.meta}>
            {action.action_type} · {action.target}
          </Text>
        </Pressable>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  wrap: {
    padding: 12,
    gap: 10,
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  card: {
    minWidth: '30%',
    flexGrow: 1,
    backgroundColor: '#1c2433',
    borderRadius: 12,
    padding: 16,
    minHeight: 72,
    justifyContent: 'center',
  },
  pressed: {
    backgroundColor: '#2f4f78',
  },
  disabled: {
    opacity: 0.45,
  },
  label: {
    color: '#f2f4f8',
    fontSize: 17,
    fontWeight: '700',
  },
  meta: {
    color: '#9aa7bd',
    fontSize: 12,
    marginTop: 4,
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

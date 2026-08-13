import { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { CompanionClient, ConnectionStatus } from '../companionClient';
import {
  CollapsedFab,
  type ShellTab,
} from '../components/CollapsedFab';
import { DictationPanel } from '../components/DictationPanel';
import { KeyboardPanel } from '../components/KeyboardPanel';
import { NumpadPanel } from '../components/NumpadPanel';
import { ProfilePanel } from '../components/ProfilePanel';
import { ReconnectingBanner } from '../components/ReconnectingBanner';
import { SuggestionsBar } from '../components/SuggestionsBar';
import { TrackpadPanel } from '../components/TrackpadPanel';
import { UsbChecklist } from '../components/UsbChecklist';
import { useProfileSnapshot } from '../hooks/useProfileSnapshot';
import type { PredictionEntry } from '../types';

type Props = {
  client: CompanionClient;
  status: ConnectionStatus;
  statusDetail?: string;
  onForget: () => void;
};

export function ConnectedScreen({
  client,
  status,
  statusDetail,
  onForget,
}: Props) {
  const [tab, setTab] = useState<ShellTab>('keyboard');
  const [fabOpen, setFabOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [prefix, setPrefix] = useState('');
  const [suggestions, setSuggestions] = useState<PredictionEntry[]>([]);

  const { snapshot, error, loading, refresh, language, profileId } =
    useProfileSnapshot(client, status);

  const enabled = status === 'connected';
  const predictionEnabled = Boolean(snapshot?.settings.predictionEnabled);

  const queryPredictions = useCallback(
    async (nextPrefix: string) => {
      setPrefix(nextPrefix);
      if (!predictionEnabled || !enabled || nextPrefix.length === 0) {
        setSuggestions([]);
        return;
      }
      try {
        const reply = await client.send('predict.query', {
          profileId,
          prefix: nextPrefix,
          language,
        });
        if (reply.type === 'predict.suggestions') {
          const list = reply.payload?.suggestions;
          setSuggestions(Array.isArray(list) ? (list as PredictionEntry[]) : []);
        }
      } catch {
        setSuggestions([]);
      }
    },
    [client, enabled, language, predictionEnabled, profileId],
  );

  const onTypedChar = (char: string) => {
    if (/\s/.test(char)) {
      void queryPredictions('');
      return;
    }
    void queryPredictions(prefix + char);
  };

  const onSpecialKey = (key: string) => {
    switch (key) {
      case 'space':
      case 'enter':
        void queryPredictions('');
        break;
      case 'backspace':
        void queryPredictions(prefix.slice(0, -1));
        break;
      default:
        break;
    }
  };

  const onPickSuggestion = async (word: string) => {
    if (!enabled) {
      return;
    }
    const remainder = word.startsWith(prefix) ? word.slice(prefix.length) : word;
    if (remainder.length > 0) {
      await client.send('text.type', { text: remainder });
    }
    await client.send('text.type', { text: ' ' });
    void client.send('predict.record', {
      profileId,
      word,
      language,
    });
    setPrefix('');
    setSuggestions([]);
  };

  const showSuggestions =
    tab === 'keyboard' && (predictionEnabled || suggestions.length > 0);

  return (
    <View style={styles.container}>
      <ReconnectingBanner status={status} detail={statusDetail} />
      <View style={styles.header}>
        <View>
          <Text style={styles.brand}>ReachPanel</Text>
          <Text style={styles.status}>
            {status === 'connected' ? 'Connected' : status}
            {snapshot ? ` · ${snapshot.profile.name}` : ''}
          </Text>
        </View>
        <View style={styles.headerActions}>
          <Pressable
            style={styles.headerBtn}
            onPress={() => setCollapsed((v) => !v)}
            accessibilityRole="button"
          >
            <Text style={styles.headerBtnText}>
              {collapsed ? 'Expand' : 'FAB'}
            </Text>
          </Pressable>
          <Pressable style={styles.headerBtn} onPress={onForget}>
            <Text style={styles.headerBtnText}>Unpair</Text>
          </Pressable>
        </View>
      </View>

      {!collapsed && (
        <View style={styles.tabs}>
          {(
            [
              ['keyboard', 'Keyboard'],
              ['trackpad', 'Trackpad'],
              ['numpad', 'Numpad'],
              ['dictation', 'Dictation'],
              ['profile', 'Profile'],
              ['usb', 'USB'],
            ] as const
          ).map(([id, label]) => (
            <TabButton
              key={id}
              label={label}
              active={tab === id}
              onPress={() => setTab(id)}
            />
          ))}
        </View>
      )}

      {showSuggestions && (
        <SuggestionsBar
          suggestions={suggestions}
          enabled={enabled}
          predictionEnabled={predictionEnabled}
          onPick={(word) => {
            void onPickSuggestion(word);
          }}
        />
      )}

      <View style={styles.body}>
        {renderTab({
          tab,
          client,
          enabled,
          snapshot,
          loading,
          error,
          refresh,
          language,
          onTypedChar,
          onSpecialKey,
        })}
      </View>

      {collapsed && (
        <CollapsedFab
          open={fabOpen}
          activeTab={tab}
          onToggle={() => setFabOpen((v) => !v)}
          onSelect={setTab}
        />
      )}
    </View>
  );
}

function renderTab(args: {
  tab: ShellTab;
  client: CompanionClient;
  enabled: boolean;
  snapshot: ReturnType<typeof useProfileSnapshot>['snapshot'];
  language: string;
  loading: boolean;
  error: string | null;
  refresh: () => void;
  onTypedChar: (char: string) => void;
  onSpecialKey: (key: string) => void;
}) {
  const {
    tab,
    client,
    enabled,
    snapshot,
    language,
    loading,
    error,
    refresh,
    onTypedChar,
    onSpecialKey,
  } = args;

  switch (tab) {
    case 'keyboard':
      return (
        <KeyboardPanel
          client={client}
          enabled={enabled}
          onTypedChar={onTypedChar}
          onSpecialKey={onSpecialKey}
        />
      );
    case 'trackpad':
      return <TrackpadPanel client={client} enabled={enabled} />;
    case 'numpad':
      return <NumpadPanel client={client} enabled={enabled} />;
    case 'dictation':
      return (
        <DictationPanel
          client={client}
          language={language}
          enabled={enabled}
        />
      );
    case 'profile':
      return (
        <ProfilePanel
          snapshot={snapshot}
          loading={loading}
          error={error}
          onRefresh={() => {
            void refresh();
          }}
        />
      );
    case 'usb':
      return (
        <ScrollView contentContainerStyle={{ padding: 16 }}>
          <UsbChecklist />
        </ScrollView>
      );
    default: {
      const _exhaustive: never = tab;
      return _exhaustive;
    }
  }
}

function TabButton({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={[styles.tab, active && styles.tabActive]}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
    >
      <Text style={[styles.tabLabel, active && styles.tabLabelActive]}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#121820',
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 8,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  brand: {
    color: '#7eb6ff',
    fontSize: 22,
    fontWeight: '800',
  },
  status: {
    color: '#b0bac8',
    fontSize: 14,
    marginTop: 2,
    textTransform: 'capitalize',
  },
  headerActions: {
    flexDirection: 'row',
    gap: 8,
  },
  headerBtn: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: '#2a3140',
  },
  headerBtnText: {
    color: '#f2f4f8',
    fontWeight: '600',
  },
  tabs: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  tab: {
    minWidth: 96,
    minHeight: 44,
    borderRadius: 12,
    backgroundColor: '#1c2433',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 10,
  },
  tabActive: {
    backgroundColor: '#2f4f78',
  },
  tabLabel: {
    color: '#b0bac8',
    fontSize: 15,
    fontWeight: '600',
  },
  tabLabelActive: {
    color: '#f2f4f8',
  },
  body: {
    flex: 1,
  },
});

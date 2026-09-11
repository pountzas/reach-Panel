import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import type { CompanionClient } from '../companionClient';
import { flagCodeForLanguage, languageDisplayCode } from '../lib/flagCodeForLanguage';
import type { InputMethod } from '../types';
import { CountryFlag } from './CountryFlag';

type Props = {
  visible: boolean;
  client: CompanionClient;
  activeHkl: number | null;
  onClose: () => void;
  onPicked: (method: InputMethod) => void;
};

function parseMethods(raw: unknown): InputMethod[] {
  if (!Array.isArray(raw)) {
    return [];
  }
  const out: InputMethod[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') {
      continue;
    }
    const row = item as Record<string, unknown>;
    const hkl = typeof row.hkl === 'number' ? row.hkl : Number(row.hkl);
    const langTag = typeof row.langTag === 'string' ? row.langTag : '';
    const displayName =
      typeof row.displayName === 'string' ? row.displayName : '';
    const layoutName =
      typeof row.layoutName === 'string' ? row.layoutName : '';
    const klid = typeof row.klid === 'string' ? row.klid : '';
    if (!Number.isFinite(hkl) || !langTag) {
      continue;
    }
    out.push({ hkl, langTag, displayName, layoutName, klid });
  }
  return out;
}

export function LanguagePickerModal({
  visible,
  client,
  activeHkl,
  onClose,
  onPicked,
}: Props) {
  const [methods, setMethods] = useState<InputMethod[]>([]);
  const [listActiveHkl, setListActiveHkl] = useState<number | null>(activeHkl);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [picking, setPicking] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const reply = await client.send('keyboard.languages', {});
      if (reply.type === 'error') {
        throw new Error(
          typeof reply.payload?.message === 'string'
            ? reply.payload.message
            : 'Could not load languages',
        );
      }
      if (reply.type !== 'keyboard.languages.ok') {
        throw new Error('Unexpected languages response');
      }
      const list = parseMethods(reply.payload?.methods);
      setMethods(list);
      const hkl =
        typeof reply.payload?.activeHkl === 'number'
          ? reply.payload.activeHkl
          : Number(reply.payload?.activeHkl);
      setListActiveHkl(Number.isFinite(hkl) ? hkl : activeHkl);
      if (list.length === 0) {
        setError(null);
      }
    } catch (e) {
      setMethods([]);
      setError(e instanceof Error ? e.message : 'Could not load languages');
    } finally {
      setLoading(false);
    }
  }, [activeHkl, client]);

  useEffect(() => {
    if (!visible) {
      return;
    }
    void load();
  }, [visible, load]);

  const pick = async (method: InputMethod) => {
    if (picking) {
      return;
    }
    setPicking(true);
    setError(null);
    try {
      const reply = await client.send('keyboard.setLanguage', {
        hkl: method.hkl,
        langTag: method.langTag,
      });
      if (reply.type === 'error') {
        throw new Error(
          typeof reply.payload?.message === 'string'
            ? reply.payload.message
            : 'Could not switch language',
        );
      }
      if (reply.type !== 'keyboard.setLanguage.ok') {
        throw new Error('Unexpected setLanguage response');
      }
      onPicked(method);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not switch language');
    } finally {
      setPicking(false);
    }
  };

  return (
    <Modal
      visible={visible}
      animationType="fade"
      transparent
      onRequestClose={onClose}
    >
      <View style={styles.backdrop}>
        <Pressable style={styles.dismiss} onPress={onClose} accessibilityRole="button" />
        <View style={styles.sheet} accessibilityLabel="Keyboard language">
          <View style={styles.header}>
            <Text style={styles.title}>Keyboard language</Text>
            <Pressable
              onPress={onClose}
              accessibilityRole="button"
              accessibilityLabel="Close"
              style={styles.closeBtn}
            >
              <Text style={styles.closeText}>Close</Text>
            </Pressable>
          </View>

          {loading ? (
            <View style={styles.centered}>
              <ActivityIndicator color="#7eb6ff" />
            </View>
          ) : (
            <FlatList
              data={methods}
              keyExtractor={(item) => `${item.hkl}-${item.klid}`}
              contentContainerStyle={
                methods.length === 0 ? styles.emptyContainer : styles.listContent
              }
              ListHeaderComponent={
                error ? <Text style={styles.error}>{error}</Text> : null
              }
              ListEmptyComponent={
                error ? null : (
                  <Text style={styles.empty}>No keyboard languages found</Text>
                )
              }
              renderItem={({ item }) => {
                const selected = item.hkl === listActiveHkl;
                return (
                  <Pressable
                    disabled={picking}
                    onPress={() => {
                      void pick(item);
                    }}
                    style={({ pressed }) => [
                      styles.row,
                      selected && styles.rowSelected,
                      pressed && styles.rowPressed,
                      picking && styles.rowDisabled,
                    ]}
                    accessibilityRole="button"
                    accessibilityState={{ selected }}
                    accessibilityLabel={`${item.displayName} ${item.layoutName}`}
                  >
                    <CountryFlag
                      country={flagCodeForLanguage(item.langTag)}
                      size={22}
                    />
                    <View style={styles.rowText}>
                      <Text style={styles.displayName} numberOfLines={1}>
                        {item.displayName}
                        <Text style={styles.layoutName}>
                          {' '}
                          ({item.layoutName})
                        </Text>
                      </Text>
                    </View>
                    <Text style={styles.code}>
                      {languageDisplayCode(item.langTag)}
                    </Text>
                  </Pressable>
                );
              }}
            />
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'flex-end',
  },
  dismiss: {
    flex: 1,
  },
  sheet: {
    maxHeight: '70%',
    backgroundColor: '#1a2230',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    borderColor: '#2a3140',
    borderWidth: 1,
    paddingBottom: 12,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#2a3140',
  },
  title: {
    color: '#f2f4f8',
    fontSize: 17,
    fontWeight: '700',
  },
  closeBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: '#2a3140',
  },
  closeText: {
    color: '#f2f4f8',
    fontWeight: '600',
  },
  centered: {
    paddingVertical: 40,
    alignItems: 'center',
  },
  listContent: {
    paddingVertical: 8,
  },
  emptyContainer: {
    paddingVertical: 32,
    paddingHorizontal: 16,
  },
  empty: {
    color: '#8b95a5',
    textAlign: 'center',
    fontSize: 15,
  },
  error: {
    color: '#f07178',
    paddingHorizontal: 16,
    paddingVertical: 8,
    fontSize: 14,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    minHeight: 52,
  },
  rowSelected: {
    backgroundColor: 'rgba(126, 182, 255, 0.16)',
  },
  rowPressed: {
    backgroundColor: '#243044',
  },
  rowDisabled: {
    opacity: 0.55,
  },
  rowText: {
    flex: 1,
    minWidth: 0,
  },
  displayName: {
    color: '#f2f4f8',
    fontSize: 16,
    fontWeight: '600',
  },
  layoutName: {
    color: '#8b95a5',
    fontWeight: '400',
  },
  code: {
    color: '#b0bac8',
    fontSize: 14,
    fontWeight: '700',
  },
});

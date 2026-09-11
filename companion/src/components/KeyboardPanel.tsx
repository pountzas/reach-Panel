import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { CompanionClient } from '../companionClient';
import {
  flagCodeForLanguage,
  languageDisplayCode,
} from '../lib/flagCodeForLanguage';
import type { InputMethod } from '../types';
import { CountryFlag } from './CountryFlag';
import { LanguagePickerModal } from './LanguagePickerModal';

type Props = {
  client: CompanionClient;
  enabled: boolean;
  typingLanguage: string;
  onLanguageChanged: (langTag: string) => void;
  onTypedChar?: (char: string) => void;
  onSpecialKey?: (key: string) => void;
};

const ROWS: string[][] = [
  ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'],
  ['q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p'],
  ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l'],
  ['z', 'x', 'c', 'v', 'b', 'n', 'm'],
];

export function KeyboardPanel({
  client,
  enabled,
  typingLanguage,
  onLanguageChanged,
  onTypedChar,
  onSpecialKey,
}: Props) {
  const [pickerOpen, setPickerOpen] = useState(false);

  const pressKey = (key: string, modifiers: string[] = []) => {
    if (!enabled) {
      return;
    }
    void client.send('key.press', { key, modifiers });
    onSpecialKey?.(key);
  };

  const typeText = (text: string) => {
    if (!enabled) {
      return;
    }
    void client.send('text.type', { text });
    onTypedChar?.(text);
  };

  const onPicked = (method: InputMethod) => {
    onLanguageChanged(method.langTag);
  };

  const langCode = languageDisplayCode(typingLanguage);

  return (
    <View style={styles.wrap}>
      {ROWS.map((row) => (
        <View key={row.join('')} style={styles.row}>
          {row.map((key) => (
            <KeyButton
              key={key}
              label={key.toUpperCase()}
              onPress={() => typeText(key)}
              enabled={enabled}
            />
          ))}
        </View>
      ))}
      <View style={styles.row}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Language ${langCode}`}
          disabled={!enabled}
          onPress={() => setPickerOpen(true)}
          style={({ pressed }) => [
            styles.key,
            styles.langKey,
            !enabled && styles.keyDisabled,
            pressed && enabled && styles.keyPressed,
          ]}
        >
          <CountryFlag
            country={flagCodeForLanguage(typingLanguage)}
            size={18}
          />
          <Text style={styles.keyLabel}>{langCode}</Text>
        </Pressable>
        <KeyButton
          label="Space"
          flex={3}
          onPress={() => pressKey('space')}
          enabled={enabled}
        />
        <KeyButton
          label="⌫"
          flex={1.2}
          onPress={() => pressKey('backspace')}
          enabled={enabled}
        />
        <KeyButton
          label="Enter"
          flex={1.4}
          onPress={() => pressKey('enter')}
          enabled={enabled}
        />
      </View>

      <LanguagePickerModal
        visible={pickerOpen}
        client={client}
        activeHkl={null}
        onClose={() => setPickerOpen(false)}
        onPicked={onPicked}
      />
    </View>
  );
}

function KeyButton({
  label,
  onPress,
  enabled,
  flex = 1,
}: {
  label: string;
  onPress: () => void;
  enabled: boolean;
  flex?: number;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={!enabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.key,
        { flex },
        !enabled && styles.keyDisabled,
        pressed && enabled && styles.keyPressed,
      ]}
    >
      <Text style={styles.keyLabel}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    justifyContent: 'flex-end',
    gap: 8,
    padding: 8,
  },
  row: {
    flexDirection: 'row',
    gap: 6,
    justifyContent: 'center',
  },
  key: {
    minHeight: 56,
    backgroundColor: '#2a3140',
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  langKey: {
    flex: 1.1,
    flexDirection: 'row',
    gap: 6,
  },
  keyPressed: {
    backgroundColor: '#3d4a63',
  },
  keyDisabled: {
    opacity: 0.45,
  },
  keyLabel: {
    color: '#f2f4f8',
    fontSize: 18,
    fontWeight: '600',
  },
});

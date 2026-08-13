import { Pressable, StyleSheet, Text, View } from 'react-native';

export type ShellTab =
  | 'keyboard'
  | 'trackpad'
  | 'numpad'
  | 'dictation'
  | 'profile'
  | 'usb';

const FAB_ITEMS: { tab: ShellTab; label: string }[] = [
  { tab: 'keyboard', label: 'Keyboard' },
  { tab: 'trackpad', label: 'Trackpad' },
  { tab: 'numpad', label: 'Numpad' },
  { tab: 'dictation', label: 'Dictation' },
  { tab: 'profile', label: 'Profile' },
  { tab: 'usb', label: 'USB help' },
];

type Props = {
  open: boolean;
  activeTab: ShellTab;
  onToggle: () => void;
  onSelect: (tab: ShellTab) => void;
};

export function CollapsedFab({ open, activeTab, onToggle, onSelect }: Props) {
  return (
    <View style={styles.wrap} pointerEvents="box-none">
      {open && (
        <View style={styles.menu}>
          {FAB_ITEMS.map((item) => (
            <Pressable
              key={item.tab}
              accessibilityRole="button"
              onPress={() => {
                onSelect(item.tab);
                onToggle();
              }}
              style={({ pressed }) => [
                styles.menuItem,
                activeTab === item.tab && styles.menuItemActive,
                pressed && styles.menuItemPressed,
              ]}
            >
              <Text
                style={[
                  styles.menuLabel,
                  activeTab === item.tab && styles.menuLabelActive,
                ]}
              >
                {item.label}
              </Text>
            </Pressable>
          ))}
        </View>
      )}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={open ? 'Close menu' : 'Open menu'}
        onPress={onToggle}
        style={({ pressed }) => [styles.fab, pressed && styles.fabPressed]}
      >
        <Text style={styles.fabText}>{open ? '✕' : '☰'}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    right: 16,
    bottom: 16,
    alignItems: 'flex-end',
    gap: 10,
  },
  menu: {
    backgroundColor: '#1c2433',
    borderRadius: 16,
    padding: 8,
    gap: 4,
    minWidth: 160,
    borderWidth: 1,
    borderColor: '#3a465c',
  },
  menuItem: {
    minHeight: 48,
    borderRadius: 10,
    paddingHorizontal: 14,
    justifyContent: 'center',
  },
  menuItemActive: {
    backgroundColor: '#2f4f78',
  },
  menuItemPressed: {
    backgroundColor: '#3d4a63',
  },
  menuLabel: {
    color: '#b0bac8',
    fontSize: 16,
    fontWeight: '600',
  },
  menuLabelActive: {
    color: '#f2f4f8',
  },
  fab: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#7eb6ff',
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 4,
  },
  fabPressed: {
    backgroundColor: '#a8ceff',
  },
  fabText: {
    color: '#0b1220',
    fontSize: 26,
    fontWeight: '800',
  },
});

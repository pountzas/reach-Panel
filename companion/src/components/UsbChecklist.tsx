import { Pressable, StyleSheet, Text, View } from 'react-native';

type Props = {
  onDismiss?: () => void;
};

const STEPS = [
  'On the tablet: Settings → Network → Hotspot & tethering → turn on USB tethering (phone may say “USB tethering”).',
  'Plug the tablet into the Windows PC with a data USB cable (not charge-only).',
  'On the PC: open ReachPanel → Settings → Companion → Refresh pairing / New pairing code so the QR shows the USB network IP (often 192.168.42.x or 192.168.137.x).',
  'In this app: scan the new QR or paste the updated pairing JSON, then Connect.',
  'If already paired: Unpair is not required — update the saved IP by scanning again, or use Reconnect after the host refreshes its QR IP.',
] as const;

export function UsbChecklist({ onDismiss }: Props) {
  return (
    <View style={styles.wrap}>
      <Text style={styles.title}>USB tether (school / no Wi‑Fi)</Text>
      <Text style={styles.subtitle}>
        Same ReachPanel protocol over the USB network — not a separate cable
        protocol.
      </Text>
      {STEPS.map((step, index) => (
        <View key={step} style={styles.stepRow}>
          <Text style={styles.num}>{index + 1}</Text>
          <Text style={styles.step}>{step}</Text>
        </View>
      ))}
      {onDismiss && (
        <Pressable
          accessibilityRole="button"
          onPress={onDismiss}
          style={({ pressed }) => [styles.btn, pressed && styles.pressed]}
        >
          <Text style={styles.btnText}>Got it</Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: 10,
    padding: 4,
  },
  title: {
    color: '#f2f4f8',
    fontSize: 20,
    fontWeight: '700',
  },
  subtitle: {
    color: '#9aa7bd',
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 4,
  },
  stepRow: {
    flexDirection: 'row',
    gap: 10,
    backgroundColor: '#1c2433',
    borderRadius: 10,
    padding: 12,
  },
  num: {
    color: '#7eb6ff',
    fontWeight: '800',
    fontSize: 16,
    width: 22,
  },
  step: {
    flex: 1,
    color: '#f2f4f8',
    fontSize: 14,
    lineHeight: 20,
  },
  btn: {
    marginTop: 8,
    backgroundColor: '#2a3140',
    borderRadius: 10,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: {
    backgroundColor: '#3d4a63',
  },
  btnText: {
    color: '#f2f4f8',
    fontWeight: '700',
  },
});

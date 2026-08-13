import { StyleSheet, Text, View } from 'react-native';
import type { ConnectionStatus } from '../companionClient';

type Props = {
  status: ConnectionStatus;
  detail?: string;
};

export function ReconnectingBanner({ status, detail }: Props) {
  if (status !== 'reconnecting' && status !== 'connecting') {
    return null;
  }

  const label =
    status === 'reconnecting'
      ? detail ?? 'Reconnecting to ReachPanel…'
      : 'Connecting…';

  return (
    <View style={styles.banner} accessibilityRole="alert">
      <Text style={styles.text}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    backgroundColor: '#3d3420',
    paddingVertical: 10,
    paddingHorizontal: 16,
  },
  text: {
    color: '#f5e6c8',
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
  },
});

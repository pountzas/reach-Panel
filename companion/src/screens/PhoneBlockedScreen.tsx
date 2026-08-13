import { StyleSheet, Text, View } from 'react-native';

type Props = {
  reason: string;
};

export function PhoneBlockedScreen({ reason }: Props) {
  return (
    <View style={styles.container}>
      <Text style={styles.brand}>ReachPanel</Text>
      <Text style={styles.title}>Tablet required</Text>
      <Text style={styles.body}>{reason}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#121820',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
  },
  brand: {
    color: '#7eb6ff',
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: 0.5,
    marginBottom: 16,
  },
  title: {
    color: '#f2f4f8',
    fontSize: 24,
    fontWeight: '700',
    marginBottom: 12,
    textAlign: 'center',
  },
  body: {
    color: '#b0bac8',
    fontSize: 17,
    textAlign: 'center',
    lineHeight: 24,
  },
});

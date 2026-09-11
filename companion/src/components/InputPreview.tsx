import { Image, StyleSheet, Text, View } from 'react-native';

type Props = {
  dataUrl: string | null;
};

export function InputPreview({ dataUrl }: Props) {
  return (
    <View style={styles.wrap} accessibilityLabel="Target input">
      <View style={styles.frame}>
        {dataUrl ? (
          <Image
            source={{ uri: dataUrl }}
            style={styles.image}
            resizeMode="contain"
            accessibilityLabel="Target input"
          />
        ) : (
          <Text style={styles.waiting}>Waiting for preview…</Text>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    backgroundColor: '#121820',
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  frame: {
    height: 48,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#2a3140',
    backgroundColor: '#1a2230',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  image: {
    width: '100%',
    height: '100%',
  },
  waiting: {
    color: '#6b7585',
    fontSize: 13,
    paddingHorizontal: 12,
  },
});

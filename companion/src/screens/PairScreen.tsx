import { useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { UsbChecklist } from '../components/UsbChecklist';
import { parsePairingPayload, type PairingPayload } from '../protocol';

type Props = {
  busy: boolean;
  error: string | null;
  onPair: (payload: PairingPayload) => void;
};

export function PairScreen({ busy, error, onPair }: Props) {
  const [permission, requestPermission] = useCameraPermissions();
  const [manual, setManual] = useState('');
  const [scanEnabled, setScanEnabled] = useState(true);
  const [localError, setLocalError] = useState<string | null>(null);
  const [showUsb, setShowUsb] = useState(false);

  const submitRaw = (raw: string) => {
    try {
      const payload = parsePairingPayload(raw.trim());
      setLocalError(null);
      setScanEnabled(false);
      onPair(payload);
    } catch (e) {
      setLocalError(e instanceof Error ? e.message : 'Invalid QR payload');
      setScanEnabled(true);
    }
  };

  if (showUsb) {
    return (
      <ScrollView contentContainerStyle={styles.container}>
        <UsbChecklist onDismiss={() => setShowUsb(false)} />
      </ScrollView>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.brand}>ReachPanel</Text>
      <Text style={styles.title}>Pair with Windows PC</Text>
      <Text style={styles.subtitle}>
        Scan the QR code from ReachPanel Companion settings, or paste the pairing
        JSON. No Wi‑Fi? Use USB tether help below.
      </Text>
      <Pressable style={styles.secondaryBtn} onPress={() => setShowUsb(true)}>
        <Text style={styles.secondaryBtnText}>USB tether checklist</Text>
      </Pressable>

      <View style={styles.cameraBox}>
        {!permission?.granted ? (
          <View style={styles.permissionBox}>
            <Text style={styles.permissionText}>Camera access is needed to scan the QR code.</Text>
            <Pressable style={styles.secondaryBtn} onPress={() => void requestPermission()}>
              <Text style={styles.secondaryBtnText}>Allow camera</Text>
            </Pressable>
          </View>
        ) : (
          <CameraView
            style={styles.camera}
            facing="back"
            barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
            onBarcodeScanned={
              scanEnabled && !busy
                ? ({ data }) => {
                    submitRaw(data);
                  }
                : undefined
            }
          />
        )}
      </View>

      <TextInput
        style={styles.input}
        multiline
        placeholder='{"hostId":"...","ip":"...","port":17890,...}'
        placeholderTextColor="#6b7585"
        value={manual}
        onChangeText={setManual}
        editable={!busy}
      />

      <Pressable
        style={[styles.primaryBtn, busy && styles.btnDisabled]}
        disabled={busy}
        onPress={() => submitRaw(manual)}
      >
        {busy ? (
          <ActivityIndicator color="#0b1220" />
        ) : (
          <Text style={styles.primaryBtnText}>Connect with pasted JSON</Text>
        )}
      </Pressable>

      {(localError || error) && (
        <Text style={styles.error}>{localError || error}</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#121820',
    padding: 24,
    gap: 12,
  },
  brand: {
    color: '#7eb6ff',
    fontSize: 26,
    fontWeight: '800',
    marginTop: 8,
  },
  title: {
    color: '#f2f4f8',
    fontSize: 28,
    fontWeight: '700',
  },
  subtitle: {
    color: '#b0bac8',
    fontSize: 16,
    lineHeight: 22,
    marginBottom: 4,
  },
  cameraBox: {
    height: 240,
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: '#1c2433',
  },
  camera: {
    flex: 1,
  },
  permissionBox: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    gap: 12,
  },
  permissionText: {
    color: '#b0bac8',
    textAlign: 'center',
    fontSize: 16,
  },
  input: {
    minHeight: 88,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#3a465c',
    backgroundColor: '#1c2433',
    color: '#f2f4f8',
    padding: 12,
    fontSize: 14,
    textAlignVertical: 'top',
  },
  primaryBtn: {
    backgroundColor: '#7eb6ff',
    borderRadius: 12,
    minHeight: 52,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryBtnText: {
    color: '#0b1220',
    fontSize: 17,
    fontWeight: '700',
  },
  secondaryBtn: {
    backgroundColor: '#2a3140',
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  secondaryBtnText: {
    color: '#f2f4f8',
    fontWeight: '600',
  },
  btnDisabled: {
    opacity: 0.6,
  },
  error: {
    color: '#ff8f8f',
    fontSize: 15,
  },
});

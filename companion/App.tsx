import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Dimensions, Platform, StyleSheet, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import {
  NavigationBar,
  setStyle as setNavigationBarStyle,
} from 'expo-navigation-bar';
import * as ScreenOrientation from 'expo-screen-orientation';
import {
  SafeAreaProvider,
  initialWindowMetrics,
  useSafeAreaInsets,
} from 'react-native-safe-area-context';
import {
  CompanionClient,
  type ConnectionStatus,
} from './src/companionClient';
import type { PairingPayload } from './src/protocol';
import { evaluateTabletGate } from './src/tabletGate';
import { clearCredential, loadCredential, saveCredential } from './src/storage';
import { ConnectedScreen } from './src/screens/ConnectedScreen';
import { PairScreen } from './src/screens/PairScreen';
import { PhoneBlockedScreen } from './src/screens/PhoneBlockedScreen';

type AppPhase = 'gate' | 'pair' | 'connected';

export default function App() {
  const client = useMemo(() => new CompanionClient(), []);
  const [phase, setPhase] = useState<AppPhase>('gate');
  const [gateReason, setGateReason] = useState<string | null>(null);
  const [status, setStatus] = useState<ConnectionStatus>('disconnected');
  const [statusDetail, setStatusDetail] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bootstrapped = useRef(false);

  useEffect(() => {
    void ScreenOrientation.lockAsync(
      ScreenOrientation.OrientationLock.LANDSCAPE,
    ).catch(() => {
      /* tablets / emulators may ignore */
    });

    const { width, height } = Dimensions.get('window');
    const gate = evaluateTabletGate(width, height);
    if (!gate.allowed) {
      setGateReason(gate.reason);
      setPhase('gate');
      return;
    }

    setPhase('pair');

    const unsub = client.onStatus((next, detail) => {
      setStatus(next);
      setStatusDetail(detail);
      if (next === 'connected') {
        setPhase('connected');
      }
    });

    if (!bootstrapped.current) {
      bootstrapped.current = true;
      void (async () => {
        const cred = await loadCredential();
        if (!cred) {
          return;
        }
        setBusy(true);
        setError(null);
        try {
          await client.connectWithCredential(cred);
          setPhase('connected');
        } catch (e) {
          setError(e instanceof Error ? e.message : 'Reconnect failed');
          setPhase('pair');
        } finally {
          setBusy(false);
        }
      })();
    }

    return () => {
      unsub();
      client.disconnect();
    };
  }, [client]);

  const onPair = async (payload: PairingPayload) => {
    setBusy(true);
    setError(null);
    try {
      const existing = await loadCredential();
      // Same host + new IP (e.g. USB tether): refresh endpoint, keep credential.
      if (existing && existing.hostId === payload.hostId) {
        const updated = {
          ...existing,
          lastIp: payload.ip,
          port: payload.port,
        };
        await saveCredential(updated);
        await client.connectWithCredential(updated);
        setPhase('connected');
        return;
      }
      const cred = await client.pair(payload);
      await saveCredential(cred);
      setPhase('connected');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Pairing failed');
      setPhase('pair');
    } finally {
      setBusy(false);
    }
  };

  const onForget = async () => {
    client.disconnect();
    await clearCredential();
    setPhase('pair');
    setError(null);
  };

  let content: ReactNode;
  if (phase === 'gate' && gateReason) {
    content = <PhoneBlockedScreen reason={gateReason} />;
  } else if (phase === 'connected' || status === 'reconnecting') {
    content = (
      <ConnectedScreen
        client={client}
        status={status}
        statusDetail={statusDetail}
        onForget={() => {
          void onForget();
        }}
      />
    );
  } else {
    content = (
      <PairScreen
        busy={busy}
        error={error}
        onPair={(payload) => {
          void onPair(payload);
        }}
      />
    );
  }

  return (
    <SafeAreaProvider initialMetrics={initialWindowMetrics}>
      <AppChrome>{content}</AppChrome>
    </SafeAreaProvider>
  );
}

function AppChrome({ children }: { children: ReactNode }) {
  const insets = useSafeAreaInsets();

  useEffect(() => {
    if (Platform.OS !== 'android') {
      return;
    }
    setNavigationBarStyle('light');
    // Keep soft keys hidden while ReachPanel Companion is open.
    NavigationBar.setHidden(true);
  }, []);

  return (
    <View
      style={[
        styles.safe,
        {
          paddingTop: insets.top,
          paddingLeft: insets.left,
          paddingRight: insets.right,
        },
      ]}
    >
      <View style={styles.root}>{children}</View>
      <StatusBar style="light" />
      {Platform.OS === 'android' ? (
        <NavigationBar style="light" hidden />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: '#121820',
  },
  root: {
    flex: 1,
  },
});

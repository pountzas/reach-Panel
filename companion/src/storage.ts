import AsyncStorage from '@react-native-async-storage/async-storage';
import type { StoredCredential } from './protocol';

const CREDENTIAL_KEY = 'reachpanel.companion.credential';

export async function loadCredential(): Promise<StoredCredential | null> {
  const raw = await AsyncStorage.getItem(CREDENTIAL_KEY);
  if (!raw) {
    return null;
  }
  try {
    return JSON.parse(raw) as StoredCredential;
  } catch {
    return null;
  }
}

export async function saveCredential(cred: StoredCredential): Promise<void> {
  await AsyncStorage.setItem(CREDENTIAL_KEY, JSON.stringify(cred));
}

export async function clearCredential(): Promise<void> {
  await AsyncStorage.removeItem(CREDENTIAL_KEY);
}

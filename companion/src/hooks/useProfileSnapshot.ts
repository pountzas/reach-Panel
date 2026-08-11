import { useCallback, useEffect, useState } from 'react';
import type { CompanionClient, ConnectionStatus } from '../companionClient';
import type { ProfileSnapshot } from '../types';

const PROFILE_ID = 'active';

export function useProfileSnapshot(
  client: CompanionClient,
  status: ConnectionStatus,
) {
  const [snapshot, setSnapshot] = useState<ProfileSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const language =
    typeof snapshot?.settings.typingLanguage === 'string'
      ? snapshot.settings.typingLanguage
      : 'en';

  const refresh = useCallback(async () => {
    if (client.getStatus() !== 'connected') {
      return;
    }
    setLoading(true);
    try {
      const reply = await client.send('profile.snapshot', {
        profileId: PROFILE_ID,
        language,
      });
      if (reply.type === 'error') {
        throw new Error(
          typeof reply.payload?.message === 'string'
            ? reply.payload.message
            : 'Snapshot failed',
        );
      }
      if (reply.type !== 'profile.snapshot.ok' || !reply.payload) {
        throw new Error('Unexpected snapshot response');
      }
      setSnapshot(reply.payload as unknown as ProfileSnapshot);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Snapshot failed');
    } finally {
      setLoading(false);
    }
  }, [client, language]);

  useEffect(() => {
    if (status === 'connected') {
      void refresh();
    }
  }, [status, refresh]);

  return { snapshot, error, loading, refresh, language, profileId: PROFILE_ID };
}

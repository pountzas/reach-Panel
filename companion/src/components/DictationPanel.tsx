import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import type { CompanionClient } from '../companionClient';
import {
  startTabletRecording,
  stopTabletRecording,
  stopTabletRecordingDiscard,
} from '../dictationRecorder';

type Props = {
  client: CompanionClient;
  language: string;
  enabled: boolean;
};

type Phase = 'idle' | 'starting' | 'listening' | 'processing';

export function DictationPanel({ client, language, enabled }: Props) {
  const [phase, setPhase] = useState<Phase>('idle');
  const [partial, setPartial] = useState('');
  const [finalText, setFinalText] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    return client.onMessage((env) => {
      if (env.type === 'dictation.partial') {
        const text =
          typeof env.payload?.text === 'string' ? env.payload.text : '';
        if (text) {
          setPartial((prev) => (prev ? `${prev} ${text}` : text));
        }
      }
      if (env.type === 'dictation.final') {
        const text =
          typeof env.payload?.text === 'string' ? env.payload.text : '';
        if (text) {
          setFinalText(text);
        }
      }
    });
  }, [client]);

  useEffect(() => {
    if (!enabled && phase === 'listening') {
      void (async () => {
        await stopTabletRecordingDiscard();
        try {
          await client.send('dictation.stop', {});
        } catch {
          /* ignore */
        }
        setPhase('idle');
      })();
    }
  }, [enabled, phase, client]);

  const start = async () => {
    if (!enabled) {
      return;
    }
    setError(null);
    setPartial('');
    setFinalText('');
    setPhase('starting');
    try {
      const reply = await client.send('dictation.start', { language });
      if (reply.type === 'error') {
        throw new Error(
          typeof reply.payload?.message === 'string'
            ? reply.payload.message
            : 'Could not start dictation',
        );
      }
      await startTabletRecording();
      setPhase('listening');
    } catch (e) {
      await stopTabletRecordingDiscard();
      setPhase('idle');
      setError(e instanceof Error ? e.message : 'Dictation failed');
    }
  };

  const stop = async () => {
    setPhase('processing');
    try {
      const audio = await stopTabletRecording();
      if (!audio) {
        await client.send('dictation.stop', {});
        setPhase('idle');
        return;
      }
      const reply = await client.send('dictation.stop', {
        data: audio.base64,
        format: audio.format,
        mimeType: audio.mimeType,
        filename: audio.filename,
      });
      if (reply.type === 'error') {
        throw new Error(
          typeof reply.payload?.message === 'string'
            ? reply.payload.message
            : 'Transcription failed',
        );
      }
      if (reply.type === 'dictation.final') {
        const text =
          typeof reply.payload?.text === 'string' ? reply.payload.text : '';
        if (text) {
          setFinalText(text);
        }
      }
      setPhase('idle');
    } catch (e) {
      await stopTabletRecordingDiscard();
      setPhase('idle');
      setError(e instanceof Error ? e.message : 'Dictation failed');
    }
  };

  const cancel = async () => {
    await stopTabletRecordingDiscard();
    try {
      await client.send('dictation.stop', {});
    } catch {
      /* ignore */
    }
    setPhase('idle');
  };

  const busy = phase === 'starting' || phase === 'processing';
  const listening = phase === 'listening';

  return (
    <View style={styles.wrap}>
      <Text style={styles.title}>Dictation</Text>
      <Text style={styles.hint}>
        Uses this tablet’s mic. Host PC mic stays off. Needs a Groq key on the
        Windows host (never synced here).
      </Text>

      <Pressable
        accessibilityRole="button"
        disabled={!enabled || busy}
        onPress={() => {
          if (listening) {
            void stop();
          } else {
            void start();
          }
        }}
        style={({ pressed }) => [
          styles.micBtn,
          listening && styles.micBtnLive,
          (!enabled || busy) && styles.disabled,
          pressed && enabled && styles.pressed,
        ]}
      >
        {busy ? (
          <ActivityIndicator color="#0b1220" />
        ) : (
          <Text style={styles.micLabel}>
            {listening ? 'Stop & type' : 'Hold to talk — tap to start'}
          </Text>
        )}
      </Pressable>

      {listening && (
        <Pressable style={styles.cancelBtn} onPress={() => void cancel()}>
          <Text style={styles.cancelText}>Cancel</Text>
        </Pressable>
      )}

      {(partial || finalText) && (
        <View style={styles.resultBox}>
          {partial ? (
            <Text style={styles.partial}>Partial: {partial}</Text>
          ) : null}
          {finalText ? (
            <Text style={styles.final}>Typed: {finalText}</Text>
          ) : null}
        </View>
      )}

      {error && <Text style={styles.error}>{error}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    padding: 20,
    gap: 12,
  },
  title: {
    color: '#f2f4f8',
    fontSize: 22,
    fontWeight: '700',
  },
  hint: {
    color: '#9aa7bd',
    fontSize: 14,
    lineHeight: 20,
  },
  micBtn: {
    marginTop: 12,
    minHeight: 88,
    borderRadius: 16,
    backgroundColor: '#7eb6ff',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  micBtnLive: {
    backgroundColor: '#e85d5d',
  },
  micLabel: {
    color: '#0b1220',
    fontSize: 18,
    fontWeight: '800',
    textAlign: 'center',
  },
  pressed: {
    opacity: 0.9,
  },
  disabled: {
    opacity: 0.45,
  },
  cancelBtn: {
    alignSelf: 'center',
    padding: 12,
  },
  cancelText: {
    color: '#b0bac8',
    fontWeight: '600',
  },
  resultBox: {
    backgroundColor: '#1c2433',
    borderRadius: 12,
    padding: 14,
    gap: 8,
  },
  partial: {
    color: '#9aa7bd',
    fontSize: 15,
  },
  final: {
    color: '#f2f4f8',
    fontSize: 16,
    fontWeight: '600',
  },
  error: {
    color: '#ff8f8f',
    fontSize: 14,
  },
});

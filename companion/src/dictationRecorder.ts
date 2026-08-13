import {
  AudioModule,
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  type AudioRecorder,
} from 'expo-audio';
import { File } from 'expo-file-system';

export type RecordedAudio = {
  base64: string;
  format: 'm4a';
  mimeType: string;
  filename: string;
};

let recording: AudioRecorder | null = null;

function releaseRecorder(recorder: AudioRecorder): void {
  try {
    recorder.release();
  } catch {
    /* already released */
  }
}

export async function startTabletRecording(): Promise<void> {
  await stopTabletRecordingDiscard();
  const permission = await requestRecordingPermissionsAsync();
  if (!permission.granted) {
    throw new Error('Microphone permission is required for dictation.');
  }
  await setAudioModeAsync({
    allowsRecording: true,
    playsInSilentMode: true,
  });
  const next = new AudioModule.AudioRecorder(RecordingPresets.HIGH_QUALITY);
  await next.prepareToRecordAsync();
  next.record();
  recording = next;
}

export async function stopTabletRecording(): Promise<RecordedAudio | null> {
  const current = recording;
  recording = null;
  if (!current) {
    return null;
  }
  try {
    await current.stop();
  } catch {
    /* already stopped */
  }
  const uri = current.uri;
  if (!uri) {
    releaseRecorder(current);
    return null;
  }
  try {
    const file = new File(uri);
    const base64 = await file.base64();
    try {
      file.delete();
    } catch {
      /* ignore cleanup */
    }
    return {
      base64,
      format: 'm4a',
      mimeType: 'audio/mp4',
      filename: 'dictation.m4a',
    };
  } finally {
    releaseRecorder(current);
  }
}

export async function stopTabletRecordingDiscard(): Promise<void> {
  const current = recording;
  recording = null;
  if (!current) {
    return;
  }
  try {
    await current.stop();
    const uri = current.uri;
    if (uri) {
      try {
        new File(uri).delete();
      } catch {
        /* ignore cleanup */
      }
    }
  } catch {
    /* ignore */
  } finally {
    releaseRecorder(current);
  }
}

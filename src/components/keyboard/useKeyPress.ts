import { useCallback, useRef, useState, type PointerEvent, type RefObject } from "react";
import { useAppStore } from "../../stores/appStore";
import { findKeyIdAtPoint } from "../../lib/synthHitTest";
import type { PianoKey } from "../../lib/music/pianoKeys";

type ActiveVoice = {
  oscillator: OscillatorNode;
  gain: GainNode;
};

type ActivePointer = {
  keyId: string;
  voice: ActiveVoice;
};

function pressedKeysFromPointers(activePointers: Map<number, ActivePointer>): Set<string> {
  return new Set([...activePointers.values()].map((entry) => entry.keyId));
}

type UseSynthKeyPressArgs = {
  pianoRef: RefObject<HTMLDivElement | null>;
  keyById: Map<string, PianoKey>;
  targetKeyIdRef: RefObject<string | null>;
  startVoice: (freq: number) => Promise<ActiveVoice>;
  stopVoice: (voice: ActiveVoice) => void;
  markWrongKey: (keyId: string) => void;
  clearWrongKeyFlash: (keyId: string) => void;
  flashWrongKeyOnRelease: (keyId: string) => void;
  reportMusicKeyPlayed: (keyId: string) => void;
};

/** Pointer → piano key press/release for the synthesizer. */
export function useKeyPress({
  pianoRef,
  keyById,
  targetKeyIdRef,
  startVoice,
  stopVoice,
  markWrongKey,
  clearWrongKeyFlash,
  flashWrongKeyOnRelease,
  reportMusicKeyPlayed,
}: UseSynthKeyPressArgs) {
  const activePointers = useRef<Map<number, ActivePointer>>(new Map());
  const [pressedKeys, setPressedKeys] = useState<Set<string>>(() => new Set());

  const syncPressedKeys = useCallback(() => {
    setPressedKeys(pressedKeysFromPointers(activePointers.current));
  }, []);

  const releasePointer = useCallback(
    (pointerId: number) => {
      const active = activePointers.current.get(pointerId);
      if (!active) return;

      stopVoice(active.voice);
      activePointers.current.delete(pointerId);
      flashWrongKeyOnRelease(active.keyId);
      syncPressedKeys();
    },
    [flashWrongKeyOnRelease, stopVoice, syncPressedKeys],
  );

  const setPointerKey = useCallback(
    async (pointerId: number, keyId: string | null) => {
      if (useAppStore.getState().musicPlaybackActive) return;

      const current = activePointers.current.get(pointerId);
      if (current?.keyId === keyId) return;

      if (current) {
        stopVoice(current.voice);
        activePointers.current.delete(pointerId);
        flashWrongKeyOnRelease(current.keyId);
      }

      if (keyId) {
        const key = keyById.get(keyId);
        if (!key) return;
        const voice = await startVoice(key.freq);
        activePointers.current.set(pointerId, { keyId, voice });
        const teaching = useAppStore.getState().musicTeachingEnabled;
        const target = targetKeyIdRef.current;
        if (teaching && target && keyId !== target) {
          markWrongKey(keyId);
        } else {
          clearWrongKeyFlash(keyId);
        }
        reportMusicKeyPlayed(keyId);
      }

      syncPressedKeys();
    },
    [
      clearWrongKeyFlash,
      flashWrongKeyOnRelease,
      keyById,
      markWrongKey,
      reportMusicKeyPlayed,
      startVoice,
      stopVoice,
      syncPressedKeys,
      targetKeyIdRef,
    ],
  );

  const updatePointerFromEvent = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      const container = pianoRef.current;
      if (!container) return;

      const keyId = findKeyIdAtPoint(container, event.clientX, event.clientY);
      void setPointerKey(event.pointerId, keyId);
    },
    [pianoRef, setPointerKey],
  );

  const onPianoPointerDown = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      event.currentTarget.setPointerCapture(event.pointerId);
      updatePointerFromEvent(event);
    },
    [updatePointerFromEvent],
  );

  const onPianoPointerMove = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
      updatePointerFromEvent(event);
    },
    [updatePointerFromEvent],
  );

  const onPianoPointerUp = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
      releasePointer(event.pointerId);
    },
    [releasePointer],
  );

  const onPianoLostPointerCapture = useCallback(
    (event: PointerEvent<HTMLDivElement>) => {
      releasePointer(event.pointerId);
    },
    [releasePointer],
  );

  const clearActivePointers = useCallback(() => {
    for (const entry of activePointers.current.values()) {
      stopVoice(entry.voice);
    }
    activePointers.current.clear();
  }, [stopVoice]);

  return {
    pressedKeys,
    onPianoPointerDown,
    onPianoPointerMove,
    onPianoPointerUp,
    onPianoLostPointerCapture,
    clearActivePointers,
  };
}

/** Sticky-style pressed-key set helpers for synthesizer teaching UI. */
export { pressedKeysFromPointers };
export type { ActivePointer, ActiveVoice };

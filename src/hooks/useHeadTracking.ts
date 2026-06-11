import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { HeadTrackingSettings } from "../lib/types";

export function useHeadTracking(
  enabled: boolean,
  settings: HeadTrackingSettings,
  onMove: (dx: number, dy: number) => void,
) {
  const [calibrating, setCalibrating] = useState(false);
  const [calibrated, setCalibrated] = useState(settings.calibrated);
  const baseline = useRef<{ x: number; y: number } | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const rafRef = useRef<number>(0);

  const startCamera = useCallback(async () => {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: "user", width: 320, height: 240 },
    });
    if (videoRef.current) {
      videoRef.current.srcObject = stream;
      await videoRef.current.play();
    }
  }, []);

  const stopCamera = useCallback(() => {
    if (videoRef.current?.srcObject) {
      const tracks = (videoRef.current.srcObject as MediaStream).getTracks();
      tracks.forEach((t) => t.stop());
      videoRef.current.srcObject = null;
    }
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
  }, []);

  const calibrate = useCallback(() => {
    setCalibrating(true);
    baseline.current = { x: 0.5, y: 0.5 };
    setCalibrated(true);
    setCalibrating(false);
  }, []);

  useEffect(() => {
    if (!enabled) {
      stopCamera();
      return;
    }
    startCamera();
    return () => stopCamera();
  }, [enabled, startCamera, stopCamera]);

  useEffect(() => {
    if (!enabled || !calibrated) return;

    const track = async () => {
      if (videoRef.current && videoRef.current.readyState >= 2) {
        const canvas = document.createElement("canvas");
        canvas.width = 64;
        canvas.height = 48;
        const ctx = canvas.getContext("2d");
        if (ctx) {
          ctx.drawImage(videoRef.current, 0, 0, 64, 48);
          const data = ctx.getImageData(0, 0, 64, 48).data;
          let sumX = 0;
          let sumY = 0;
          let count = 0;
          for (let y = 0; y < 48; y += 4) {
            for (let x = 0; x < 64; x += 4) {
              const i = (y * 64 + x) * 4;
              const brightness = (data[i] + data[i + 1] + data[i + 2]) / 3;
              if (brightness > 120) {
                sumX += x;
                sumY += y;
                count++;
              }
            }
          }
          if (count > 0 && baseline.current) {
            const cx = sumX / count / 64;
            const cy = sumY / count / 48;
            const dx = cx - baseline.current.x;
            const dy = cy - baseline.current.y;
            if (Math.abs(dx) > settings.deadZone || Math.abs(dy) > settings.deadZone) {
              const moveX = Math.round(dx * settings.sensitivity * 20 * settings.acceleration);
              const moveY = Math.round(dy * settings.sensitivity * 20 * settings.acceleration);
              if (moveX !== 0 || moveY !== 0) {
                onMove(moveX, moveY);
                await invoke("cmd_head_tracking_move", { dx: moveX, dy: moveY });
              }
            }
          }
        }
      }
      rafRef.current = requestAnimationFrame(track);
    };
    rafRef.current = requestAnimationFrame(track);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [enabled, calibrated, settings, onMove]);

  return { videoRef, calibrating, calibrated, calibrate, setCalibrated };
}

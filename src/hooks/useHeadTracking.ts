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
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const onMoveRef = useRef(onMove);
  const settingsRef = useRef(settings);
  const ipcPendingRef = useRef(false);

  onMoveRef.current = onMove;
  settingsRef.current = settings;

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
    }
    if (videoRef.current) {
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

    if (!canvasRef.current) {
      const canvas = document.createElement("canvas");
      canvas.width = 64;
      canvas.height = 48;
      canvasRef.current = canvas;
    }

    const track = () => {
      const canvas = canvasRef.current;
      const video = videoRef.current;
      if (canvas && video && video.readyState >= 2) {
        const ctx = canvas.getContext("2d");
        if (ctx) {
          ctx.drawImage(video, 0, 0, 64, 48);
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
          if (count > 0 && baseline.current && !ipcPendingRef.current) {
            const ht = settingsRef.current;
            const cx = sumX / count / 64;
            const cy = sumY / count / 48;
            const dx = cx - baseline.current.x;
            const dy = cy - baseline.current.y;
            if (Math.abs(dx) > ht.deadZone || Math.abs(dy) > ht.deadZone) {
              const moveX = Math.round(dx * ht.sensitivity * 20 * ht.acceleration);
              const moveY = Math.round(dy * ht.sensitivity * 20 * ht.acceleration);
              if (moveX !== 0 || moveY !== 0) {
                onMoveRef.current(moveX, moveY);
                ipcPendingRef.current = true;
                void invoke("cmd_head_tracking_move", { dx: moveX, dy: moveY }).finally(
                  () => {
                    ipcPendingRef.current = false;
                  },
                );
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
  }, [enabled, calibrated]);

  return { videoRef, calibrating, calibrated, calibrate, setCalibrated };
}

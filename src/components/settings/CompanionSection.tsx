import { useCallback, useEffect, useState, type CSSProperties } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import QRCode from "qrcode";
import type { SurfaceColors } from "../../lib/colorProfiles";
import type { TranslationKey } from "../../i18n";
import { notify } from "../../lib/notify";
import { useTranslation } from "../../hooks/useTranslation";
import {
  type CompanionAudioRouting,
  type CompanionSessionPhase,
  type CompanionUiState,
} from "../../lib/companionSession";
import { useAppStore } from "../../stores/appStore";

interface PairingPayload {
  hostId: string;
  ip: string;
  port: number;
  pairingToken: string;
  protocolVersion: number;
  pubkey: string;
  candidateIps?: string[];
}

interface PairedDevice {
  deviceId: string;
  deviceName: string;
  credentialHash: string;
  createdAt: string;
  lastSeenAt: string;
  revoked: boolean;
}

function fieldStyle(surface: SurfaceColors): CSSProperties {
  return {
    backgroundColor: surface.insetBg,
    borderColor: surface.insetBorder,
    color: surface.panelText,
  };
}

function sessionLabel(
  session: CompanionSessionPhase,
  t: (key: TranslationKey) => string,
): string {
  switch (session) {
    case "idle":
      return t("companionSessionIdle");
    case "active":
      return t("companionSessionActive");
    case "reconnecting":
      return t("companionSessionReconnecting");
    default: {
      const _exhaustive: never = session;
      return _exhaustive;
    }
  }
}

function audioLabel(
  routing: CompanionAudioRouting,
  t: (key: TranslationKey) => string,
): string {
  switch (routing) {
    case "host":
      return t("companionAudioHost");
    case "tablet":
      return t("companionAudioTablet");
    default: {
      const _exhaustive: never = routing;
      return _exhaustive;
    }
  }
}

export function CompanionSection({ surface }: { surface: SurfaceColors }) {
  const { t } = useTranslation();
  const setAppMode = useAppStore((s) => s.setAppMode);
  const stopCompanionByCaregiver = useAppStore((s) => s.stopCompanionByCaregiver);
  const [status, setStatus] = useState<CompanionUiState | null>(null);
  const [payload, setPayload] = useState<PairingPayload | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [devices, setDevices] = useState<PairedDevice[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const secondaryButtonStyle = {
    backgroundColor: surface.insetBg,
    borderColor: surface.insetBorder,
    color: surface.panelText,
  };

  const refresh = useCallback(async () => {
    try {
      const next = await invoke<CompanionUiState>("cmd_companion_status");
      setStatus(next);
      const list = await invoke<PairedDevice[]>("cmd_companion_list_devices");
      setDevices(list);
      if (next.running) {
        const pair = await invoke<PairingPayload>("cmd_companion_pairing_payload");
        setPayload(pair);
      } else {
        setPayload(null);
        setQrDataUrl(null);
      }
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  useEffect(() => {
    void refresh();
    const unlisten = listen<CompanionUiState>("companion-state", (event) => {
      setStatus(event.payload);
      void invoke<PairedDevice[]>("cmd_companion_list_devices")
        .then(setDevices)
        .catch(() => undefined);
    });
    return () => {
      void unlisten.then((fn) => fn());
    };
  }, [refresh]);

  useEffect(() => {
    if (!payload) {
      setQrDataUrl(null);
      return;
    }
    let cancelled = false;
    void QRCode.toDataURL(JSON.stringify(payload), {
      width: 220,
      margin: 1,
      color: { dark: "#0b1220", light: "#ffffff" },
    })
      .then((url) => {
        if (!cancelled) {
          setQrDataUrl(url);
        }
      })
      .catch((e: unknown) => {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : String(e));
        }
      });
    return () => {
      cancelled = true;
    };
  }, [payload]);

  const startBridge = async () => {
    setBusy(true);
    try {
      await setAppMode("companion");
      let next = await invoke<CompanionUiState>("cmd_companion_status");
      if (!next.running) {
        next = await invoke<CompanionUiState>("cmd_companion_start", {
          port: null,
        });
      }
      if (next.running) {
        const pair = await invoke<PairingPayload>("cmd_companion_pairing_payload");
        setPayload(pair);
      }
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const stopBridge = async () => {
    setBusy(true);
    try {
      await stopCompanionByCaregiver();
      setPayload(null);
      setQrDataUrl(null);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const refreshQr = async () => {
    setBusy(true);
    try {
      const pair = await invoke<PairingPayload>("cmd_companion_refresh_pairing");
      setPayload(pair);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const copyPayload = async () => {
    if (!payload) {
      return;
    }
    try {
      await navigator.clipboard.writeText(JSON.stringify(payload));
      notify.success(t("companionCopied"));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const revoke = async (deviceId: string) => {
    setBusy(true);
    try {
      await invoke("cmd_companion_revoke_device", { deviceId });
      notify.success(t("companionRevoked"));
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const running = status?.running ?? false;

  return (
    <div className="space-y-4">
      <p className="text-sm" style={{ color: surface.panelMutedText }}>
        {t("companionDescription")}
      </p>

      <div
        className="flex flex-wrap items-center gap-3 rounded-lg px-3 py-2.5 text-sm"
        style={{ backgroundColor: surface.insetBg, color: surface.panelText }}
      >
        <span className="font-semibold">
          {running ? t("companionBridgeRunning") : t("companionBridgeStopped")}
        </span>
        {status && (
          <>
            <span>
              {t("companionPort")}: {status.port}
            </span>
            <span>
              {t("companionSession")}: {sessionLabel(status.session, t)}
            </span>
            <span>
              {t("companionAudioRouting")}: {audioLabel(status.audioRouting, t)}
            </span>
            {status.deviceName && (
              <span>
                {t("companionConnectedDevice")}: {status.deviceName}
                {status.lastRttMs != null ? ` (${status.lastRttMs} ms)` : ""}
              </span>
            )}
          </>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        {running ? (
          <button
            type="button"
            className="rounded-lg border px-3 py-2 text-sm"
            style={secondaryButtonStyle}
            disabled={busy}
            onClick={() => void stopBridge()}
          >
            {t("companionStop")}
          </button>
        ) : (
          <button
            type="button"
            className="rounded-lg border px-3 py-2 text-sm"
            style={secondaryButtonStyle}
            disabled={busy}
            onClick={() => void startBridge()}
          >
            {t("companionStart")}
          </button>
        )}
        {running && (
          <>
            <button
              type="button"
              className="rounded-lg border px-3 py-2 text-sm"
              style={secondaryButtonStyle}
              disabled={busy}
              onClick={() => void refreshQr()}
            >
              {t("companionRefreshQr")}
            </button>
            <button
              type="button"
              className="rounded-lg border px-3 py-2 text-sm"
              style={secondaryButtonStyle}
              disabled={busy || !payload}
              onClick={() => void copyPayload()}
            >
              {t("companionCopyPayload")}
            </button>
          </>
        )}
      </div>

      {running && (
        <div className="flex flex-col items-start gap-3 sm:flex-row">
          <div
            className="rounded-xl border p-3"
            style={{
              backgroundColor: "#ffffff",
              borderColor: surface.insetBorder,
            }}
          >
            {qrDataUrl ? (
              <img
                src={qrDataUrl}
                alt="Companion pairing QR"
                width={220}
                height={220}
                className="block"
              />
            ) : (
              <div
                className="flex h-[220px] w-[220px] items-center justify-center text-sm"
                style={{ color: "#64748b" }}
              >
                …
              </div>
            )}
          </div>
          <div className="min-w-0 flex-1 space-y-2 text-sm" style={{ color: surface.panelText }}>
            <p style={{ color: surface.panelMutedText }}>{t("companionQrHint")}</p>
            {payload?.candidateIps && payload.candidateIps.length > 0 && (
              <p style={{ color: surface.panelMutedText }}>
                {t("companionCandidateIps")}: {payload.candidateIps.join(", ")}
              </p>
            )}
            {payload && (
              <pre
                className="max-h-40 overflow-auto rounded-lg border p-2 text-xs break-all whitespace-pre-wrap"
                style={fieldStyle(surface)}
              >
                {JSON.stringify(payload, null, 2)}
              </pre>
            )}
          </div>
        </div>
      )}

      <div
        className="space-y-2 rounded-lg px-3 py-3 text-sm"
        style={{ backgroundColor: surface.insetBg, color: surface.panelText }}
      >
        <h4 className="font-semibold">{t("companionUsbTitle")}</h4>
        <ol className="list-decimal space-y-1.5 pl-5" style={{ color: surface.panelMutedText }}>
          <li>{t("companionUsbStep1")}</li>
          <li>{t("companionUsbStep2")}</li>
          <li>{t("companionUsbStep3")}</li>
          <li>{t("companionUsbStep4")}</li>
          <li>{t("companionUsbStep5")}</li>
        </ol>
      </div>

      <div>
        <h4
          className="mb-2 text-sm font-semibold"
          style={{ color: surface.panelText }}
        >
          {t("companionPairedDevices")}
        </h4>
        {devices.length === 0 ? (
          <p className="text-sm" style={{ color: surface.panelMutedText }}>
            {t("companionNoDevices")}
          </p>
        ) : (
          <ul className="space-y-2">
            {devices.map((device) => (
              <li
                key={device.deviceId}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg px-3 py-2.5"
                style={{ backgroundColor: surface.insetBg }}
              >
                <div className="min-w-0 text-sm" style={{ color: surface.panelText }}>
                  <div className="font-medium">
                    {device.deviceName}
                    {device.revoked && (
                      <span
                        className="ml-2 text-xs font-normal"
                        style={{ color: surface.panelMutedText }}
                      >
                        ({t("companionDeviceRevokedBadge")})
                      </span>
                    )}
                  </div>
                  <div className="text-xs" style={{ color: surface.panelMutedText }}>
                    {t("companionLastSeen")}: {device.lastSeenAt}
                  </div>
                </div>
                {!device.revoked && (
                  <button
                    type="button"
                    className="rounded-lg border px-3 py-1.5 text-sm"
                    style={secondaryButtonStyle}
                    disabled={busy}
                    onClick={() => void revoke(device.deviceId)}
                  >
                    {t("companionRevoke")}
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      {error && (
        <p className="text-sm text-red-500" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

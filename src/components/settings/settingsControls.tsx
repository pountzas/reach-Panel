import {
  useEffect,
  useId,
  useState,
  type CSSProperties,
  type JSX,
  type ReactNode,
} from "react";
import { invoke } from "@tauri-apps/api/core";
import type { SurfaceColors } from "../../lib/colorProfiles";
import type { TranslationKey } from "../../i18n";
import { notify } from "../../lib/notify";
import { useTranslation } from "../../hooks/useTranslation";
import { AnimatedToggle } from "./AnimatedToggle";

// Shared style helper colocated with settings form controls.
// eslint-disable-next-line react-refresh/only-export-components -- style helper for settings fields
export const fieldStyle = (surface: SurfaceColors): CSSProperties => ({
  backgroundColor: surface.insetBg,
  borderColor: surface.insetBorder,
  color: surface.panelText,
});

type ColorFieldProps = {
  label: string;
  value: string;
  onChange: (value: string) => void;
  surface: SurfaceColors;
};

export const ColorField = ({
  label,
  value,
  onChange,
  surface,
}: ColorFieldProps): JSX.Element => {
  return (
    <label className="text-sm" style={{ color: surface.panelText }}>
      {label}
      <div className="mt-1 flex items-center gap-2">
        <input
          type="color"
          value={value}
          onChange={(e) => {
            onChange(e.target.value);
          }}
          className="h-9 w-12 cursor-pointer rounded border"
          style={{ borderColor: surface.insetBorder }}
        />
        <input
          type="text"
          value={value}
          onChange={(e) => {
            onChange(e.target.value);
          }}
          className="min-w-0 flex-1 rounded border px-2 py-1 text-xs"
          style={fieldStyle(surface)}
        />
      </div>
    </label>
  );
};

type ToggleRowProps = {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  surface: SurfaceColors;
  disabled?: boolean;
};

export const ToggleRow = ({
  label,
  checked,
  onChange,
  surface,
  disabled = false,
}: ToggleRowProps): JSX.Element => {
  const labelId = useId();

  return (
    <div
      role="presentation"
      className={`flex items-center justify-between gap-3 rounded-lg px-3 py-2.5 ${disabled ? "cursor-not-allowed opacity-60" : "cursor-pointer"}`}
      style={{ backgroundColor: surface.insetBg }}
      onClick={() => {
        if (disabled) return;
        onChange(!checked);
      }}>
      <span
        id={labelId}
        className="text-sm"
        style={{ color: surface.panelText }}>
        {label}
      </span>
      <AnimatedToggle
        checked={checked}
        disabled={disabled}
        onChange={onChange}
        surface={surface}
        aria-labelledby={labelId}
      />
    </div>
  );
};

type ThemedSelectProps = {
  value: string;
  onChange: (value: string) => void;
  surface: SurfaceColors;
  children: ReactNode;
  className?: string;
  disabled?: boolean;
};

export const ThemedSelect = ({
  value,
  onChange,
  surface,
  children,
  className = "mt-1 w-full rounded border px-2 py-1.5 text-sm",
  disabled = false,
}: ThemedSelectProps): JSX.Element => {
  return (
    <select
      className={className}
      style={fieldStyle(surface)}
      value={value}
      disabled={disabled}
      onChange={(e) => {
        onChange(e.target.value);
      }}>
      {children}
    </select>
  );
};

type WordPackInfo = {
  language: string;
  installed: boolean;
  version: number | null;
  bundled: boolean;
};

type WordPackDictionariesProps = {
  surface: SurfaceColors;
};

export const WordPackDictionaries = ({
  surface,
}: WordPackDictionariesProps): JSX.Element => {
  const { t } = useTranslation();
  const [packs, setPacks] = useState<WordPackInfo[]>([]);
  const [busyLang, setBusyLang] = useState<string | null>(null);

  const languageLabel = (lang: string): string => {
    const keys: Record<string, TranslationKey> = {
      en: "languageEnglish",
      el: "languageGreek",
      de: "languageGerman",
      fr: "languageFrench",
      it: "languageItalian",
      es: "languageSpanish",
      pt: "languagePortuguese",
    };
    const key = (keys as Record<string, TranslationKey | undefined>)[lang];
    return key ? t(key) : lang;
  };

  const refresh = async () => {
    const list = await invoke<WordPackInfo[]>("cmd_list_word_packs");
    setPacks(list);
  };

  useEffect((): void => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- load word packs on mount
    void refresh().catch((error: unknown) => {
      notify.error(error instanceof Error ? error.message : String(error));
    });
  }, []);

  const install = async (language: string) => {
    setBusyLang(language);
    try {
      const list = await invoke<WordPackInfo[]>("cmd_install_word_pack", {
        language,
      });
      setPacks(list);
    } catch (error) {
      notify.error(
        `${t("wordPackInstallFailed")}: ${error instanceof Error ? error.message : String(error)}`,
      );
    } finally {
      setBusyLang(null);
    }
  };

  const uninstall = async (language: string) => {
    setBusyLang(language);
    try {
      const list = await invoke<WordPackInfo[]>("cmd_uninstall_word_pack", {
        language,
      });
      setPacks(list);
    } catch (error) {
      notify.error(
        `${t("wordPackUninstallFailed")}: ${error instanceof Error ? error.message : String(error)}`,
      );
    } finally {
      setBusyLang(null);
    }
  };

  return (
    <div className="mt-4">
      <div className="text-sm font-medium" style={{ color: surface.panelText }}>
        {t("predictionDictionaries")}
      </div>
      <p
        className="mt-1 text-xs opacity-80"
        style={{ color: surface.panelText }}>
        {t("predictionDictionariesHint")}
      </p>
      <ul className="mt-2 space-y-2">
        {packs.map((pack) => {
          const busy = busyLang === pack.language;
          return (
            <li
              key={pack.language}
              className="flex items-center justify-between gap-2 rounded border px-2 py-1.5 text-sm"
              style={{
                borderColor: surface.panelBorder,
                backgroundColor: surface.panelButtonBg,
                color: surface.panelText,
              }}>
              <div className="min-w-0">
                <div className="font-medium">
                  {languageLabel(pack.language)}
                </div>
                <div className="text-xs opacity-75">
                  {pack.installed
                    ? pack.bundled
                      ? `${t("wordPackInstalled")} · ${t("wordPackRequired")}`
                      : t("wordPackInstalled")
                    : t("wordPackNotInstalled")}
                </div>
              </div>
              {pack.bundled ? null : pack.installed ? (
                <button
                  type="button"
                  className="shrink-0 rounded border px-2 py-1 text-xs"
                  style={{
                    borderColor: surface.panelBorder,
                    color: surface.panelText,
                  }}
                  disabled={busy}
                  onClick={() => void uninstall(pack.language)}>
                  {busy ? t("wordPackUninstalling") : t("wordPackUninstall")}
                </button>
              ) : (
                <button
                  type="button"
                  className="shrink-0 rounded border px-2 py-1 text-xs"
                  style={{
                    borderColor: surface.panelBorder,
                    color: surface.panelText,
                  }}
                  disabled={busy}
                  onClick={() => void install(pack.language)}>
                  {busy ? t("wordPackInstalling") : t("wordPackInstall")}
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
};

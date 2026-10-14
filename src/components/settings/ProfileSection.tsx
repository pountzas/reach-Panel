import { useState } from "react";
import { useShallow } from "zustand/react/shallow";
import type { SurfaceColors } from "../../lib/colorProfiles";
import { useTranslation } from "../../hooks/useTranslation";
import { useAppStore } from "../../stores/appStore";
import { SettingsSection } from "./SettingsSection";
import { fieldStyle, ThemedSelect } from "./settingsControls";
import { handleDeleteProfile, handleSaveProfile } from "./settingsPanelUtils";

type ProfileSectionProps = {
  surface: SurfaceColors;
  headerBg: string;
  headerText: string;
};

export function ProfileSection({ surface, headerBg, headerText }: ProfileSectionProps) {
  const { t } = useTranslation();
  const [newProfileName, setNewProfileName] = useState<string>("");
  const {
    settings,
    profileFiles,
    activeProfileFile,
    setProfileFile,
    createProfileFile,
    deleteProfileFile,
    saveActiveProfile,
  } = useAppStore(
    useShallow((s) => ({
      settings: s.settings,
      profileFiles: s.profileFiles,
      activeProfileFile: s.activeProfileFile,
      setProfileFile: s.setProfileFile,
      createProfileFile: s.createProfileFile,
      deleteProfileFile: s.deleteProfileFile,
      saveActiveProfile: s.saveActiveProfile,
    })),
  );

  if (!settings) return null;

  return (
    <SettingsSection title={t("profile")} surface={surface}>
      <ThemedSelect
        value={activeProfileFile ?? ""}
        onChange={(v) => setProfileFile(v)}
        surface={surface}
        className="w-full rounded border px-2 py-2 text-sm"
      >
        {profileFiles.map((p) => (
          <option key={p.filename} value={p.filename}>
            {p.name} ({p.filename})
          </option>
        ))}
      </ThemedSelect>
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          className="rounded-lg px-3 py-1.5 text-sm"
          style={{ backgroundColor: headerBg, color: headerText }}
          onClick={() => void handleSaveProfile(saveActiveProfile, t)}
        >
          {t("saveProfile")}
        </button>
        <button
          type="button"
          className="rounded-lg border border-red-300 px-3 py-1.5 text-sm font-medium text-red-700"
          style={{ backgroundColor: surface.insetBg }}
          onClick={() => void handleDeleteProfile(activeProfileFile, deleteProfileFile, t)}
          disabled={!activeProfileFile}
        >
          {t("deleteProfile")}
        </button>
      </div>
      <div className="mt-3 flex gap-2">
        <input
          className="min-w-0 flex-1 rounded border px-2 py-1.5 text-sm"
          style={fieldStyle(surface)}
          placeholder={t("newProfileFileName")}
          value={newProfileName}
          onChange={(e) => setNewProfileName(e.target.value)}
        />
        <button
          type="button"
          className="shrink-0 rounded-lg px-3 py-1.5 text-sm"
          style={{ backgroundColor: headerBg, color: headerText }}
          onClick={() => {
            if (!newProfileName.trim()) return;
            void createProfileFile(newProfileName.trim(), newProfileName.trim());
            setNewProfileName("");
          }}
        >
          {t("createProfile")}
        </button>
      </div>
    </SettingsSection>
  );
}

import { MicrophoneIcon } from "../common/SectionIcons";
import { ModeToggleButton, ModeToggleGroup } from "../common/ModeToggle";
import { useAppStore } from "../../stores/appStore";
import { useTranslation } from "../../hooks/useTranslation";
import { DictationVisualizer } from "./DictationVisualizer";

export function DictationButton() {
  const { dictationState, toggleDictation } = useAppStore();
  const { t } = useTranslation();
  const listening = dictationState === "listening";

  return (
    <>
      <DictationVisualizer active={listening} />
      <ModeToggleGroup>
        <ModeToggleButton
          active={listening}
          position="only"
          label={listening ? t("dictationStop") : t("dictationStart")}
          activeClassName={
            listening ? "bg-red-600 text-white" : "bg-white text-slate-700"
          }
          onClick={() => void toggleDictation()}
        >
          <MicrophoneIcon className="h-4 w-4" />
        </ModeToggleButton>
      </ModeToggleGroup>
    </>
  );
}

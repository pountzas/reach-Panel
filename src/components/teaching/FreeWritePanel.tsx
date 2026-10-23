import { useShallow } from "zustand/react/shallow";
import { getSurfaceColors } from "../../lib/colorProfiles";
import { useAppStore } from "../../stores/appStore";
import {
  DEFAULT_TEACHING_LESSON_LEFT_RATIO,
  TeachingLessonPane,
  TeachingLessonPanel,
} from "./TeachingLessonPanel";
import { FreeWriteNotepad } from "./FreeWriteNotepad";
import { FreeWritePdfPane } from "./FreeWritePdfPane";

/** Language → Free write: notepad (left) + PDF library/viewer (right). */
export function FreeWritePanel() {
  const { appBgColor, freeWriteLeftRatio, updateSettings } = useAppStore(
    useShallow((s) => ({
      appBgColor: s.settings.appBgColor,
      freeWriteLeftRatio: s.settings.freeWriteLeftRatio,
      updateSettings: s.updateSettings,
    })),
  );
  const surface = getSurfaceColors(appBgColor);
  const leftRatio = freeWriteLeftRatio ?? DEFAULT_TEACHING_LESSON_LEFT_RATIO;

  return (
    <TeachingLessonPanel
      surface={surface}
      leftRatio={leftRatio}
      onLeftRatioChange={(freeWriteLeftRatio) =>
        void updateSettings({ freeWriteLeftRatio })
      }
      left={
        <TeachingLessonPane padded>
          <FreeWriteNotepad />
        </TeachingLessonPane>
      }
      right={
        <TeachingLessonPane padded>
          <FreeWritePdfPane />
        </TeachingLessonPane>
      }
    />
  );
}

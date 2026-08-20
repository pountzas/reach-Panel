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
  const settings = useAppStore((s) => s.settings);
  const updateSettings = useAppStore((s) => s.updateSettings);
  const surface = getSurfaceColors(settings.appBgColor);
  const leftRatio = settings.freeWriteLeftRatio ?? DEFAULT_TEACHING_LESSON_LEFT_RATIO;

  return (
    <TeachingLessonPanel
      surface={surface}
      leftRatio={leftRatio}
      onLeftRatioChange={(freeWriteLeftRatio) => void updateSettings({ freeWriteLeftRatio })}
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

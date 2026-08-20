import { HeaderIconToggleGroup } from "../common/HeaderIconToggleGroup";
import { TeachingLessonIcon } from "../common/SectionIcons";
import { useAppStore, type TeachingLesson } from "../../stores/appStore";
import { useTranslation } from "../../hooks/useTranslation";

/** Language / Music / Math controls for the teaching section header. */
export function TeachingLessonModeToggle() {
  const teachingLesson = useAppStore((s) => s.teachingLesson);
  const setTeachingLesson = useAppStore((s) => s.setTeachingLesson);
  const { t } = useTranslation();

  return (
    <HeaderIconToggleGroup<TeachingLesson>
      value={teachingLesson}
      onChange={setTeachingLesson}
      options={[
        {
          id: "language",
          label: t("teachingLessonLanguage"),
          icon: (iconClass) => (
            <TeachingLessonIcon lesson="language" className={iconClass} />
          ),
        },
        {
          id: "music",
          label: t("teachingLessonMusic"),
          icon: (iconClass) => (
            <TeachingLessonIcon lesson="music" className={iconClass} />
          ),
        },
        {
          id: "math",
          label: t("teachingLessonMath"),
          icon: (iconClass) => (
            <TeachingLessonIcon lesson="math" className={iconClass} />
          ),
        },
      ]}
    />
  );
}

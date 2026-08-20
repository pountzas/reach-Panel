export function isLanguageLessonActive(input: {
  musicTeachingEnabled: boolean;
  teachingLesson: "music" | "math" | "language";
  settings: { keyboardSectionMode?: string };
}): boolean {
  return (
    input.musicTeachingEnabled &&
    input.settings.keyboardSectionMode === "synthesizer" &&
    input.teachingLesson === "language"
  );
}

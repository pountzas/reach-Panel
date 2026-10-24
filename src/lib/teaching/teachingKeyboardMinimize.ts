export type TeachingKeyboardChromeInput = {
  musicTeachingEnabled: boolean;
  teachingLesson: "music" | "math" | "language";
};

/** Center Minimize/Focus chrome only in Teaching → Language or Mathematics. */
export function isTeachingKeyboardChromeVisible(
  input: TeachingKeyboardChromeInput,
): boolean {
  if (!input.musicTeachingEnabled) return false;
  return input.teachingLesson === "language" || input.teachingLesson === "math";
}

export type TeachingKeyboardMinimizeAction =
  | { type: "setAutoFocus"; value: boolean }
  | { type: "setMinimized"; value: boolean }
  | { type: "reset" };

export type TeachingKeyboardMinimizeState = {
  teachingKeyboardMinimized: boolean;
  teachingKeyboardAutoFocus: boolean;
};

export function nextTeachingKeyboardMinimizeState(input: {
  teachingKeyboardMinimized: boolean;
  teachingKeyboardAutoFocus: boolean;
  action: TeachingKeyboardMinimizeAction;
}): TeachingKeyboardMinimizeState {
  const { action } = input;
  switch (action.type) {
    case "setAutoFocus":
      return {
        teachingKeyboardAutoFocus: action.value,
        teachingKeyboardMinimized: action.value
          ? true
          : input.teachingKeyboardMinimized,
      };
    case "setMinimized":
      return {
        teachingKeyboardAutoFocus: input.teachingKeyboardAutoFocus,
        teachingKeyboardMinimized: action.value,
      };
    case "reset":
      return {
        teachingKeyboardMinimized: false,
        teachingKeyboardAutoFocus: false,
      };
    default: {
      const _exhaustive: never = action;
      return _exhaustive;
    }
  }
}

/** In-app typing targets that should restore a Focus-minimized keyboard. */
export function isTeachingKeyboardTypingTargetActive(input: {
  freeWriteCapture: boolean;
  spellingCapture: boolean;
}): boolean {
  return input.freeWriteCapture || input.spellingCapture;
}

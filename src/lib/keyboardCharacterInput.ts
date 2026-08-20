import type { LessonLanguage } from "./language/types";
import {
  applyGreekKeystroke,
  type GreekPendingAccent,
} from "./language/greekCompose";

export type CharacterInputResult = {
  buffer: string;
  pendingAccent: GreekPendingAccent | null;
  /** Text to inject into the target app; empty when nothing should be sent. */
  inject: string;
};

export type GreekComposeContext = {
  typingLanguage?: string;
  keyboardLayout?: string;
  onscreenLayout?: string;
  languageLessonActive?: boolean;
  lessonLanguage?: LessonLanguage;
};

/** True when the on-screen keyboard is operating as a Greek (EL) layout. */
export function greekComposeEnabled(ctx: GreekComposeContext): boolean {
  const primary = ctx.typingLanguage?.toLowerCase().split("-")[0] ?? "";
  if (primary === "el") return true;
  if (ctx.keyboardLayout?.toLowerCase() === "greek") return true;
  if (ctx.onscreenLayout === "Greek") return true;
  if (ctx.onscreenLayout === "auto" && primary === "el") return true;
  if (ctx.languageLessonActive && ctx.lessonLanguage === "el") return true;
  return false;
}

export function processCharacterInput(
  buffer: string,
  pendingAccent: GreekPendingAccent | null,
  output: string,
  options: {
    physicalKey?: string;
    greekCompose: boolean;
  },
): CharacterInputResult {
  if (output.length === 1 && /\s/u.test(output)) {
    return {
      buffer: buffer + output,
      pendingAccent: null,
      inject: output,
    };
  }

  const compose =
    options.greekCompose || pendingAccent !== null;

  if (compose) {
    if (output.length > 1) {
      return { buffer, pendingAccent, inject: "" };
    }
    if (output.length === 0 && !options.physicalKey) {
      return { buffer, pendingAccent, inject: "" };
    }

    const prevLen = buffer.length;
    const result = applyGreekKeystroke(
      buffer,
      pendingAccent,
      output,
      options.physicalKey,
    );
    return {
      buffer: result.buffer,
      pendingAccent: result.pending,
      inject: result.buffer.slice(prevLen),
    };
  }

  if (output.length !== 1) {
    return { buffer, pendingAccent: null, inject: "" };
  }

  return {
    buffer: buffer + output,
    pendingAccent: null,
    inject: output,
  };
}

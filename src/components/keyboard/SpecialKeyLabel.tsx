import { KEYBOARD_FONT_SIZE_DEFAULT } from "../../lib/keyboardFontSize";
import { SPECIAL_KEY_LABELS } from "../../lib/keyboardLayouts";

export function SpecialKeyLabel({
  keyName,
  fontSize,
}: {
  keyName: string;
  fontSize: number;
}) {
  const spec = SPECIAL_KEY_LABELS[keyName];
  if (!spec) return null;

  const useRow =
    spec.layout === "row" || fontSize > KEYBOARD_FONT_SIZE_DEFAULT;
  const wordSize = Math.max(
    8,
    Math.round(fontSize * (useRow ? 0.72 : 0.52)),
  );

  if (useRow) {
    if (keyName === "space") {
      const spaceSymbolSize = Math.max(14, Math.round(fontSize * 1.2));
      const spaceWordSize = Math.max(11, Math.round(fontSize * 0.72));
      return (
        <span className="flex min-w-0 max-w-full items-end justify-center gap-2 overflow-hidden whitespace-nowrap leading-none">
          <span
            className="shrink-0"
            style={{ fontSize: spaceSymbolSize, paddingBottom: "3px" }}
            aria-hidden
          >
            {spec.symbol}
          </span>
          <span
            className="min-w-0 truncate font-semibold"
            style={{ fontSize: spaceWordSize }}
          >
            {spec.word}
          </span>
        </span>
      );
    }

    return (
      <span className="flex min-w-0 max-w-full items-center justify-center gap-1.5 overflow-hidden whitespace-nowrap leading-none">
        <span className="shrink-0" style={{ fontSize }} aria-hidden>
          {spec.symbol}
        </span>
        <span
          className="min-w-0 truncate font-semibold"
          style={{ fontSize: wordSize }}
        >
          {spec.word}
        </span>
      </span>
    );
  }

  return (
    <span className="flex flex-col items-center justify-center leading-none">
      <span style={{ fontSize }} aria-hidden>
        {spec.symbol}
      </span>
      <span className="mt-0.5 font-semibold" style={{ fontSize: wordSize }}>
        {spec.word}
      </span>
    </span>
  );
}

export function specialKeyAriaLabel(keyName: string): string | undefined {
  return SPECIAL_KEY_LABELS[keyName]?.word;
}

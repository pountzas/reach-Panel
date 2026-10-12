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

  const wordSize = Math.max(8, Math.round(fontSize * 0.72));

  if (spec.layout === "row") {
    return (
      <span className="flex items-center justify-center gap-1.5 leading-none">
        <span style={{ fontSize }} aria-hidden>
          {spec.symbol}
        </span>
        <span className="font-semibold" style={{ fontSize: wordSize }}>
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

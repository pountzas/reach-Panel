import { useTranslation } from "../../hooks/useTranslation";

export type FocusModeHintBubbleProps = {
  onDismiss: () => void;
};

export function FocusModeHintBubble({ onDismiss }: FocusModeHintBubbleProps) {
  const { t } = useTranslation();
  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-auto max-w-[268px] shrink-0 rounded bg-slate-800 px-3 py-2 text-xs text-white shadow-lg"
      style={{ width: 268 }}>
      <p>{t("focusModeHiddenTip")}</p>
      <button
        type="button"
        className="mt-2 rounded border border-white/30 px-2 py-0.5 text-[11px] font-semibold hover:bg-white/10"
        onClick={onDismiss}>
        {t("dontShowAgain")}
      </button>
    </div>
  );
}

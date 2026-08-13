import { useCallback, useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";
import { createPortal } from "react-dom";
import { Flag } from "svg-flags";
import type { InputMethod, OnscreenLayoutOption } from "../../lib/keyboardLayouts";
import {
  flagCodeForLanguage,
  languageDisplayCode,
  ONSCREEN_LAYOUT_OPTIONS,
} from "../../lib/keyboardLayouts";
import { computeLanguagePickerPosition } from "../../lib/languagePickerPosition";

interface LanguagePickerProps {
  anchorRef: RefObject<HTMLElement | null>;
  methods: InputMethod[];
  activeHkl: number;
  onscreenLayout: OnscreenLayoutOption;
  onSelectLanguage: (method: InputMethod) => void;
  onSelectLayout: (layout: OnscreenLayoutOption) => void;
  onClose: () => void;
  fontSize: number;
  textColor: string;
  bgColor: string;
  mutedColor: string;
  layoutSectionLabel: string;
  languageSectionLabel: string;
  autoLayoutLabel: string;
}

export function LanguagePicker({
  anchorRef,
  methods,
  activeHkl,
  onscreenLayout,
  onSelectLanguage,
  onSelectLayout,
  onClose,
  fontSize,
  textColor,
  bgColor,
  mutedColor,
  layoutSectionLabel,
  languageSectionLabel,
  autoLayoutLabel,
}: LanguagePickerProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<{ left: number; top: number } | null>(null);

  const reposition = useCallback(() => {
    const anchor = anchorRef.current;
    const popup = rootRef.current;
    if (!anchor || !popup) return;

    const anchorRect = anchor.getBoundingClientRect();
    const popupRect = popup.getBoundingClientRect();
    setPosition(
      computeLanguagePickerPosition(
        {
          left: anchorRect.left,
          top: anchorRect.top,
          width: anchorRect.width,
          height: anchorRect.height,
        },
        { width: popupRect.width, height: popupRect.height },
        { width: window.innerWidth, height: window.innerHeight },
      ),
    );
  }, [anchorRef]);

  useLayoutEffect(() => {
    reposition();
  }, [reposition, methods.length, onscreenLayout]);

  useEffect(() => {
    window.addEventListener("resize", reposition);
    window.addEventListener("scroll", reposition, true);
    return () => {
      window.removeEventListener("resize", reposition);
      window.removeEventListener("scroll", reposition, true);
    };
  }, [reposition]);

  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (rootRef.current?.contains(target)) return;
      if (anchorRef.current?.contains(target)) return;
      onClose();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("pointerdown", onPointerDown, true);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown, true);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [anchorRef, onClose]);

  const itemStyle = (selected: boolean) => ({
    backgroundColor: selected ? "rgba(59, 130, 246, 0.18)" : "transparent",
    fontWeight: selected ? 600 : 400,
  });

  const picker = (
    <div
      ref={rootRef}
      className="fixed z-[80] max-h-72 min-w-[14rem] overflow-y-auto rounded-lg border shadow-lg"
      style={{
        left: position?.left ?? 0,
        top: position?.top ?? 0,
        visibility: position ? "visible" : "hidden",
        backgroundColor: bgColor,
        borderColor: mutedColor,
        color: textColor,
        fontSize: Math.max(12, fontSize - 2),
      }}
      role="dialog"
      aria-label="Keyboard language and layout"
    >
      <div
        className="px-3 py-1.5 text-[0.75em] font-semibold uppercase tracking-wide"
        style={{ color: mutedColor }}
      >
        {languageSectionLabel}
      </div>
      {methods.length === 0 ? (
        <div className="px-3 py-2" style={{ color: mutedColor }}>
          No keyboard languages found
        </div>
      ) : (
        methods.map((method) => {
          const selected = method.hkl === activeHkl;
          const flag = flagCodeForLanguage(method.langTag);
          return (
            <button
              key={`${method.hkl}-${method.klid}`}
              type="button"
              role="option"
              aria-selected={selected}
              className="flex w-full items-center gap-2 px-3 py-2 text-left hover:brightness-95"
              style={itemStyle(selected)}
              onClick={() => onSelectLanguage(method)}
            >
              <Flag
                country={flag}
                width={Math.max(16, fontSize)}
                alt={method.displayName}
                showBorder
                borderWidth={1}
              />
              <span className="min-w-0 flex-1 truncate">
                {method.displayName}
                <span className="ml-1 opacity-70">({method.layoutName})</span>
              </span>
              <span className="shrink-0 opacity-80">
                {languageDisplayCode(method.langTag)}
              </span>
            </button>
          );
        })
      )}

      <div
        className="mt-1 border-t px-3 py-1.5 text-[0.75em] font-semibold uppercase tracking-wide"
        style={{ borderColor: mutedColor, color: mutedColor }}
      >
        {layoutSectionLabel}
      </div>
      {ONSCREEN_LAYOUT_OPTIONS.map((layout) => {
        const selected = onscreenLayout === layout;
        const label = layout === "auto" ? autoLayoutLabel : layout;
        return (
          <button
            key={layout}
            type="button"
            role="option"
            aria-selected={selected}
            className="flex w-full items-center gap-2 px-3 py-2 text-left hover:brightness-95"
            style={itemStyle(selected)}
            onClick={() => onSelectLayout(layout)}
          >
            <span className="min-w-0 flex-1 truncate">{label}</span>
          </button>
        );
      })}
    </div>
  );

  return createPortal(picker, document.body);
}

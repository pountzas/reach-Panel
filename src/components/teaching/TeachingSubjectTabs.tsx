import { useRef, type KeyboardEvent, type ReactNode } from "react";
import { HoverTooltip } from "../common/HoverTooltip";
import { getSurfaceColors } from "../../lib/colorProfiles";
import { useAppStore } from "../../stores/appStore";

export type TeachingSubjectTabOrientation = "horizontal" | "vertical";

export type TeachingSubjectTabOption<T extends string = string> = {
  id: T;
  label: string;
  /** When set with vertical orientation, shown instead of the text label. */
  icon?: ReactNode;
}

/**
 * Chrome-style subject tabs attached under the teaching section header.
 * Hidden when ≤1 tab. Pulls flush against the header by canceling the
 * section content `p-1` padding.
 *
 * Pass `orientation="vertical"` for a left icon rail (Language Spelling / Free write).
 */
export function TeachingSubjectTabs<T extends string>({
  tabs,
  activeId,
  onChange,
  orientation = "horizontal",
}: {
  tabs: TeachingSubjectTabOption<T>[];
  activeId: T;
  onChange: (id: T) => void;
  orientation?: TeachingSubjectTabOrientation;
}) {
  const settings = useAppStore((s) => s.settings);
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);
  if (tabs.length <= 1) return null;

  const surface = getSurfaceColors(settings.appBgColor);
  const vertical = orientation === "vertical";

  const moveActive = (delta: 1 | -1) => {
    const index = tabs.findIndex((tab) => tab.id === activeId);
    if (index < 0) return;
    const nextIndex = (index + delta + tabs.length) % tabs.length;
    const next = tabs[nextIndex];
    onChange(next.id);
    tabRefs.current[nextIndex]?.focus();
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (vertical) {
      if (event.key === "ArrowDown") {
        event.preventDefault();
        moveActive(1);
        return;
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        moveActive(-1);
        return;
      }
      return;
    }
    if (event.key === "ArrowRight") {
      event.preventDefault();
      moveActive(1);
      return;
    }
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      moveActive(-1);
    }
  };

  if (vertical) {
    return (
      <div
        className="-my-1 -ml-1 mr-1 flex w-11 shrink-0 flex-col items-center gap-0.5 border-r px-1 py-1.5"
        style={{
          borderColor: surface.panelBorder,
          backgroundColor: surface.panelHeaderBg,
        }}
        role="tablist"
        tabIndex={-1}
        aria-label="Teaching subject tabs"
        aria-orientation="vertical"
        onKeyDown={onKeyDown}
      >
        {tabs.map((tab, i) => {
          const active = tab.id === activeId;
          return (
            <button
              key={tab.id}
              ref={(el) => {
                tabRefs.current[i] = el;
              }}
              type="button"
              role="tab"
              aria-selected={active}
              aria-label={tab.label}
              tabIndex={active ? 0 : -1}
              className="group relative flex h-9 w-9 shrink-0 items-center justify-center rounded-md border"
              style={{
                borderColor: active ? surface.panelBorder : "transparent",
                backgroundColor: active
                  ? (settings.headerBgColor ?? surface.panelHeaderBg)
                  : "transparent",
                color: active ? "#ffffff" : surface.panelMutedText,
              }}
              onClick={() => { onChange(tab.id); }}
            >
              {tab.icon ?? tab.label}
              <HoverTooltip label={tab.label} placement="below" align="start" />
            </button>
          );
        })}
      </div>
    );
  }

  return (
    <div
      className="-mx-1 -mt-1 mb-1 flex shrink-0 items-end gap-0.5 border-b px-2 pt-1.5"
      style={{
        borderColor: surface.panelBorder,
        backgroundColor: surface.panelHeaderBg,
      }}
      role="tablist"
      tabIndex={0}
      aria-label="Teaching subject tabs"
      onKeyDown={onKeyDown}
    >
      {tabs.map((tab, i) => {
        const active = tab.id === activeId;
        return (
          <button
            key={tab.id}
            ref={(el) => {
              tabRefs.current[i] = el;
            }}
            type="button"
            role="tab"
            aria-selected={active}
            tabIndex={active ? 0 : -1}
            className="relative h-9 min-w-[7.5rem] max-w-[12rem] truncate rounded-t-lg border px-3 text-sm font-medium"
            style={{
              borderColor: surface.panelBorder,
              borderBottomColor: active
                ? (settings.headerBgColor ?? surface.panelHeaderBg)
                : "transparent",
              backgroundColor: active
                ? (settings.headerBgColor ?? surface.panelHeaderBg)
                : "transparent",
              color: active ? "#ffffff" : surface.panelMutedText,
              marginBottom: -1,
              zIndex: active ? 1 : 0,
            }}
            onClick={() => { onChange(tab.id); }}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}

/** Optional subject tabs above (or beside) a teaching panel body. */
export function TeachingSubjectShell<T extends string>({
  tabs,
  activeId,
  onChange,
  children,
  orientation = "horizontal",
}: {
  tabs: TeachingSubjectTabOption<T>[];
  activeId: T;
  onChange: (id: T) => void;
  children: ReactNode;
  orientation?: TeachingSubjectTabOrientation;
}) {
  const vertical = orientation === "vertical";
  return (
    <div
      className={
        vertical
          ? "flex h-full min-h-0 flex-row"
          : "flex h-full min-h-0 flex-col"
      }
    >
      <TeachingSubjectTabs
        tabs={tabs}
        activeId={activeId}
        onChange={onChange}
        orientation={orientation}
      />
      <div className="min-h-0 min-w-0 flex-1">{children}</div>
    </div>
  );
}

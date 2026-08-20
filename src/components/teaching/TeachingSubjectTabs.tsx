import type { ReactNode } from "react";
import { getSurfaceColors } from "../../lib/colorProfiles";
import { useAppStore } from "../../stores/appStore";

export type TeachingSubjectTabOption<T extends string = string> = {
  id: T;
  label: string;
};

/**
 * Chrome-style subject tabs attached under the teaching section header.
 * Hidden when ≤1 tab. Pulls flush against the header by canceling the
 * section content `p-1` padding.
 */
export function TeachingSubjectTabs<T extends string>({
  tabs,
  activeId,
  onChange,
}: {
  tabs: TeachingSubjectTabOption<T>[];
  activeId: T;
  onChange: (id: T) => void;
}) {
  const settings = useAppStore((s) => s.settings);
  if (tabs.length <= 1) return null;

  const surface = getSurfaceColors(settings.appBgColor);

  return (
    <div
      className="-mx-1 -mt-1 mb-1 flex shrink-0 items-end gap-0.5 border-b px-2 pt-1.5"
      style={{
        borderColor: surface.panelBorder,
        backgroundColor: surface.panelHeaderBg,
      }}
      role="tablist"
      aria-label="Teaching subject tabs"
    >
      {tabs.map((tab) => {
        const active = tab.id === activeId;
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={active}
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
            onClick={() => onChange(tab.id)}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}

/** Optional subject tabs above a teaching panel body. */
export function TeachingSubjectShell<T extends string>({
  tabs,
  activeId,
  onChange,
  children,
}: {
  tabs: TeachingSubjectTabOption<T>[];
  activeId: T;
  onChange: (id: T) => void;
  children: ReactNode;
}) {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <TeachingSubjectTabs tabs={tabs} activeId={activeId} onChange={onChange} />
      <div className="min-h-0 flex-1">{children}</div>
    </div>
  );
}

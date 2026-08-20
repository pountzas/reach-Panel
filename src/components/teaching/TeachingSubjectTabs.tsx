import type { ReactNode } from "react";
import { getSurfaceColors } from "../../lib/colorProfiles";
import { useAppStore } from "../../stores/appStore";

export type TeachingSubjectTabOption<T extends string = string> = {
  id: T;
  label: string;
};

/** Horizontal subject tabs under the teaching section header. Hidden when ≤1 tab. */
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
      className="flex shrink-0 items-center gap-1 border-b px-2 py-1.5"
      style={{ borderColor: surface.panelBorder, backgroundColor: surface.panelBg }}
      role="tablist"
    >
      {tabs.map((tab) => {
        const active = tab.id === activeId;
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={active}
            className="h-10 min-w-[7rem] rounded-md border px-3 text-sm font-medium"
            style={{
              borderColor: surface.panelBorder,
              backgroundColor: active ? (settings.headerBgColor ?? surface.panelBg) : "transparent",
              color: active ? surface.panelText : surface.panelMutedText,
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

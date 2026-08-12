import type { CSSProperties, ReactNode } from "react";
import { useLongPressWindowDrag } from "../../hooks/useLongPressWindowDrag";
import { useTranslation } from "../../hooks/useTranslation";

interface ToolWindowHeaderProps {
  title: ReactNode;
  actions: ReactNode;
  style?: CSSProperties;
  className?: string;
}

/** Undecorated tool-window chrome: drag header like a normal title bar. */
export function ToolWindowHeader({
  title,
  actions,
  style,
  className = "flex shrink-0 items-center justify-between px-4 py-3",
}: ToolWindowHeaderProps) {
  const { t } = useTranslation();
  const dragHandlers = useLongPressWindowDrag();

  return (
    <div
      className={`${className} cursor-grab active:cursor-grabbing`}
      style={style}
      title={t("dragToMove")}
      {...dragHandlers}
    >
      <h2 className="pointer-events-none text-lg font-bold select-none">{title}</h2>
      <div className="section-no-drag flex shrink-0 cursor-default items-center gap-1">
        {actions}
      </div>
    </div>
  );
}

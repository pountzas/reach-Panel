import { createContext, useContext, useState, type ReactNode } from "react";
import { useTranslation } from "../../hooks/useTranslation";

interface LayoutResizeContextValue {
  resizeMode: boolean;
  toggleResizeMode: () => void;
}

const LayoutResizeContext = createContext<LayoutResizeContextValue>({
  resizeMode: false,
  toggleResizeMode: () => {},
});

export function LayoutResizeProvider({ children }: { children: ReactNode }) {
  const [resizeMode, setResizeMode] = useState(false);
  return (
    <LayoutResizeContext.Provider
      value={{
        resizeMode,
        toggleResizeMode: () => setResizeMode((v) => !v),
      }}
    >
      {children}
    </LayoutResizeContext.Provider>
  );
}

export function useLayoutResize() {
  return useContext(LayoutResizeContext);
}

interface SectionPanelProps {
  children: ReactNode;
  className?: string;
}

export function SectionPanel({ children, className = "" }: SectionPanelProps) {
  const { resizeMode, toggleResizeMode } = useLayoutResize();
  const { t } = useTranslation();

  return (
    <div className={`relative flex h-full min-h-0 flex-col ${className}`}>
      <button
        type="button"
        className={`absolute right-1 top-1 z-10 rounded px-2 py-0.5 text-xs shadow-sm ${
          resizeMode ? "bg-slate-700 text-white" : "bg-white/90 text-slate-700"
        }`}
        onClick={toggleResizeMode}
        aria-pressed={resizeMode}
        title={resizeMode ? t("resizeDone") : t("resizeSection")}
      >
        {resizeMode ? t("resizeDone") : t("resizeSection")}
      </button>
      <div className="min-h-0 flex-1 overflow-auto pt-6">{children}</div>
    </div>
  );
}

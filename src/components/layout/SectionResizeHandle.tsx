import { Separator } from "react-resizable-panels";
import { useLayoutResize } from "./SectionPanel";

export function SectionResizeHandle() {
  const { resizeMode } = useLayoutResize();

  if (!resizeMode) {
    return <div className="h-0 shrink-0" />;
  }

  return (
    <Separator className="group flex h-2 shrink-0 items-center justify-center bg-slate-200/80 hover:bg-slate-300">
      <div className="h-1 w-10 rounded-full bg-slate-400 group-hover:bg-slate-600" />
    </Separator>
  );
}

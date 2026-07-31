import { useEffect } from "react";
import toast, { Toaster, useToasterStore } from "react-hot-toast";
import { getSurfaceColors } from "../../lib/colorProfiles";
import { useAppStore } from "../../stores/appStore";

const MAX_VISIBLE_TOASTS = 3;

export function AppToaster() {
  const appBgColor = useAppStore((s) => s.settings.appBgColor);
  const surface = getSurfaceColors(appBgColor);
  const { toasts } = useToasterStore();

  useEffect(() => {
    // Newest toasts are first; dismiss oldest beyond the cap.
    const visible = toasts.filter((t) => t.visible);
    if (visible.length <= MAX_VISIBLE_TOASTS) return;
    for (const t of visible.slice(MAX_VISIBLE_TOASTS)) {
      toast.dismiss(t.id);
    }
  }, [toasts]);

  return (
    <Toaster
      position="top-center"
      toastOptions={{
        className: "text-sm",
        style: {
          background: surface.panelBg,
          color: surface.panelText,
          border: `1px solid ${surface.panelBorder}`,
          boxShadow: "0 4px 14px rgba(0,0,0,0.12)",
        },
        success: {
          iconTheme: {
            primary: "#15803d",
            secondary: surface.panelBg,
          },
        },
        error: {
          iconTheme: {
            primary: "#b91c1c",
            secondary: surface.panelBg,
          },
          style: {
            background: surface.panelBg,
            color: surface.panelText,
            border: "1px solid #fca5a5",
          },
        },
      }}
    />
  );
}

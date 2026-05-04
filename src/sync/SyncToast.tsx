import { useEffect } from "react";
import { CheckCircle2, XCircle } from "lucide-react";
import { useSyncStore } from "./syncStore";

export function SyncToast() {
  const toast = useSyncStore((s) => s.toast);
  const dismissToast = useSyncStore((s) => s.dismissToast);

  useEffect(() => {
    if (!toast.visible) return;
    const timer = setTimeout(dismissToast, 4000);
    return () => clearTimeout(timer);
  }, [toast.visible, dismissToast]);

  if (!toast.visible) return null;

  return (
    <div
      className="sync-toast"
      style={{
        position: "fixed",
        bottom: 48,
        left: "50%",
        transform: "translateX(-50%)",
        zIndex: 60,
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "10px 20px",
        borderRadius: "var(--radius-md)",
        background: "var(--color-bg-surface)",
        border: `1px solid ${toast.success ? "#16a34a" : "#ef4444"}`,
        boxShadow: "var(--shadow-lg)",
        fontSize: 13,
        color: "var(--color-text-primary)",
        maxWidth: "calc(100vw - 40px)",
      }}
    >
      {toast.success ? (
        <CheckCircle2 size={16} color="#16a34a" />
      ) : (
        <XCircle size={16} color="#ef4444" />
      )}
      <span style={{ overflowWrap: "anywhere", lineHeight: 1.4 }}>
        {toast.message}
      </span>
    </div>
  );
}

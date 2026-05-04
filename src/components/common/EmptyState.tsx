import { useTranslation } from "react-i18next";
import { FileText } from "lucide-react";

export function EmptyState() {
  const { t } = useTranslation();
  return (
    <div className="empty-state flex flex-col items-center justify-center gap-4 select-none" style={{ minHeight: "60vh" }}>
      <div className="w-20 h-20 rounded-[var(--radius-lg)] bg-[var(--color-accent-bg)] flex items-center justify-center">
        <FileText size={36} className="text-[var(--color-primary)]" strokeWidth={1.5} />
      </div>
      <div className="text-center">
        <p className="text-[15px] font-medium text-[var(--color-text-secondary)]">
          {t("editor.noFileOpen")}
        </p>
        <p className="text-[13px] text-[var(--color-text-muted)] mt-1">
          {t("editor.createNew")}
        </p>
      </div>
    </div>
  );
}

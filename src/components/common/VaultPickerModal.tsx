import { useState } from "react";
import { useTranslation } from "react-i18next";
import { FolderOpen, Sparkles } from "lucide-react";
import { useVaultStore } from "@/stores/vaultStore";
import { pathBasename } from "@/lib/tauriCommands";

interface VaultPickerModalProps {
  openVaultPath: (path: string) => Promise<void>;
  onClose: () => void;
}

function sanitizeVaultName(name: string): string {
  return name
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9\-_一-鿿]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    || "my-vault";
}

export function VaultPickerModal({ openVaultPath, onClose }: VaultPickerModalProps) {
  const { t } = useTranslation();
  const recentVaults = useVaultStore((s) => s.recentVaults);
  const [nameValue, setNameValue] = useState("");
  const [creating, setCreating] = useState(false);

  const sanitized = sanitizeVaultName(nameValue);
  const canCreate = nameValue.trim().length > 0;

  const handleCreate = async () => {
    if (!canCreate || creating) return;
    setCreating(true);
    try {
      await openVaultPath(`/${sanitized}`);
    } finally {
      setCreating(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleCreate();
    } else if (e.key === "Escape") {
      e.preventDefault();
      onClose();
    }
  };

  return (
    <>
      <div className="dialog-backdrop fixed inset-0 z-50" onClick={onClose} />
      <div
        className="prompt-modal fixed left-1/2 top-[18%] -translate-x-1/2 z-50"
        style={{ width: 440 }}
        role="dialog"
        aria-modal="true"
        aria-labelledby="vault-picker-title"
      >
        <div className="prompt-modal-header">
          <div className="prompt-modal-icon" aria-hidden="true">
            <FolderOpen size={18} />
          </div>
          <div className="prompt-modal-copy">
            <h3 id="vault-picker-title" className="prompt-modal-title">
              {t("vaultPicker.title")}
            </h3>
            <p className="prompt-modal-description">
              {t("vaultPicker.description")}
            </p>
          </div>
        </div>

        <div className="px-5 pb-4 flex flex-col gap-3">
          {/* Demo Vault */}
          <button
            onClick={() => openVaultPath("/demo-vault")}
            className="flex items-center gap-3 w-full rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg-surface)] px-4 py-3.5 text-left transition-all duration-200 hover:border-[var(--color-primary-30)] hover:bg-[var(--color-bg-hover)] hover:shadow-[var(--shadow-sm)]"
          >
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[var(--radius-md)] bg-[rgba(245,158,11,0.12)] text-[var(--color-folder)]">
              <FolderOpen size={18} />
            </span>
            <span className="flex flex-col min-w-0">
              <span className="text-[14px] font-semibold text-[var(--color-text-primary)]">
                {t("vaultPicker.demoVault")}
              </span>
              <span className="text-[12px] text-[var(--color-text-muted)]">
                {t("vaultPicker.demoVaultDesc")}
              </span>
            </span>
          </button>

          {/* Create New Vault */}
          <div className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg-surface)] px-4 py-3.5">
            <div className="flex items-center gap-3 mb-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[var(--radius-md)] bg-[rgba(99,102,241,0.10)] text-[var(--color-primary)]">
                <Sparkles size={18} />
              </span>
              <span className="flex flex-col min-w-0">
                <span className="text-[14px] font-semibold text-[var(--color-text-primary)]">
                  {t("vaultPicker.createVault")}
                </span>
                <span className="text-[12px] text-[var(--color-text-muted)]">
                  {t("vaultPicker.createVaultDesc")}
                </span>
              </span>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={nameValue}
                onChange={(e) => setNameValue(e.target.value)}
                onKeyDown={handleKeyDown}
                className="input-base flex-1"
                placeholder={t("vaultPicker.namePlaceholder")}
              />
              {sanitized && (
                <span className="text-[11px] text-[var(--color-text-muted)] shrink-0">
                  /{sanitized}/
                </span>
              )}
              <button
                type="button"
                onClick={handleCreate}
                disabled={!canCreate || creating}
                className="dialog-button dialog-button-primary shrink-0"
                style={{ minWidth: 72 }}
              >
                {creating ? "..." : t("dialog.create")}
              </button>
            </div>
          </div>
        </div>

        {/* Recent Vaults */}
        {recentVaults.length > 0 && (
          <>
            <div className="px-5 py-2 text-[11px] font-semibold text-[var(--color-text-muted)] uppercase tracking-wider border-t border-[var(--color-border-light)]">
              {t("vaultPicker.recentVaults")}
            </div>
            <div className="px-3 pb-2 flex flex-col gap-0.5">
              {recentVaults.map((p) => (
                <button
                  key={p}
                  onClick={() => openVaultPath(p)}
                  className="flex items-center gap-2.5 w-full px-2.5 py-2 rounded-[var(--radius-sm)] hover:bg-[var(--color-bg-hover)] text-left transition-colors duration-150"
                >
                  <FolderOpen size={15} className="text-[var(--color-folder)] shrink-0" />
                  <span className="text-[13px] font-medium truncate">
                    {pathBasename(p)}
                  </span>
                  <span className="text-[11px] text-[var(--color-text-muted)] truncate ml-auto">
                    {p}
                  </span>
                </button>
              ))}
            </div>
          </>
        )}

        <div className="prompt-modal-actions">
          <button
            type="button"
            onClick={onClose}
            className="dialog-button dialog-button-secondary"
          >
            {t("dialog.cancel")}
          </button>
        </div>
      </div>
    </>
  );
}

import { useState } from "react";
import { X } from "lucide-react";
import { writeVaultMarkdownFile } from "@/lib/tauriCommands";
import { useVaultStore } from "@/stores/vaultStore";
import { useFileTreeStore } from "@/stores/fileTreeStore";
import { useLinkStore } from "@/md/links/linkStore";
import { useEditorStore } from "@/stores/editorStore";

interface UnresolvedLinkDialogProps {
  target: string;
  onClose: () => void;
  onCreated: (path: string) => void;
}

export function UnresolvedLinkDialog({
  target,
  onClose,
  onCreated,
}: UnresolvedLinkDialogProps) {
  const vaultPath = useVaultStore((s) => s.vaultPath);
  const [creating, setCreating] = useState(false);

  const handleCreate = async () => {
    if (!vaultPath) return;
    setCreating(true);
    try {
      const relativePath = target.endsWith(".md") ? target : `${target}.md`;
      const fullPath = await writeVaultMarkdownFile(vaultPath, relativePath, "");
      await useFileTreeStore.getState().refreshTree(vaultPath);
      useLinkStore.getState().onFileChanged(fullPath);
      onCreated(fullPath);
    } catch (e) {
      console.error("Failed to create note:", e);
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="dialog-backdrop fixed inset-0 z-50 flex items-center justify-center">
      <div className="prompt-modal">
        <div className="prompt-modal-header">
          <div className="prompt-modal-icon">
            <AlertIcon />
          </div>
          <div className="prompt-modal-copy">
            <h3 className="prompt-modal-title">Create note</h3>
            <p className="prompt-modal-description">
              "{target}.md" does not exist yet.
            </p>
          </div>
        </div>
        {vaultPath && (
          <div className="prompt-modal-body">
            <p style={{ fontSize: 12, color: "var(--color-text-muted)", margin: 0 }}>
              Will be created in: {vaultPath}
            </p>
          </div>
        )}
        <div className="prompt-modal-actions">
          <button
            type="button"
            className="dialog-button dialog-button-secondary"
            onClick={onClose}
          >
            Cancel
          </button>
          <button
            type="button"
            className="dialog-button dialog-button-primary"
            onClick={handleCreate}
            disabled={creating}
          >
            {creating ? "Creating..." : "Create"}
          </button>
        </div>
      </div>
    </div>
  );
}

function AlertIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" />
      <polyline points="10 17 15 12 10 7" />
      <line x1="15" y1="12" x2="3" y2="12" />
    </svg>
  );
}

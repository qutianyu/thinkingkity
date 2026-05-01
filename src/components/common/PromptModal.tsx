import { useState, useEffect, useRef } from "react";
import { AlertTriangle, FilePlus, Pencil } from "lucide-react";
import { useDialogStore } from "@/stores/dialogStore";

export function PromptModal() {
  const isOpen = useDialogStore((s) => s.isOpen);
  const type = useDialogStore((s) => s.type);
  const title = useDialogStore((s) => s.title);
  const description = useDialogStore((s) => s.description);
  const defaultValue = useDialogStore((s) => s.defaultValue);
  const placeholder = useDialogStore((s) => s.placeholder);
  const confirmLabel = useDialogStore((s) => s.confirmLabel);
  const cancelLabel = useDialogStore((s) => s.cancelLabel);
  const variant = useDialogStore((s) => s.variant);
  const resolve = useDialogStore((s) => s.resolve);
  const [value, setValue] = useState(defaultValue);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setValue(defaultValue);
      if (type === "prompt") {
        setTimeout(() => inputRef.current?.focus(), 50);
      }
    }
  }, [isOpen, defaultValue, type]);

  if (!isOpen) return null;

  const handleConfirm = () => {
    resolve?.(type === "confirm" ? true : value);
  };

  const handleCancel = () => {
    resolve?.(null);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleConfirm();
    } else if (e.key === "Escape") {
      e.preventDefault();
      handleCancel();
    }
  };

  const isPrompt = type === "prompt";
  const canConfirm = !isPrompt || value.trim().length > 0;
  const Icon = variant === "danger" ? AlertTriangle : title.toLowerCase().includes("rename") ? Pencil : FilePlus;

  return (
    <>
      <div
        className="dialog-backdrop fixed inset-0 z-50"
        onClick={handleCancel}
      />
      <div
        className={`prompt-modal fixed left-1/2 top-[24%] -translate-x-1/2 z-50 ${
          variant === "danger" ? "prompt-modal-danger" : ""
        }`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="prompt-modal-title"
      >
        <div className="prompt-modal-header">
          <div className="prompt-modal-icon" aria-hidden="true">
            <Icon size={18} />
          </div>
          <div className="prompt-modal-copy">
            <h3 id="prompt-modal-title" className="prompt-modal-title">
              {title}
            </h3>
            {description && (
              <p className="prompt-modal-description">{description}</p>
            )}
          </div>
        </div>
        {isPrompt && (
          <div className="prompt-modal-body">
            <input
              ref={inputRef}
              type="text"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              onKeyDown={handleKeyDown}
              className="input-base"
              placeholder={placeholder}
            />
          </div>
        )}
        <div className="prompt-modal-actions">
          <button
            type="button"
            onClick={handleCancel}
            className="dialog-button dialog-button-secondary"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={!canConfirm}
            className={`dialog-button ${
              variant === "danger" ? "dialog-button-danger" : "dialog-button-primary"
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </>
  );
}

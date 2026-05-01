import { create } from "zustand";

type DialogVariant = "default" | "danger";
type DialogType = "prompt" | "confirm";

interface PromptOptions {
  title: string;
  description?: string;
  defaultValue?: string;
  placeholder?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: DialogVariant;
}

interface ConfirmOptions {
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: DialogVariant;
}

interface DialogState {
  isOpen: boolean;
  type: DialogType;
  title: string;
  description: string;
  defaultValue: string;
  placeholder: string;
  confirmLabel: string;
  cancelLabel: string;
  variant: DialogVariant;
  resolve: ((value: string | boolean | null) => void) | null;
  showPrompt: (options: string | PromptOptions, defaultValue?: string) => Promise<string | null>;
  showConfirm: (options: ConfirmOptions) => Promise<boolean>;
}

export const useDialogStore = create<DialogState>((set, get) => ({
  isOpen: false,
  type: "prompt",
  title: "",
  description: "",
  defaultValue: "",
  placeholder: "",
  confirmLabel: "OK",
  cancelLabel: "Cancel",
  variant: "default",
  resolve: null,
  showPrompt: (options: string | PromptOptions, defaultValue = "") => {
    // Opening a new modal resolves the previous one so callers are never left pending.
    const prev = get().resolve;
    if (prev) prev(null);
    const normalized =
      typeof options === "string" ? { title: options, defaultValue } : options;

    return new Promise<string | null>((resolve) => {
      const settle = (value: string | boolean | null) => {
        set({
          isOpen: false,
          type: "prompt",
          title: "",
          description: "",
          defaultValue: "",
          placeholder: "",
          confirmLabel: "OK",
          cancelLabel: "Cancel",
          variant: "default",
          resolve: null,
        });
        resolve(typeof value === "string" ? value : null);
      };

      set({
        isOpen: true,
        type: "prompt",
        title: normalized.title,
        description: normalized.description ?? "",
        defaultValue: normalized.defaultValue ?? "",
        placeholder: normalized.placeholder ?? "",
        confirmLabel: normalized.confirmLabel ?? "OK",
        cancelLabel: normalized.cancelLabel ?? "Cancel",
        variant: normalized.variant ?? "default",
        resolve: settle,
      });
    });
  },
  showConfirm: (options: ConfirmOptions) => {
    // Confirm shares the same modal plumbing but resolves to a boolean contract.
    const prev = get().resolve;
    if (prev) prev(null);

    return new Promise<boolean>((resolve) => {
      const settle = (value: string | boolean | null) => {
        set({
          isOpen: false,
          type: "prompt",
          title: "",
          description: "",
          defaultValue: "",
          placeholder: "",
          confirmLabel: "OK",
          cancelLabel: "Cancel",
          variant: "default",
          resolve: null,
        });
        resolve(value === true);
      };

      set({
        isOpen: true,
        type: "confirm",
        title: options.title,
        description: options.description ?? "",
        defaultValue: "",
        placeholder: "",
        confirmLabel: options.confirmLabel ?? "OK",
        cancelLabel: options.cancelLabel ?? "Cancel",
        variant: options.variant ?? "default",
        resolve: settle,
      });
    });
  },
}));

import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { pathJoin, writeFile } from "@/lib/tauriCommands";
import { useDialogStore } from "@/stores/dialogStore";
import { useFileTreeStore } from "@/stores/fileTreeStore";
import { useVaultStore } from "@/stores/vaultStore";
import { JSON_DEFAULT_CONTENT, JSON_DEFAULT_DOC_TYPE, withJsonExtension } from "@/json";

export function useJsonFileOperations() {
  const { t } = useTranslation();
  const vaultPath = useVaultStore((s) => s.vaultPath);
  const refreshTree = useFileTreeStore((s) => s.refreshTree);
  const showPrompt = useDialogStore((s) => s.showPrompt);

  const handleNewJsonFile = useCallback(
    async (
      parentPath: string,
      ext = JSON_DEFAULT_DOC_TYPE.ext,
      titleKey = JSON_DEFAULT_DOC_TYPE.titleKey,
      descKey = JSON_DEFAULT_DOC_TYPE.descKey,
    ) => {
      const name = await showPrompt({
        title: t(titleKey),
        description: t(descKey),
        placeholder: t("dialog.namePlaceholder"),
        confirmLabel: t("dialog.create"),
        cancelLabel: t("dialog.cancel"),
      });
      if (!name) return;
      const filePath = pathJoin(parentPath, withJsonExtension(name, ext));
      await writeFile(filePath, JSON_DEFAULT_CONTENT);
      if (vaultPath) await refreshTree(vaultPath);
    },
    [vaultPath, refreshTree, showPrompt, t],
  );

  return { handleNewJsonFile };
}

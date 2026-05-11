import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import {
  createFile,
  createFolder,
  renameFile,
  moveToTrash,
  writeFile,
  pathBasename,
  pathParentDir,
  pathJoin,
} from "@/lib/tauriCommands";
import { useFileTreeStore } from "@/stores/fileTreeStore";
import { useEditorStore } from "@/stores/editorStore";
import { useVaultStore } from "@/stores/vaultStore";
import { useDialogStore } from "@/stores/dialogStore";

export function useFileOperations() {
  const { t } = useTranslation();
  const vaultPath = useVaultStore((s) => s.vaultPath);
  const refreshTree = useFileTreeStore((s) => s.refreshTree);
  const closeTab = useEditorStore((s) => s.closeTab);
  const showPrompt = useDialogStore((s) => s.showPrompt);
  const showConfirm = useDialogStore((s) => s.showConfirm);

  const handleNewFile = useCallback(
    async (parentPath: string) => {
      // Creation handlers centralize prompting, path construction, and tree refresh.
      const name = await showPrompt({
        title: t("dialog.newMarkdownTitle"),
        description: t("dialog.newMarkdownDescription"),
        placeholder: t("dialog.namePlaceholder"),
        confirmLabel: t("dialog.create"),
        cancelLabel: t("dialog.cancel"),
      });
      if (!name) return;
      const filePath = pathJoin(parentPath, name + (name.endsWith(".md") ? "" : ".md"));
      await createFile(filePath);
      if (vaultPath) await refreshTree(vaultPath);
    },
    [vaultPath, refreshTree, showPrompt, t],
  );

  const handleNewCsvFile = useCallback(
    async (parentPath: string) => {
      const name = await showPrompt({
        title: t("dialog.newCsvTitle"),
        description: t("dialog.newCsvDescription"),
        placeholder: t("dialog.namePlaceholder"),
        confirmLabel: t("dialog.create"),
        cancelLabel: t("dialog.cancel"),
      });
      if (!name) return;
      const filePath = pathJoin(parentPath, name + (name.endsWith(".csv") ? "" : ".csv"));
      await createFile(filePath);
      if (vaultPath) await refreshTree(vaultPath);
    },
    [vaultPath, refreshTree, showPrompt, t],
  );

  const handleNewJsonFile = useCallback(
    async (parentPath: string) => {
      const name = await showPrompt({
        title: t("dialog.newJsonTitle"),
        description: t("dialog.newJsonDescription"),
        placeholder: t("dialog.namePlaceholder"),
        confirmLabel: t("dialog.create"),
        cancelLabel: t("dialog.cancel"),
      });
      if (!name) return;
      const filePath = pathJoin(parentPath, name + (name.endsWith(".json") ? "" : ".json"));
      await writeFile(filePath, "{\n  \n}\n");
      if (vaultPath) await refreshTree(vaultPath);
    },
    [vaultPath, refreshTree, showPrompt, t],
  );

  const handleNewTextFile = useCallback(
    async (parentPath: string) => {
      const name = await showPrompt({
        title: t("dialog.newTextTitle"),
        description: t("dialog.newTextDescription"),
        placeholder: t("dialog.namePlaceholder"),
        confirmLabel: t("dialog.create"),
        cancelLabel: t("dialog.cancel"),
      });
      if (!name) return;
      const filePath = pathJoin(parentPath, name + (name.endsWith(".txt") ? "" : ".txt"));
      await createFile(filePath);
      if (vaultPath) await refreshTree(vaultPath);
    },
    [vaultPath, refreshTree, showPrompt, t],
  );

  const handleNewCodeFile = useCallback(
    async (parentPath: string, ext: string, titleKey: string, descKey: string) => {
      // Code file creation is parameterized by the type picker metadata.
      const name = await showPrompt({
        title: t(titleKey),
        description: t(descKey),
        placeholder: t("dialog.namePlaceholder"),
        confirmLabel: t("dialog.create"),
        cancelLabel: t("dialog.cancel"),
      });
      if (!name) return;
      const filePath = pathJoin(parentPath, name + (name.endsWith(`.${ext}`) ? "" : `.${ext}`));
      if (ext === "mermaid") {
        await writeFile(filePath, "flowchart TD\n  A[Start] --> B[End]\n");
      } else {
        await createFile(filePath);
      }
      if (vaultPath) await refreshTree(vaultPath);
    },
    [vaultPath, refreshTree, showPrompt, t],
  );

  const handleNewFolder = useCallback(
    async (parentPath: string) => {
      const name = await showPrompt({
        title: t("dialog.newFolderTitle"),
        description: t("dialog.newFolderDescription"),
        placeholder: t("dialog.folderPlaceholder"),
        confirmLabel: t("dialog.create"),
        cancelLabel: t("dialog.cancel"),
      });
      if (!name) return;
      const folderPath = pathJoin(parentPath, name);
      await createFolder(folderPath);
      if (vaultPath) await refreshTree(vaultPath);
    },
    [vaultPath, refreshTree, showPrompt, t],
  );

  const handleRename = useCallback(
    async (oldPath: string) => {
      // Prompt only for the stem so users cannot accidentally drop the original extension.
      const oldName = pathBasename(oldPath);
      const extensionIndex = oldName.lastIndexOf(".");
      const hasExtension = extensionIndex > 0;
      const baseName = hasExtension ? oldName.slice(0, extensionIndex) : oldName;
      const extension = hasExtension ? oldName.slice(extensionIndex) : "";
      const newName = await showPrompt({
        title: t("dialog.renameTitle"),
        description: extension
          ? t("dialog.renameDescriptionWithExtension", { extension })
          : t("dialog.renameDescription"),
        defaultValue: baseName,
        placeholder: t("dialog.namePlaceholder"),
        confirmLabel: t("dialog.rename"),
        cancelLabel: t("dialog.cancel"),
      });
      if (!newName || newName === baseName) return;
      const parent = pathParentDir(oldPath);
      const newPath = pathJoin(parent, newName + extension);
      await renameFile(oldPath, newPath);
      closeTab(oldPath);
      if (vaultPath) await refreshTree(vaultPath);
    },
    [vaultPath, refreshTree, closeTab, showPrompt, t],
  );

  const handleDelete = useCallback(
    async (filePath: string) => {
      // Close an open tab before deleting so editor state cannot reference a missing file.
      const name = pathBasename(filePath);
      const confirmed = await showConfirm({
        title: t("dialog.deleteTitle"),
        description: t("dialog.deleteDescription", { name }),
        confirmLabel: t("dialog.delete"),
        cancelLabel: t("dialog.cancel"),
        variant: "danger",
      });
      if (!confirmed) return;
      if (!vaultPath) return;
      await moveToTrash(vaultPath, filePath);
      closeTab(filePath);
      if (vaultPath) await refreshTree(vaultPath);
    },
    [vaultPath, refreshTree, closeTab, showConfirm, t],
  );

  return {
    handleNewFile,
    handleNewCsvFile,
    handleNewJsonFile,
    handleNewTextFile,
    handleNewCodeFile,
    handleNewFolder,
    handleRename,
    handleDelete,
  };
}

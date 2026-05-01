import { useState, useRef, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { FilePlus, FolderPlus, Plus, Code, Search, X, Table2, FileText } from "lucide-react";
import { createPortal } from "react-dom";
import { useFileOperations } from "@/hooks/useFileOperations";
import { useVaultStore } from "@/stores/vaultStore";
import { expandCodeTypes, DOC_TYPES } from "@/lib/codeTypes";
import { getIconEntryForExt } from "@/lib/fileIcons";

const EXT_LUCIDE_MAP: Record<string, React.ReactNode> = {
  csv: <Table2 size={16} className="text-[var(--color-file-csv)]" />,
  txt: <FileText size={16} className="text-[var(--color-file-text)]" />,
};

function FileIcon({ ext }: { ext: string }) {
  const iconEntry = getIconEntryForExt(ext);
  if (iconEntry) {
    const Icon = iconEntry.component;
    return (
      <span className="file-type-chip-icon flex items-center justify-center">
        <Icon width={16} height={16} style={{ color: iconEntry.color }} />
      </span>
    );
  }
  const lucide = EXT_LUCIDE_MAP[ext];
  if (lucide) {
    return <span className="file-type-chip-icon flex items-center justify-center">{lucide}</span>;
  }
  return <span className="file-type-chip-icon-placeholder" />;
}

export function FileActions() {
  const { t } = useTranslation();
  const vaultPath = useVaultStore((s) => s.vaultPath);
  const { handleNewJsonFile, handleNewCodeFile, handleNewFolder } = useFileOperations();
  const [open, setOpen] = useState(false);
  const [fileTypePicker, setFileTypePicker] = useState<{
    x: number;
    y: number;
    parentPath: string;
  } | null>(null);
  const [codeTypePicker, setCodeTypePicker] = useState<{
    x: number;
    y: number;
    parentPath: string;
  } | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  if (!vaultPath) return null;

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className="new-note-button inline-flex h-8 w-8 items-center justify-center p-0"
        title="New"
      >
        <Plus size={15} />
      </button>

      {open && (
        <div className="context-menu absolute right-0 top-full mt-1.5 z-30 min-w-[200px]">
          <button
            onClick={(e) => {
              const rect = e.currentTarget.getBoundingClientRect();
              setOpen(false);
              setFileTypePicker({
                x: rect.right + 8,
                y: rect.bottom + 4,
                parentPath: vaultPath,
              });
            }}
            className="menu-item"
          >
            <FilePlus size={15} className="text-[var(--color-file-md)]" />
            {t("sidebar.newFile")}
          </button>
          <button
            onClick={() => {
              handleNewFolder(vaultPath);
              setOpen(false);
            }}
            className="menu-item"
          >
            <FolderPlus size={15} className="text-[var(--color-folder)]" />
            {t("sidebar.newFolder")}
          </button>
          <button
            onClick={(e) => {
              const rect = e.currentTarget.getBoundingClientRect();
              setOpen(false);
              setCodeTypePicker({
                x: rect.right + 8,
                y: rect.bottom + 4,
                parentPath: vaultPath,
              });
            }}
            className="menu-item"
          >
            <Code size={15} className="text-[var(--color-primary)]" />
            {t("sidebar.newCode")}
          </button>
        </div>
      )}

      {fileTypePicker && createPortal(
        <FileTypePicker
          x={fileTypePicker.x}
          y={fileTypePicker.y}
          onClose={() => setFileTypePicker(null)}
          onSelect={(ext, titleKey, descKey) => {
            if (ext === "json") {
              handleNewJsonFile(fileTypePicker.parentPath);
            } else {
              handleNewCodeFile(fileTypePicker.parentPath, ext, titleKey, descKey);
            }
            setFileTypePicker(null);
          }}
        />,
        document.body,
      )}

      {codeTypePicker && createPortal(
        <CodeTypePicker
          x={codeTypePicker.x}
          y={codeTypePicker.y}
          onClose={() => setCodeTypePicker(null)}
          onSelect={(ext, titleKey, descKey) => {
            handleNewCodeFile(codeTypePicker.parentPath, ext, titleKey, descKey);
            setCodeTypePicker(null);
          }}
        />,
        document.body,
      )}
    </div>
  );
}

export function FileTypePicker({
  x,
  y,
  onClose,
  onSelect,
}: {
  x: number;
  y: number;
  onClose: () => void;
  onSelect: (ext: string, titleKey: string, descKey: string) => void;
}) {
  const { t } = useTranslation();
  const [search, setSearch] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const filtered = DOC_TYPES.filter((dt) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return dt.ext.includes(q) || t(dt.labelKey).toLowerCase().includes(q);
  });

  return (
    <>
      <div
        className="fixed inset-0 z-40"
        onClick={onClose}
        onContextMenu={(e) => {
          e.preventDefault();
          onClose();
        }}
      />
      <div
        className="file-type-picker fixed z-50"
        style={{ left: x, top: y }}
      >
        <div className="file-type-picker-search">
          <Search size={14} className="text-[var(--color-text-muted)] shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("sidebar.searchFileType")}
            className="flex-1 bg-transparent text-[12px] text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] focus:outline-none"
            onKeyDown={(e) => {
              if (e.key === "Escape") onClose();
              if (e.key === "Enter" && filtered.length === 1) {
                const dt = filtered[0];
                onSelect(dt.ext, dt.titleKey, dt.descKey);
              }
            }}
          />
          {search && (
            <button
              onClick={() => setSearch("")}
              className="text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] transition-colors duration-200"
            >
              <X size={12} />
            </button>
          )}
        </div>
        {filtered.length === 0 ? (
          <div className="file-type-picker-empty">{t("sidebar.noResults")}</div>
        ) : (
          <div className="file-type-picker-grid">
            {filtered.map((dt) => (
              <button
                key={dt.ext}
                className="file-type-chip"
                onClick={() => onSelect(dt.ext, dt.titleKey, dt.descKey)}
              >
                <FileIcon ext={dt.ext} />
                <span className="file-type-chip-label">{t(dt.labelKey)}</span>
                <span className="file-type-chip-exts">.{dt.ext}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </>
  );
}

export function CodeTypePicker({
  x,
  y,
  onClose,
  onSelect,
}: {
  x: number;
  y: number;
  onClose: () => void;
  onSelect: (ext: string, titleKey: string, descKey: string) => void;
}) {
  const { t } = useTranslation();
  const [search, setSearch] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const allChips = expandCodeTypes();

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const filtered = allChips.filter((chip) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return chip.ext.includes(q) || t(chip.labelKey).toLowerCase().includes(q);
  });

  return (
    <>
      <div
        className="fixed inset-0 z-40"
        onClick={onClose}
        onContextMenu={(e) => {
          e.preventDefault();
          onClose();
        }}
      />
      <div
        className="file-type-picker fixed z-50"
        style={{ left: x, top: y }}
      >
        <div className="file-type-picker-search">
          <Search size={14} className="text-[var(--color-text-muted)] shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("sidebar.searchCodeType")}
            className="flex-1 bg-transparent text-[12px] text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] focus:outline-none"
            onKeyDown={(e) => {
              if (e.key === "Escape") onClose();
              if (e.key === "Enter" && filtered.length === 1) {
                const chip = filtered[0];
                onSelect(chip.ext, chip.titleKey, chip.descKey);
              }
            }}
          />
          {search && (
            <button
              onClick={() => setSearch("")}
              className="text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] transition-colors duration-200"
            >
              <X size={12} />
            </button>
          )}
        </div>
        {filtered.length === 0 ? (
          <div className="file-type-picker-empty">{t("sidebar.noResults")}</div>
        ) : (
          <div className="file-type-picker-grid">
            {filtered.map((chip) => (
              <button
                key={chip.ext}
                className="file-type-chip"
                onClick={() => onSelect(chip.ext, chip.titleKey, chip.descKey)}
              >
                <FileIcon ext={chip.ext} />
                <span className="file-type-chip-label">{t(chip.labelKey)}</span>
                <span className="file-type-chip-exts">.{chip.ext}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </>
  );
}

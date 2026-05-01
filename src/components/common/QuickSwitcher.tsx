import { useState, useEffect, useCallback, useRef } from "react";
import { Search, FileText } from "lucide-react";
import type { FileEntry } from "@/types";
import { readDirectory } from "@/lib/tauriCommands";
import { useEditorStore } from "@/stores/editorStore";
import { useVaultStore } from "@/stores/vaultStore";

interface QuickSwitcherProps {
  onClose: () => void;
}

async function collectFiles(path: string): Promise<FileEntry[]> {
  // Quick switcher flattens the vault tree and skips unreadable branches.
  const entries = await readDirectory(path);
  const results: FileEntry[] = [];
  for (const entry of entries) {
    if (!entry.is_dir) {
      results.push(entry);
    } else {
      try {
        const childResults = await collectFiles(entry.path);
        results.push(...childResults);
      } catch {
        // skip unreadable dirs
      }
    }
  }
  return results;
}

export function QuickSwitcher({ onClose }: QuickSwitcherProps) {
  const vaultPath = useVaultStore((s) => s.vaultPath);
  const openFile = useEditorStore((s) => s.openFile);
  const [query, setQuery] = useState("");
  const [allFiles, setAllFiles] = useState<FileEntry[]>([]);
  const [selectedIdx, setSelectedIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!vaultPath) return;
    collectFiles(vaultPath).then((files) => {
      files.sort((a, b) => a.name.localeCompare(b.name));
      setAllFiles(files);
    });
    inputRef.current?.focus();
  }, [vaultPath]);

  const filtered = query.trim()
    ? allFiles.filter((f) =>
        f.name.toLowerCase().includes(query.toLowerCase()),
      )
    : allFiles;

  // Clamp selection after filtering so Enter always points at a real row.
  const safeIdx = Math.min(selectedIdx, Math.max(0, filtered.length - 1));

  const handleSelect = useCallback(
    (entry: FileEntry) => {
      openFile(entry.path);
      onClose();
    },
    [openFile, onClose],
  );

  const handleKeyDown = (e: React.KeyboardEvent) => {
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setSelectedIdx((i) => Math.min(i + 1, filtered.length - 1));
        break;
      case "ArrowUp":
        e.preventDefault();
        setSelectedIdx((i) => Math.max(i - 1, 0));
        break;
      case "Enter":
        e.preventDefault();
        if (filtered[safeIdx]) {
          handleSelect(filtered[safeIdx]);
        }
        break;
      case "Escape":
        e.preventDefault();
        onClose();
        break;
    }
  };

  return (
    <>
      <div
        className="fixed inset-0 z-50 bg-black/25 backdrop-blur-md"
        onClick={onClose}
      />
      <div className="fixed left-1/2 top-[15%] -translate-x-1/2 z-50 w-[520px] max-h-[420px] bg-[var(--glass-bg)] backdrop-blur-xl border border-[var(--glass-border)] rounded-[var(--radius-xl)] shadow-[var(--shadow-lg)] flex flex-col overflow-hidden">
        {/* Search Input */}
        <div className="flex items-center gap-2.5 px-4 py-3 border-b border-[var(--color-border)]">
          <Search size={17} className="text-[var(--color-text-muted)] shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSelectedIdx(0);
            }}
            onKeyDown={handleKeyDown}
            placeholder="Quick switch files..."
            className="flex-1 bg-transparent text-[15px] text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] focus:outline-none"
          />
        </div>

        {/* Results */}
        <div className="flex-1 overflow-y-auto py-1.5">
          {filtered.length === 0 ? (
            <p className="px-4 py-4 text-[14px] text-[var(--color-text-muted)] text-center">
              {allFiles.length === 0
                ? "No files found in vault."
                : "No matching files."}
            </p>
          ) : (
            filtered.slice(0, 30).map((file, idx) => (
              <div
                key={file.path}
                onClick={() => handleSelect(file)}
                className={`px-4 py-2 cursor-pointer text-[14px] flex items-center gap-3 transition-colors duration-200 ${
                  idx === safeIdx
                    ? "bg-[var(--color-primary)] text-white"
                    : "text-[var(--color-text-primary)] hover:bg-[var(--color-bg-hover)]"
                }`}
              >
                <FileText size={15} className="shrink-0 opacity-70" />
                <span className="truncate">{file.name}</span>
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-2 border-t border-[var(--color-border)] text-[11px] text-[var(--color-text-muted)] flex justify-between">
          <span>↑↓ Navigate</span>
          <span>Enter to open · Esc to close</span>
        </div>
      </div>
    </>
  );
}

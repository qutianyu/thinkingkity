import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { PanelLeftClose, PanelLeft, Search, X } from "lucide-react";
import { FileActions } from "./FileActions";
import { FileTree } from "./FileTree";
import { useFileTreeStore } from "@/stores/fileTreeStore";
import { useEditorStore } from "@/stores/editorStore";
import { useVaultStore } from "@/stores/vaultStore";
import { useFileOperations } from "@/hooks/useFileOperations";

interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
}

export function Sidebar({ collapsed, onToggle }: SidebarProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const vaultPath = useVaultStore((s) => s.vaultPath);
  const vaultName = useVaultStore((s) => s.vaultName);
  const searchResults = useFileTreeStore((s) => s.searchResults);
  const searchFiles = useFileTreeStore((s) => s.searchFiles);
  const clearSearch = useFileTreeStore((s) => s.clearSearch);
  const openFile = useEditorStore((s) => s.openFile);
  const { handleNewFile } = useFileOperations();
  const [localQuery, setLocalQuery] = useState("");

  useEffect(() => {
    if (!vaultPath) return;
    const timer = setTimeout(() => {
      if (localQuery.trim()) {
        searchFiles(vaultPath, localQuery);
      } else {
        clearSearch();
      }
    }, 200);
    return () => clearTimeout(timer);
  }, [localQuery, vaultPath, searchFiles, clearSearch]);

  const isSearching = localQuery.trim().length > 0;
  const renderSnippet = (snippet: string) => {
    const query = localQuery.trim();
    if (!query) return snippet;

    const lowerSnippet = snippet.toLowerCase();
    const lowerQuery = query.toLowerCase();
    const matchIndex = lowerSnippet.indexOf(lowerQuery);
    if (matchIndex < 0) return snippet;

    const before = snippet.slice(0, matchIndex);
    const match = snippet.slice(matchIndex, matchIndex + query.length);
    const after = snippet.slice(matchIndex + query.length);
    return (
      <>
        {before}
        <mark className="search-result-highlight">{match}</mark>
        {after}
      </>
    );
  };

  if (collapsed) {
    return (
      <div className="sidebar-rail flex flex-col items-center py-3 gap-2 border-r border-[var(--color-border)]">
        <button
          onClick={() => navigate("/")}
          className="btn-ghost p-1.5"
          title="Switch Vault"
        >
          <img src="/logo.png" alt="ThinkingKity" className="h-7 w-7 object-contain rounded-lg" />
        </button>
        <button
          onClick={onToggle}
          className="btn-ghost p-2"
          title={t("sidebar.expand")}
        >
          <PanelLeft size={18} />
        </button>
      </div>
    );
  }

  return (
    <div className="sidebar-shell flex flex-col w-[300px] border-r border-[var(--color-border)]">
      <div className="sidebar-vault-header">
        <button
          onClick={() => navigate("/")}
          className="vault-switch"
          title="Switch Vault"
        >
          <img src="/logo.png" alt="ThinkingKity" className="h-8 w-8 object-contain rounded-lg" />
          <span className="min-w-0">
            <span className="block truncate text-[14px] font-semibold text-[var(--color-text-primary)] leading-tight">
              {vaultName || "ThinkingKity"}
            </span>
          </span>
        </button>
        <div className="flex items-center gap-1">
          <FileActions />
          <button
            onClick={onToggle}
            className="btn-ghost p-2"
            title={t("sidebar.collapse")}
          >
            <PanelLeftClose size={16} />
          </button>
        </div>
      </div>

      <div className="sidebar-search-section">
        <div className="search-box">
          <Search size={15} className="search-box-icon shrink-0" />
          <input
            type="text"
            value={localQuery}
            onChange={(e) => setLocalQuery(e.target.value)}
            placeholder={t("sidebar.search")}
            className="search-box-input"
          />
          {isSearching && (
            <button
              onClick={() => {
                setLocalQuery("");
                clearSearch();
              }}
              className="search-box-clear"
              title="Clear search"
            >
              <X size={13} />
            </button>
          )}
        </div>
        {isSearching && (
          <div className="search-meta">
            <span>{searchResults.length} results</span>
          </div>
        )}
      </div>

      {/* Search Results or File Tree */}
      {isSearching ? (
        <div className="flex-1 overflow-y-auto px-3 py-2">
          {searchResults.length === 0 ? (
            <p className="px-4 py-3 text-[14px] text-[var(--color-text-muted)]">
              No results found.
            </p>
          ) : (
            searchResults.map((entry) => (
              <div
                key={entry.path}
                onClick={() => {
                  if (!entry.is_dir) openFile(entry.path);
                }}
                className={`tree-item search-result-item ${
                  entry.is_dir
                    ? "text-[var(--color-folder)] font-medium"
                    : "text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]"
                }`}
              >
                <div className="search-result-title">
                  <span className="search-result-name truncate">{entry.name}</span>
                  {entry.searchMatch === "content" && (
                    <span className="search-result-line">
                      {typeof entry.searchLine === "number" ? `L${entry.searchLine}` : "content"}
                    </span>
                  )}
                </div>
                {entry.searchMatch === "content" && entry.searchSnippet && (
                  <span className="search-result-snippet">
                    {renderSnippet(entry.searchSnippet)}
                  </span>
                )}
              </div>
            ))
          )}
        </div>
      ) : (
        <FileTree />
      )}
    </div>
  );
}

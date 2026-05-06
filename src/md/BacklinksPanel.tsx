import { useCallback, useMemo, useState } from "react";
import { ArrowLeftRight, LinkIcon, AlertCircle, ChevronDown, ChevronRight } from "lucide-react";
import { useLinkStore } from "@/md/links/linkStore";
import { useEditorStore } from "@/stores/editorStore";
import { useVaultStore } from "@/stores/vaultStore";
import { writeVaultMarkdownFile } from "@/lib/tauriCommands";
import { useFileTreeStore } from "@/stores/fileTreeStore";
import type { BacklinkRef, WikiLink, LinkIndex } from "@/md/links/types";

interface BacklinksPanelProps {
  filePath: string;
}

export function BacklinksPanel({ filePath }: BacklinksPanelProps) {
  const openFile = useEditorStore((s) => s.openFile);
  // Select raw index and derive with useMemo to avoid new [] refs causing infinite renders
  const index = useLinkStore((s) => s.index);

  const backlinks = useMemo(() => {
    if (!index) return [];
    return index.files[filePath]?.backlinks ?? [];
  }, [index, filePath]);

  const outgoing = useMemo(() => {
    if (!index) return [];
    return index.files[filePath]?.outgoing ?? [];
  }, [index, filePath]);

  const unresolved = useMemo(() => {
    if (!index) return [];
    return index.files[filePath]?.outgoing.filter((l) => l.status === "unresolved") ?? [];
  }, [index, filePath]);

  const [backlinksOpen, setBacklinksOpen] = useState(true);
  const [outgoingOpen, setOutgoingOpen] = useState(true);
  const [unresolvedOpen, setUnresolvedOpen] = useState(true);

  const handleCreateFile = useCallback(
    async (target: string) => {
      const vaultPath = useVaultStore.getState().vaultPath;
      if (!vaultPath) return;

      const relativePath = target.endsWith(".md") ? target : `${target}.md`;
      try {
        const fullPath = await writeVaultMarkdownFile(vaultPath, relativePath, "");
        await useFileTreeStore.getState().refreshTree(vaultPath);
        useLinkStore.getState().onFileChanged(fullPath);
        openFile(fullPath);
      } catch (e) {
        console.error("Failed to create note:", e);
      }
    },
    [openFile],
  );

  const resolvedOutgoing = outgoing.filter((l) => l.status === "resolved");
  const hasContent = backlinks.length > 0 || outgoing.length > 0 || unresolved.length > 0;

  if (!hasContent) {
    return (
      <div className="backlinks-empty">
        <LinkIcon size={14} />
        <span>No links</span>
      </div>
    );
  }

  return (
    <div className="backlinks-list">
      {backlinks.length > 0 && (
        <Section
          icon={<ArrowLeftRight size={13} />}
          title="Backlinks"
          count={backlinks.length}
          open={backlinksOpen}
          onToggle={() => setBacklinksOpen(!backlinksOpen)}
        >
          {backlinks.map((ref, i) => (
            <BacklinkItem
              key={`${ref.sourcePath}:${ref.line}:${i}`}
              ref={ref}
              onClick={() => openFile(ref.sourcePath)}
            />
          ))}
        </Section>
      )}

      {outgoing.length > 0 && (
        <Section
          icon={<LinkIcon size={13} />}
          title="Outgoing Links"
          count={resolvedOutgoing.length}
          open={outgoingOpen}
          onToggle={() => setOutgoingOpen(!outgoingOpen)}
        >
          {outgoing.map((link, i) => (
            <OutgoingItem
              key={`${link.raw}:${i}`}
              link={link}
              onClick={() => {
                if (link.resolvedPath) openFile(link.resolvedPath);
              }}
            />
          ))}
        </Section>
      )}

      {unresolved.length > 0 && (
        <Section
          icon={<AlertCircle size={13} />}
          title="Unresolved"
          count={unresolved.length}
          open={unresolvedOpen}
          onToggle={() => setUnresolvedOpen(!unresolvedOpen)}
        >
          {unresolved.map((link, i) => (
            <UnresolvedItem
              key={`${link.target}:${i}`}
              link={link}
              onCreate={() => {
                if (link.resolvedPath) {
                  handleCreateFile(link.resolvedPath);
                } else {
                  handleCreateFile(link.target);
                }
              }}
            />
          ))}
        </Section>
      )}
    </div>
  );
}

function Section({
  icon,
  title,
  count,
  open,
  onToggle,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  count: number;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="backlinks-section">
      <button
        type="button"
        className="backlinks-section-header"
        onClick={onToggle}
      >
        {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        {icon}
        <span className="backlinks-section-title">{title}</span>
        <span className="backlinks-section-count">{count}</span>
      </button>
      {open && <div className="backlinks-section-body">{children}</div>}
    </div>
  );
}

function BacklinkItem({
  ref,
  onClick,
}: {
  ref: BacklinkRef;
  onClick: () => void;
}) {
  const parts = ref.sourcePath.replace(/[/\\]$/, "").split(/[/\\]/);
  const basename = parts[parts.length - 1] || ref.sourcePath;

  return (
    <button
      type="button"
      className="backlinks-item"
      onClick={onClick}
      title={ref.preview}
    >
      <span className="backlinks-item-name">{basename}</span>
      {ref.alias && <span className="backlinks-item-alias">as "{ref.alias}"</span>}
      <span className="backlinks-item-line">L{ref.line + 1}</span>
    </button>
  );
}

function OutgoingItem({
  link,
  onClick,
}: {
  link: WikiLink;
  onClick: () => void;
}) {
  const displayText = link.alias ?? link.target;
  const isResolved = link.status === "resolved";

  return (
    <button
      type="button"
      className={`backlinks-item ${isResolved ? "" : "backlinks-item-unresolved"}`}
      onClick={isResolved ? onClick : undefined}
    >
      <span className={`backlinks-item-name ${isResolved ? "" : "backlinks-item-muted"}`}>
        {displayText}
      </span>
      {link.heading && (
        <span className="backlinks-item-heading"># {link.heading}</span>
      )}
      {!isResolved && (
        <span className="backlinks-item-status">
          {link.status === "ambiguous" ? "ambiguous" : "missing"}
        </span>
      )}
    </button>
  );
}

function UnresolvedItem({
  link,
  onCreate,
}: {
  link: WikiLink;
  onCreate: () => void;
}) {
  return (
    <button
      type="button"
      className="backlinks-item backlinks-item-create"
      onClick={onCreate}
      title={`Create ${link.target}.md`}
    >
      <span className="backlinks-item-name">{link.target}</span>
      <span className="backlinks-item-action">Create</span>
    </button>
  );
}

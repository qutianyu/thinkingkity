import { useRef, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Image, Link, Table, FileText, List, ListOrdered, Code, Quote, Minus } from "lucide-react";

type MenuAction =
  | "image"
  | "link"
  | "table"
  | "heading"
  | "bulletList"
  | "orderedList"
  | "codeBlock"
  | "blockquote"
  | "divider";

type MenuLabelKey =
  | "heading"
  | "bulletList"
  | "orderedList"
  | "image"
  | "link"
  | "table"
  | "codeBlock"
  | "blockquote"
  | "divider";

interface InsertMenuProps {
  position: { top: number; left: number } | null;
  onAction: (action: MenuAction) => void;
  onClose: () => void;
}

const menuItems: { action: MenuAction; labelKey: MenuLabelKey; icon: React.ReactNode }[] = [
  { action: "heading", labelKey: "heading", icon: <FileText size={15} /> },
  { action: "bulletList", labelKey: "bulletList", icon: <List size={15} /> },
  { action: "orderedList", labelKey: "orderedList", icon: <ListOrdered size={15} /> },
  { action: "image", labelKey: "image", icon: <Image size={15} /> },
  { action: "link", labelKey: "link", icon: <Link size={15} /> },
  { action: "table", labelKey: "table", icon: <Table size={15} /> },
  { action: "codeBlock", labelKey: "codeBlock", icon: <Code size={15} /> },
  { action: "blockquote", labelKey: "blockquote", icon: <Quote size={15} /> },
  { action: "divider", labelKey: "divider", icon: <Minus size={15} /> },
];

export function InsertMenu({ position, onAction, onClose }: InsertMenuProps) {
  const { t } = useTranslation();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!position) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose();
      }
    };
    const keyHandler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("mouseup", handler);
    document.addEventListener("keydown", keyHandler);
    return () => {
      document.removeEventListener("mouseup", handler);
      document.removeEventListener("keydown", keyHandler);
    };
  }, [position, onClose]);

  if (!position) return null;

  const localizedItems = menuItems.map((item) => ({
    ...item,
    label: t(`insertMenu.${item.labelKey}`),
  }));

  return (
    <div
      ref={ref}
      className="insert-menu"
      style={{ top: position.top, left: position.left }}
    >
      <div className="insert-menu-list">
        {localizedItems.map((item) => (
          <button
            key={item.action}
            className="insert-menu-item"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => onAction(item.action)}
            type="button"
          >
            <span className="insert-menu-icon">{item.icon}</span>
            <span className="insert-menu-label">{item.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

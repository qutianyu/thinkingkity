export type MemoType = "note" | "code" | "todo";

export interface MemoItem {
  id: string;
  type: MemoType;
  title: string;
  language?: string;
  file: string;
  createdAt: number;
  updatedAt: number;
  pinned: boolean;
  archived: boolean;
  tags: string[];
}

export interface MemoIndex {
  version: 1;
  items: MemoItem[];
}

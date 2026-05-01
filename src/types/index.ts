export interface FileEntry {
  name: string;
  path: string;
  is_dir: boolean;
  children?: FileEntry[];
  searchMatch?: "name" | "content";
  searchSnippet?: string;
  searchLine?: number;
}

export interface Tab {
  path: string;
  title: string;
  isDirty: boolean;
}

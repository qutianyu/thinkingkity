export interface JsonKeywordGroup {
  label: string;
  type: string;
  detail?: string;
  boost?: number;
}

export const jsonKeywords: JsonKeywordGroup[] = [
  { label: "true", type: "constant", boost: 2 },
  { label: "false", type: "constant", boost: 2 },
  { label: "null", type: "constant", detail: "null", boost: 2 },
];

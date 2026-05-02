export type AiToolSideEffect = "none" | "network" | "filesystem";

export interface AiToolDefinition {
  name: "fetch_url" | "browse_page" | "write_markdown_document";
  description: string;
  requiresConfirmation: boolean;
  sideEffect: AiToolSideEffect;
  enabled: boolean;
}

export const DEFAULT_AI_TOOLS: AiToolDefinition[] = [
  {
    name: "fetch_url",
    description: "Fetch a public http/https URL as readable text.",
    requiresConfirmation: true,
    sideEffect: "network",
    enabled: true,
  },
  {
    name: "browse_page",
    description: "Open a public URL with Playwright and extract rendered text.",
    requiresConfirmation: true,
    sideEffect: "network",
    enabled: true,
  },
  {
    name: "write_markdown_document",
    description: "Create a Markdown file inside the current Vault.",
    requiresConfirmation: true,
    sideEffect: "filesystem",
    enabled: true,
  },
];

export function getDefaultAiTool(name: string): AiToolDefinition | null {
  return DEFAULT_AI_TOOLS.find((tool) => tool.name === name) ?? null;
}

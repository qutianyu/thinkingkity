import type { AiKnowledgeToolCall } from "../toolTypes";
import { parseAiToolCall } from "../toolParser";

export type AiPlanMode = "direct_answer" | "need_skill" | "need_tool" | "need_skill_tool";

export interface AiPlan {
  mode: AiPlanMode;
  skillNames: string[];
  toolCall?: AiKnowledgeToolCall;
  reason: string;
}

const PLAN_RE = /<plan>\s*([\s\S]*?)\s*<\/plan>/;
function isToolCall(value: unknown): value is AiKnowledgeToolCall {
  if (!value || typeof value !== "object") return false;
  const raw = value as Partial<AiKnowledgeToolCall>;
  return (raw.tool === "fetch_url" || raw.tool === "browse_page")
    && typeof raw.url === "string"
    && typeof raw.purpose === "string";
}

export function parsePlan(content: string): AiPlan | null {
  const match = content.match(PLAN_RE);
  if (!match) return parseToolCallAsPlan(content);
  try {
    const raw = JSON.parse(match[1]) as Partial<AiPlan>;
    const mode = raw.mode;
    if (!mode || !["direct_answer", "need_skill", "need_tool", "need_skill_tool"].includes(mode)) {
      return null;
    }
    return {
      mode,
      skillNames: Array.isArray(raw.skillNames)
        ? raw.skillNames.filter((item): item is string => typeof item === "string")
        : [],
      toolCall: parsePlanToolCall(raw.toolCall),
      reason: typeof raw.reason === "string" ? raw.reason : "",
    };
  } catch {
    return null;
  }
}

function parsePlanToolCall(value: unknown): AiKnowledgeToolCall | undefined {
  if (isToolCall(value)) return value;
  if (!value || typeof value !== "object") return undefined;
  return parseAiToolCall(`<tool_call>${JSON.stringify(value)}</tool_call>`) ?? undefined;
}

function parseToolCallAsPlan(content: string): AiPlan | null {
  const toolCall = parseAiToolCall(content);
  if (!toolCall) return null;
  return {
    mode: "need_tool",
    skillNames: [],
    toolCall,
    reason: toolCall.purpose,
  };
}

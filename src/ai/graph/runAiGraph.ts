import { Annotation, END, START, StateGraph } from "@langchain/langgraph";
import { browsePageWithPlaywright, fetchUrlText } from "@/lib/webTools";
import type { AiConfig } from "../config";
import { streamProviderChat } from "../client";
import { buildChatMessages } from "../contextBuilder";
import { extractThinking } from "../thinking";
import type { AiChatMessage } from "../types";
import type { AiArticleContextRef, AiSessionData } from "../sessionTypes";
import type { AiKnowledgeToolCall, AiKnowledgeToolResult } from "../toolTypes";
import { parseAiToolCalls, stripToolCalls } from "../toolParser";
import { loadFullSkills, loadSkillIndex } from "../skills/skillLoader";
import { buildFullSkillContext, buildSkillIndexContext } from "../skills/skillContext";
import type { AiSkill, AiSkillIndexItem } from "../skills/skillTypes";
import { loadVaultToolRuntimes } from "../tools/toolPolicy";
import type { AiToolDefinition } from "../tools/toolRegistry";
import { parsePlan, type AiPlan } from "./planParser";

export type AiGraphNode = "plan" | "replan" | "tool" | "final_answer";

export type AiGraphEvent =
  | { type: "node_start"; node: AiGraphNode }
  | { type: "node_end"; node: AiGraphNode }
  | { type: "thinking"; node: AiGraphNode; value: string }
  | { type: "token"; node: AiGraphNode; value: string }
  | { type: "skill_index"; skills: AiSkillIndexItem[] }
  | { type: "skill_loaded"; skills: AiSkill[] }
  | { type: "tool_confirmation_required"; call: AiKnowledgeToolCall }
  | { type: "tool_result"; result: AiKnowledgeToolResult }
  | { type: "status"; message: string }
  | { type: "error"; error: string };

export interface RunAiGraphOptions {
  ai: AiConfig;
  vaultPath: string;
  session: AiSessionData;
  memory: string;
  language: string;
  userText: string;
  articleRefs: AiArticleContextRef[];
  signal?: AbortSignal;
  onEvent: (event: AiGraphEvent) => void;
  confirmToolCall: (call: AiKnowledgeToolCall) => Promise<boolean>;
}

export interface RunAiGraphResult {
  finalAnswer: string;
  toolResults: AiKnowledgeToolResult[];
  usedSkills: AiSkillIndexItem[];
}

type ToolRuntime = Awaited<ReturnType<typeof loadVaultToolRuntimes>>[number];

const GraphAnnotation = Annotation.Root({
  toolRuntimes: Annotation<ToolRuntime[]>({
    reducer: (_left, right) => right,
    default: () => [],
  }),
  tools: Annotation<AiToolDefinition[]>({
    reducer: (_left, right) => right,
    default: () => [],
  }),
  skillIndex: Annotation<AiSkillIndexItem[]>({
    reducer: (_left, right) => right,
    default: () => [],
  }),
  skills: Annotation<AiSkill[]>({
    reducer: (_left, right) => right,
    default: () => [],
  }),
  plan: Annotation<AiPlan | null>({
    reducer: (_left, right) => right,
    default: () => null,
  }),
  toolCall: Annotation<AiKnowledgeToolCall | null>({
    reducer: (_left, right) => right,
    default: () => null,
  }),
  toolQueue: Annotation<AiKnowledgeToolCall[]>({
    reducer: (_left, right) => right,
    default: () => [],
  }),
  toolAllowed: Annotation<boolean>({
    reducer: (_left, right) => right,
    default: () => false,
  }),
  toolResults: Annotation<AiKnowledgeToolResult[]>({
    reducer: (_left, right) => right,
    default: () => [],
  }),
  finalAnswer: Annotation<string>({
    reducer: (_left, right) => right,
    default: () => "",
  }),
  toolExecutionCount: Annotation<number>({
    reducer: (_left, right) => right,
    default: () => 0,
  }),
  finalToolFallbackCount: Annotation<number>({
    reducer: (_left, right) => right,
    default: () => 0,
  }),
});

type AiGraphState = typeof GraphAnnotation.State;
type AiRoute = "load_skills" | "confirm_tool" | "execute_tool" | "final_answer" | typeof END;
const MAX_FINAL_TOOL_FALLBACKS = 3;

function toolIndexContext(tools: AiToolDefinition[]): string {
  if (tools.length === 0) return "No tools are available.";
  return tools.map((tool) => [
    `<tool name="${tool.name}" side_effect="${tool.sideEffect}" confirmation="${tool.requiresConfirmation}">`,
    tool.description,
    "</tool>",
  ].join("\n")).join("\n\n");
}

function planPrompt(options: {
  userText: string;
  skillIndex: AiSkillIndexItem[];
  tools: AiToolDefinition[];
}): AiChatMessage[] {
  return [
    {
      id: "system",
      role: "system",
      content: [
        "You are planning a ThinkingKity AI request.",
        "Decide whether the user request needs local skills, tools, both, or neither.",
        "Do not answer the user here.",
        "Return exactly one <plan> JSON block.",
        "Do not return <tool_call> directly; if a tool is needed, put it in plan.toolCall.",
        "Only these web tools exist: fetch_url and browse_page. There is no search tool.",
        "If broad web search is needed, request browse_page with a public search result URL.",
        "If the user asks for latest, current, recent, today, version, price, release, news, or other time-sensitive facts and the attached/local context is insufficient, choose need_tool and request an authoritative public source URL.",
        "For programming language versions, prefer the official downloads or release page.",
        "",
        "Plan modes: direct_answer, need_skill, need_tool, need_skill_tool.",
        "",
        "Available skills:",
        buildSkillIndexContext(options.skillIndex),
        "",
        "Available tools:",
        toolIndexContext(options.tools),
      ].join("\n"),
    },
    {
      id: "plan-user",
      role: "user",
      content: options.userText,
    },
  ];
}

function planReviewPrompt(options: {
  userText: string;
  currentPlan: AiPlan;
  tools: AiToolDefinition[];
}): AiChatMessage[] {
  return [
    {
      id: "system",
      role: "system",
      content: [
        "You are reviewing a ThinkingKity AI request plan before the final answer.",
        "Do not answer the user.",
        "Return exactly one <plan> JSON block.",
        "Use your own judgment to decide whether the current plan is safe.",
        "If the request depends on current, latest, recently changed, external, or verifiable public information and no approved tool result is already available, choose need_tool.",
        "When choosing need_tool, pick the most authoritative public URL you can infer for the user's request.",
        "Only these web tools exist: fetch_url and browse_page. There is no search tool.",
        "If you cannot identify a specific authoritative URL but still need broad discovery, request browse_page with a public search result URL.",
        "Do not invent tool names.",
        "",
        "Available tools:",
        toolIndexContext(options.tools),
        "",
        "Current plan:",
        `<plan>${JSON.stringify(options.currentPlan)}</plan>`,
      ].join("\n"),
    },
    {
      id: "plan-review-user",
      role: "user",
      content: options.userText,
    },
  ];
}

function replanPrompt(options: {
  userText: string;
  skills: AiSkill[];
  tools: AiToolDefinition[];
}): AiChatMessage[] {
  return [
    {
      id: "system",
      role: "system",
      content: [
        "You are replanning a ThinkingKity AI request after loading full skills.",
        "Decide whether to answer directly or request one tool.",
        "Do not answer the user here.",
        "Return exactly one <plan> JSON block.",
        "Do not return <tool_call> directly; if a tool is needed, put it in plan.toolCall.",
        "Only these web tools exist: fetch_url and browse_page. There is no search tool.",
        "If broad web search is needed, request browse_page with a public search result URL.",
        "If the user asks for latest, current, recent, today, version, price, release, news, or other time-sensitive facts and the loaded/contextual knowledge is insufficient, choose need_tool and request an authoritative public source URL.",
        "",
        "Loaded skills:",
        buildFullSkillContext(options.skills) || "No requested skills could be loaded.",
        "",
        "Available tools:",
        toolIndexContext(options.tools),
      ].join("\n"),
    },
    {
      id: "replan-user",
      role: "user",
      content: options.userText,
    },
  ];
}

async function collectModelText(options: {
  ai: AiConfig;
  messages: AiChatMessage[];
  source: string;
  signal?: AbortSignal;
  node: AiGraphNode;
  onEvent: (event: AiGraphEvent) => void;
}): Promise<string> {
  let raw = "";
  let visible = "";
  let emittedInlineThinking = "";
  options.onEvent({ type: "node_start", node: options.node });
  await streamProviderChat({
    ai: options.ai,
    messages: options.messages,
    source: options.source,
    signal: options.signal,
    onThinking: (token) => options.onEvent({ type: "thinking", node: options.node, value: token }),
    onToken: (token) => {
      raw += token;
      const extracted = extractThinking(raw);
      const inlineThinking = extracted.thinking.join("\n\n");
      if (inlineThinking.length > emittedInlineThinking.length) {
        options.onEvent({
          type: "thinking",
          node: options.node,
          value: inlineThinking.slice(emittedInlineThinking.length),
        });
        emittedInlineThinking = inlineThinking;
      }
      visible = extracted.visibleContent;
      options.onEvent({ type: "token", node: options.node, value: visible });
    },
  });
  options.onEvent({ type: "node_end", node: options.node });
  return visible;
}

function findTool(tools: AiToolDefinition[], call: AiKnowledgeToolCall | undefined): AiKnowledgeToolCall | null {
  if (!call) return null;
  return tools.some((tool) => tool.name === call.tool && tool.enabled) ? call : null;
}

async function executeTool(call: AiKnowledgeToolCall, toolRuntimes: ToolRuntime[]): Promise<AiKnowledgeToolResult> {
  const runtime = toolRuntimes.find((item) => item.definition.name === call.tool);
  return call.tool === "browse_page"
    ? browsePageWithPlaywright(call.url, runtime?.policy.browser)
    : fetchUrlText(call.url);
}

function injectSkills(messages: AiChatMessage[], skills: AiSkill[]): AiChatMessage[] {
  const skillContext = buildFullSkillContext(skills);
  if (!skillContext.trim()) return messages;
  const [system, ...rest] = messages;
  return [
    system,
    {
      id: "selected-skills",
      role: "system",
      content: `Selected local skills:\n\n${skillContext}`,
    },
    ...rest,
  ];
}

function injectFinalAnswerGuard(messages: AiChatMessage[]): AiChatMessage[] {
  const [system, ...rest] = messages;
  return [
    system,
    {
      id: "langgraph-final-answer-guard",
      role: "system",
      content: [
        "Tool use is orchestrated by the LangGraph planning nodes, not by the final answer.",
        "In this final answer step, never output <tool_call>.",
        "There is no search tool. Do not output search tool calls.",
        "If approved tool results are present, answer from those results.",
        "If no approved tool result is present, answer with the available context and state the limitation instead of emitting a tool call.",
      ].join("\n"),
    },
    ...rest,
  ];
}

export async function runAiGraph(options: RunAiGraphOptions): Promise<RunAiGraphResult> {
  const defaultPlan: AiPlan = {
    mode: "direct_answer",
    skillNames: [],
    reason: "Plan parsing failed; falling back to final answer.",
  };

  const routeByPlan = (state: AiGraphState): AiRoute => {
    const plan = state.plan ?? defaultPlan;
    if (plan.mode === "need_skill" || plan.mode === "need_skill_tool") return "load_skills";
    if (plan.mode === "need_tool") return "confirm_tool";
    return "final_answer";
  };

  const routeAfterReplan = (state: AiGraphState): AiRoute => {
    const plan = state.plan ?? defaultPlan;
    if ((plan.mode === "need_tool" || plan.mode === "need_skill_tool") && plan.toolCall) return "confirm_tool";
    return "final_answer";
  };

  const routeAfterConfirmation = (state: AiGraphState): AiRoute => {
    return state.toolAllowed && state.toolCall ? "execute_tool" : "final_answer";
  };

  const routeAfterToolExecution = (state: AiGraphState): AiRoute => {
    return state.toolQueue.length > 0 ? "confirm_tool" : "final_answer";
  };

  const routeAfterFinalAnswer = (state: AiGraphState): AiRoute => {
    if ((state.toolCall || state.toolQueue.length > 0) && state.finalToolFallbackCount <= MAX_FINAL_TOOL_FALLBACKS) return "confirm_tool";
    return END;
  };

  const graph = new StateGraph(GraphAnnotation)
    .addNode("load_index", async () => {
      const toolRuntimes = await loadVaultToolRuntimes(options.vaultPath);
      const tools = toolRuntimes.map((runtime) => runtime.definition);
      const skillIndex = await loadSkillIndex(options.vaultPath, tools);
      options.onEvent({ type: "skill_index", skills: skillIndex });
      return { toolRuntimes, tools, skillIndex };
    })
    .addNode("plan_request", async (state) => {
      const planText = await collectModelText({
        ai: options.ai,
        messages: planPrompt({ userText: options.userText, skillIndex: state.skillIndex, tools: state.tools }),
        source: "graph-plan",
        signal: options.signal,
        node: "plan",
        onEvent: options.onEvent,
      });
      return { plan: parsePlan(planText) ?? defaultPlan };
    })
    .addNode("normalize_plan", async (state) => {
      const currentPlan = state.plan ?? defaultPlan;
      if (currentPlan.mode !== "direct_answer") return {};
      const reviewText = await collectModelText({
        ai: options.ai,
        messages: planReviewPrompt({ userText: options.userText, currentPlan, tools: state.tools }),
        source: "graph-plan-review",
        signal: options.signal,
        node: "plan",
        onEvent: options.onEvent,
      });
      return {
        plan: parsePlan(reviewText) ?? currentPlan,
      };
    })
    .addNode("load_skills", async (state) => {
      const plan = state.plan ?? defaultPlan;
      const skills = await loadFullSkills(options.vaultPath, plan.skillNames, state.skillIndex);
      options.onEvent({ type: "skill_loaded", skills });
      return { skills };
    })
    .addNode("replan_request", async (state) => {
      const replanText = await collectModelText({
        ai: options.ai,
        messages: replanPrompt({ userText: options.userText, skills: state.skills, tools: state.tools }),
        source: "graph-replan",
        signal: options.signal,
        node: "replan",
        onEvent: options.onEvent,
      });
      const previousSkillNames = state.plan?.skillNames ?? [];
      return {
        plan: parsePlan(replanText) ?? {
          mode: "direct_answer",
          skillNames: previousSkillNames,
          reason: "Replan parsing failed; falling back to final answer.",
        },
      };
    })
    .addNode("confirm_tool", async (state) => {
      const plan = state.plan ?? defaultPlan;
      const requestedToolCall = state.toolCall ?? state.toolQueue[0] ?? plan.toolCall ?? undefined;
      const toolQueue = state.toolCall || state.toolQueue.length === 0 ? state.toolQueue : state.toolQueue.slice(1);
      const toolCall = findTool(state.tools, requestedToolCall);
      if (!toolCall && requestedToolCall) {
        const result: AiKnowledgeToolResult = {
          ok: false,
          tool: requestedToolCall.tool,
          source: requestedToolCall.url,
          error: `Tool is unavailable: ${requestedToolCall.tool}`,
          fetched_at: new Date().toISOString(),
        };
        options.onEvent({ type: "tool_result", result });
        return { toolCall: null, toolAllowed: false, toolQueue, toolResults: [...state.toolResults, result] };
      }
      if (!toolCall) return { toolCall: null, toolAllowed: false, toolQueue };

      options.onEvent({ type: "tool_confirmation_required", call: toolCall });
      const toolAllowed = await options.confirmToolCall(toolCall);
      if (!toolAllowed) {
        const result: AiKnowledgeToolResult = {
          ok: false,
          tool: toolCall.tool,
          source: toolCall.url,
          error: "User denied tool execution.",
          fetched_at: new Date().toISOString(),
        };
        return { toolCall, toolAllowed, toolQueue, toolResults: [...state.toolResults, result] };
      }
      return { toolCall, toolAllowed, toolQueue };
    })
    .addNode("execute_tool", async (state) => {
      if (!state.toolCall) return {};
      options.onEvent({ type: "node_start", node: "tool" });
      const result = await executeTool(state.toolCall, state.toolRuntimes);
      options.onEvent({ type: "tool_result", result });
      options.onEvent({ type: "node_end", node: "tool" });
      return {
        toolCall: null,
        toolAllowed: false,
        toolResults: [...state.toolResults, result],
        toolExecutionCount: state.toolExecutionCount + 1,
      };
    })
    .addNode("final_answer", async (state) => {
      const finalMessages = injectSkills(
        injectFinalAnswerGuard(
          await buildChatMessages(
            options.vaultPath,
            options.session,
            options.memory,
            options.language,
            options.articleRefs,
            state.toolResults,
          ),
        ),
        state.skills,
      );

      let finalRaw = "";
      let finalAnswer = "";
      options.onEvent({ type: "node_start", node: "final_answer" });
      await streamProviderChat({
        ai: options.ai,
        messages: finalMessages,
        source: "graph-final-answer",
        signal: options.signal,
        onThinking: (token) => options.onEvent({ type: "thinking", node: "final_answer", value: token }),
        onToken: (token) => {
          finalRaw += token;
          finalAnswer = extractThinking(finalRaw).visibleContent;
        },
      });
      options.onEvent({ type: "node_end", node: "final_answer" });
      const finalToolCalls = state.finalToolFallbackCount < MAX_FINAL_TOOL_FALLBACKS
        ? parseAiToolCalls(finalAnswer)
        : [];
      if (finalToolCalls.length > 0) {
        const cleanAnswer = stripToolCalls(finalAnswer);
        options.onEvent({ type: "token", node: "final_answer", value: cleanAnswer });
        return {
          finalAnswer: cleanAnswer,
          toolCall: finalToolCalls[0],
          toolQueue: finalToolCalls.slice(1),
          toolAllowed: false,
          finalToolFallbackCount: state.finalToolFallbackCount + 1,
        };
      }
      options.onEvent({ type: "token", node: "final_answer", value: finalAnswer });
      return { finalAnswer, toolCall: null, toolQueue: [], toolAllowed: false };
    })
    .addEdge(START, "load_index")
    .addEdge("load_index", "plan_request")
    .addEdge("plan_request", "normalize_plan")
    .addConditionalEdges("normalize_plan", routeByPlan, {
      load_skills: "load_skills",
      confirm_tool: "confirm_tool",
      final_answer: "final_answer",
    })
    .addEdge("load_skills", "replan_request")
    .addConditionalEdges("replan_request", routeAfterReplan, {
      confirm_tool: "confirm_tool",
      final_answer: "final_answer",
    })
    .addConditionalEdges("confirm_tool", routeAfterConfirmation, {
      execute_tool: "execute_tool",
      final_answer: "final_answer",
    })
    .addConditionalEdges("execute_tool", routeAfterToolExecution, {
      confirm_tool: "confirm_tool",
      final_answer: "final_answer",
    })
    .addConditionalEdges("final_answer", routeAfterFinalAnswer, {
      confirm_tool: "confirm_tool",
      [END]: END,
    })
    .compile();

  const state = await graph.invoke({});

  return {
    finalAnswer: state.finalAnswer,
    toolResults: state.toolResults,
    usedSkills: state.skills.map((skill) => skill.index),
  };
}

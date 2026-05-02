# AI Skill + Tool LangGraph 流程开发设计

## 背景

ThinkingKity 当前已经有这些 AI 能力：

- 普通聊天、session memory、文件/目录上下文。
- 外部知识工具：`fetch_url`、`browse_page`。
- 文档写入工具：`write_markdown_document`。
- 工具执行前用户确认。
- Vault 内受限写入。
- AI 通讯上下文日志。

但现在 AI 选择网站、选择浏览器、总结信息、生成文档格式，主要依赖当前 prompt 和模型临场判断。我们希望引入类似 Claude Skills / OpenClaw 的 skill 机制，把可复用工作方法放入 Vault：

```text
<vault>/.thinkingkity/skill/
```

并直接使用 `@langchain/langgraph` 的 `StateGraph` 把：

```text
调用 skill index -> 获取 skill -> 调用 tools -> 返回具体结果
```

串成可维护、可调试、可处理边缘情况的流程。不要再维护一套自研顺序 runner；ThinkingKity 只保留 `runAiGraph()` 作为应用层入口，内部流程由 LangGraph 节点和条件边驱动。

## 总目标

- Skill 遵守 Claude Skills 目录和 `SKILL.md` 基本标准。
- Skill 负责“教 AI 怎么做”，Tool 负责“真正执行能力”。
- 框架固定，路径动态：可能用 skill，也可能不用；可能用 tool，也可能不用。
- AI 可以基于 skill index 自主判断是否需要加载完整 skill。
- AI 可以基于完整 skill 判断是否需要 tool。
- 所有 tool 仍然受 App 权限、用户确认、后端校验控制。
- Edge cases 必须可恢复，不让流程卡住。

## Claude / OpenClaw 风格 Skill 规范

### 目录结构

遵守 Claude Skills 常见结构：

```text
<vault>/.thinkingkity/skill/
  web-research/
    SKILL.md
    references/
      source-policy.md
    assets/
      report-template.md
    scripts/
      helper.py
```

第一版支持：

- 必须：`SKILL.md`
- 识别但不自动读取：`references/`
- 识别但不自动注入：`assets/`
- 识别但不执行：`scripts/`

这样兼容 Claude / OpenClaw 的目录习惯，同时避免第一版引入脚本执行风险。

### SKILL.md frontmatter

最小标准：

```md
---
name: web-research
description: Research public web pages and decide when to use fetch_url or browse_page.
---
```

ThinkingKity 兼容扩展：

```yaml
allowed-tools:
  - fetch_url
  - browse_page
priority: 20
enabled: true
metadata: {"thinkingkity":{"requires":{"tools":["fetch_url","browse_page"]}}}
```

字段说明：

- `name`：必填，建议目录名一致，只允许小写字母、数字、连字符。
- `description`：必填，用于 skill index 和模型选择。
- `allowed-tools`：Claude 风格字段，只表示该 skill 建议/允许使用哪些工具，不授予权限。
- `priority`：ThinkingKity 扩展，同分时排序。
- `enabled`：ThinkingKity 扩展，默认 `true`。
- `metadata`：单行 JSON，兼容 OpenClaw 风格扩展。

不建议继续使用旧文档里的 `examples/`。示例、长资料放 `references/`，模板放 `assets/`。

## Skill 与 Tool 的关系

分层原则：

```text
Tool  = App 真正能执行的结构化能力
Skill = 教 AI 什么时候、为什么、怎么用 tool 的说明书
Graph = 管理 skill/tool 调用顺序和边缘情况的状态机
```

Skill 不能授权 tool。即使 skill 写了：

```yaml
allowed-tools:
  - browse_page
```

真正执行仍然必须：

```text
AI tool_call -> App 校验 -> 用户确认 -> Tool executor -> 结果回填
```

现有 tools：

- `fetch_url`
- `browse_page`
- `write_markdown_document`

后续应抽成统一 registry：

```ts
export interface AiToolDefinition {
  name: string;
  description: string;
  requiresConfirmation: boolean;
  sideEffect: "none" | "network" | "filesystem";
  enabled: boolean;
}
```

## 固定 LangGraph 流程图

目标：无论是否使用 skill / tool，都走同一张图。

```text
START
  |
  v
build_context
  |
  v
load_skill_index
  |
  v
plan_with_skill_index
  |
  v
route_plan
  |---------------- direct_answer ------------------|
  |                                                  v
  |                                           final_answer
  |
  |---------------- need_skill ---------------------|
  |                                                  v
  |                                           load_full_skills
  |                                                  |
  |                                                  v
  |                                           replan_with_skills
  |                                                  |
  |                                                  v
  |                                           route_replan
  |                                           /             \
  |                                  direct_answer          need_tool
  |                                      |                    |
  |                                      v                    v
  |                                final_answer          confirm_tool
  |
  |---------------- need_tool ----------------------|
                                                     v
                                              confirm_tool
                                                     |
                                      allowed -------|------ denied
                                        |                    |
                                        v                    v
                                  execute_tool          final_answer
                                        |
                                        v
                                  add_tool_result
                                        |
                                        v
                                  final_answer
                                        |
                                        v
                              maybe_write_document
                                        |
                                        v
                                      END
```

更紧凑的节点定义：

```text
START
  -> build_context
  -> load_skill_index
  -> plan
  -> route_plan

route_plan:
  direct_answer   -> final_answer
  need_skill      -> load_full_skills -> replan
  need_tool       -> confirm_tool
  need_skill_tool -> load_full_skills -> replan

route_replan:
  direct_answer -> final_answer
  need_tool     -> confirm_tool

confirm_tool:
  allowed -> execute_tool -> final_answer
  denied  -> final_answer

final_answer -> maybe_write_document -> END
```

## Graph State 设计

第一版直接使用：

```ts
import { Annotation, END, START, StateGraph } from "@langchain/langgraph";
```

核心代码位置：

```text
src/ai/graph/runAiGraph.ts
```

`runAiGraph()` 是 ThinkingKity UI 调用 AI 引擎的稳定入口，但它不是自研 graph 框架。内部必须用 `StateGraph` 定义节点、条件边和终止边：

```ts
const graph = new StateGraph(GraphAnnotation)
  .addNode("load_index", loadIndexNode)
  .addNode("plan", planNode)
  .addNode("load_skills", loadSkillsNode)
  .addNode("replan", replanNode)
  .addNode("confirm_tool", confirmToolNode)
  .addNode("execute_tool", executeToolNode)
  .addNode("final_answer", finalAnswerNode)
  .addEdge(START, "load_index")
  .addEdge("load_index", "plan")
  .addConditionalEdges("plan", routeByPlan, {
    load_skills: "load_skills",
    confirm_tool: "confirm_tool",
    final_answer: "final_answer",
  })
  .addEdge("load_skills", "replan")
  .addConditionalEdges("replan", routeAfterReplan, {
    confirm_tool: "confirm_tool",
    final_answer: "final_answer",
  })
  .addConditionalEdges("confirm_tool", routeAfterConfirmation, {
    execute_tool: "execute_tool",
    final_answer: "final_answer",
  })
  .addEdge("execute_tool", "final_answer")
  .addEdge("final_answer", END)
  .compile();
```

这里的 `runAiGraph()` 只负责：

- 接收 UI / host app 注入的 provider、vaultPath、session、memory、确认回调和事件回调。
- 创建 LangGraph 实例。
- 调用 `graph.invoke()`。
- 把最终 state 映射回 `{ finalAnswer, toolResults, usedSkills }`。

它不能重新实现一套 `if/else` 顺序 runner，否则后续 skill、tool、人机确认和独立 AI Engine 抽离都会出现双轨维护。

```ts
export interface AiGraphState {
  requestId: string;
  mode: "chat" | "document";
  vaultPath: string;
  userInput: string;
  language: string;

  baseContext: {
    sessionMemory: string;
    attachedContext: string;
    externalKnowledge: AiKnowledgeToolResult[];
    recentMessages: AiChatMessage[];
  };

  toolRegistry: AiToolDefinition[];
  skillIndex: AiSkillIndexItem[];
  selectedSkillNames: string[];
  loadedSkills: AiSkill[];

  plan?: AiPlan;
  toolCall?: AiToolCall;
  toolConfirmation?: AiToolConfirmation;
  toolResults: AiToolResult[];

  finalAnswer?: string;
  documentDraft?: string;

  errors: AiGraphError[];
}
```

Plan 类型：

```ts
export type AiPlanMode =
  | "direct_answer"
  | "need_skill"
  | "need_tool"
  | "need_skill_tool";

export interface AiPlan {
  mode: AiPlanMode;
  skillNames?: string[];
  toolCall?: AiToolCall;
  reason: string;
}
```

## 节点详细设计

### 1. build_context

职责：

- 读取 session memory。
- 读取用户附加文件/目录上下文。
- 收集最近消息。
- 收集已有 tool results。
- 不读取 skill。

失败处理：

- 附加文件缺失：保留 missing 标记，不中断。
- 目录过大：按预算截断。
- memory 读取失败：当作空 memory。

输出：

```ts
state.baseContext
```

### 2. load_skill_index

职责：

- 扫描 `<vault>/.thinkingkity/skill/*/SKILL.md`。
- 只读取 frontmatter 和简短 description。
- 不加载完整正文。
- 结合 tool registry 做 gating。

Skill index item：

```ts
export interface AiSkillIndexItem {
  name: string;
  description: string;
  path: string;
  allowedTools: string[];
  priority: number;
  enabled: boolean;
  unavailableReason?: string;
}
```

Gating 规则：

- `enabled: false` -> 不进入 index。
- 缺少 `name` / `description` -> 不进入 index，记录 warning。
- `metadata.thinkingkity.requires.tools` 中所有工具都不存在 -> 不进入 index。
- `allowed-tools` 中有未知工具 -> 保留 skill，但在 index 标注 unknown tools，AI 不应调用未知工具。

边缘情况：

- skill 目录不存在：`skillIndex = []`，继续。
- skill 文件格式错误：跳过该 skill，继续。
- 同名 skill：保留优先级高/路径更靠近 Vault 的一个；记录冲突。

### 3. plan_with_skill_index

职责：

调用 AI，让它基于：

- 用户输入。
- base context 摘要。
- skill index。
- tool registry。

决定：

- 直接回答。
- 需要加载完整 skill。
- 需要直接调用 tool。
- 既需要 skill 又可能需要 tool。

输出格式必须结构化：

```xml
<plan>{
  "mode": "need_skill",
  "skillNames": ["web-research"],
  "reason": "User asks to summarize a URL and web-research matches."
}</plan>
```

或：

```xml
<plan>{
  "mode": "need_tool",
  "toolCall": {
    "tool": "fetch_url",
    "url": "https://example.com",
    "purpose": "Need page content before answering."
  },
  "reason": "The user asks about a URL."
}</plan>
```

边缘情况：

- 没有 skill index：AI 仍可选择 direct_answer 或 need_tool。
- AI 输出无效 JSON：fallback 到 direct_answer，使用普通回答 prompt。
- AI 选择不存在 skill：进入 `load_full_skills` 时标记 missing，然后 replan。
- AI 选择不存在 tool：route 到 `final_answer`，让 AI 说明该工具不可用。

### 4. route_plan

确定下一步。

规则：

```ts
if plan.mode === "need_skill" || plan.mode === "need_skill_tool":
  return "load_full_skills"

if plan.mode === "need_tool":
  return "confirm_tool"

return "final_answer"
```

如果 plan 不存在或解析失败：

```ts
return "final_answer"
```

### 5. load_full_skills

职责：

- 根据 `plan.skillNames` 读取完整 `SKILL.md`。
- 第一版只读取 `SKILL.md` 正文。
- `references/` 默认不读取，后续可让 AI 请求。

预算：

```ts
MAX_SELECTED_SKILLS = 3
MAX_SINGLE_SKILL_CHARS = 10 * 1024
MAX_TOTAL_SKILL_CHARS = 24 * 1024
```

边缘情况：

- skill 不存在：记录 error，继续 replan。
- skill 被删除：记录 missing，继续 replan。
- skill disabled：不加载，记录 unavailable。
- skill 太长：截断并标记。
- 全部 skill 都加载失败：replan 时明确告诉 AI “requested skills unavailable”。

### 6. replan_with_skills

职责：

基于完整 skill 内容再次让 AI 决策：

- 直接回答。
- 需要调用 tool。

输出：

```xml
<plan>{
  "mode": "need_tool",
  "toolCall": {...},
  "reason": "Skill says to fetch official release page first."
}</plan>
```

边缘情况：

- skill 内容用不上：AI 返回 `direct_answer`。
- skill 与用户问题不匹配：AI 返回 `direct_answer`，并可忽略 skill。
- skill 建议的 tool 不存在：返回 direct answer，说明无法执行该步骤。
- skill 试图绕过确认：忽略该部分，tool 仍走 confirm。

### 7. confirm_tool

职责：

这是 UI interrupt 节点，不是 LLM 节点。

展示：

- tool 名称。
- 参数。
- 来源：AI plan / skill guidance。
- 风险说明。
- 确认 / 取消。

不同 tool 的确认：

- `fetch_url`：显示 URL，说明会发起网络请求。
- `browse_page`：显示 URL，说明会启动无头浏览器。
- `write_markdown_document`：显示目标路径、写入模式、内容预览。

边缘情况：

- tool 不存在：跳过确认，进入 final_answer，说明工具不可用。
- tool disabled：同上。
- 参数非法：同上。
- 用户取消：进入 final_answer，给 AI 一个 denial context。
- UI 关闭 / 会话切换：取消当前 graph run。

### 8. execute_tool

职责：

调用 App 内 tool executor。

执行规则：

- 每个 tool 必须有 timeout。
- 每个 tool 必须返回结构化 result。
- tool 失败不抛到 UI 卡死；写入 `state.toolResults`。

结果格式：

```ts
export interface AiToolResult {
  ok: boolean;
  tool: string;
  source?: string;
  content?: string;
  error?: string;
  executedAt: string;
}
```

边缘情况：

- fetch 超时：返回 `{ ok: false, error: "timeout" }`。
- browse 启动失败：返回错误，提示 Playwright 不可用。
- write 文件重名：返回错误，不覆盖。
- 工具结果为空：仍返回 ok，但 content 为空；final_answer 里说明无法从结果中提取信息。

### 9. final_answer

职责：

统一生成最终输出。

输入可能有：

- base context。
- skill index。
- loaded skills。
- tool results。
- denial context。
- errors。

必须处理四种主路径：

1. 无 skill，无 tool：直接回答。
2. 有 skill，无 tool：按 skill 方法回答。
3. 无 skill，有 tool：基于 tool result 回答。
4. 有 skill，有 tool：按 skill 方法解释 tool result。

边缘情况：

- skill 不存在：说明未能加载 skill，但尽力回答。
- tool 不存在：说明工具不可用。
- 用户拒绝 tool：说明无法获取外部信息，不编造。
- tool 失败：说明失败原因，不编造。
- tool 用不上：如果结果与问题无关，说明结果不足。

### 10. maybe_write_document

职责：

如果最终回答中触发文档写入流程，复用已有 `write_markdown_document` 能力。

规则：

- 不自动写。
- 永远展示确认。
- skill 可以影响文档格式，但不能跳过确认。

## AI 调用次数

最完整路径：

```text
1. plan_with_skill_index
2. replan_with_skills
3. final_answer
```

如果还需要 tool：

```text
1. plan_with_skill_index
2. replan_with_skills
3. tool 执行
4. final_answer
```

AI 调用次数是 3 次，tool 不算 AI 调用。

简化路径：

- 不用 skill / tool：`plan + final_answer`，2 次。
- 如果把 plan 和 final answer 合并，未来可优化成 1 次。
- App 本地强触发 tool：`tool + final_answer`，1 次 AI。

第一版为了稳定和可调试，可以接受最多 3 次 AI 调用。后续可优化。

## 是否可以减少调用次数

可以，但不是 MVP。

优化方案：

1. `plan_with_skill_index` 允许同时返回 `skillNames` 和 `toolCall`。
2. 如果 tool 不依赖完整 skill，可直接执行 tool。
3. final_answer 时再加载完整 skill。

但这会增加状态组合复杂度。第一版保持清晰优先。

## Tool Registry 设计

现有工具分散在：

- `toolTypes.ts`
- `webTools.ts`
- `documentWriter.ts`
- `AiChatDock.tsx`

建议新增：

```text
src/ai/tools/toolRegistry.ts
src/ai/tools/toolExecutor.ts
src/ai/tools/toolSchemas.ts
```

Registry 示例：

```ts
export const AI_TOOLS: AiToolDefinition[] = [
  {
    name: "fetch_url",
    description: "Fetch public http/https URL as readable text.",
    requiresConfirmation: true,
    sideEffect: "network",
    enabled: true,
  },
  {
    name: "browse_page",
    description: "Open public URL with Playwright and extract rendered text.",
    requiresConfirmation: true,
    sideEffect: "network",
    enabled: true,
  },
  {
    name: "write_markdown_document",
    description: "Create a Markdown file inside current Vault.",
    requiresConfirmation: true,
    sideEffect: "filesystem",
    enabled: true,
  },
];
```

Unknown tool handling:

- AI 请求未知 tool：不执行。
- final_answer 告诉 AI 工具不可用。
- debug 记录 `unknown_tool`。

Disabled tool handling:

- registry 中 `enabled: false`。
- 不暴露给 skill index。
- 如果 AI 仍请求，拒绝执行。

## `.thinkingkity` 中的 Skill 与 Tool 边界

最终目录建议：

```text
<vault>/.thinkingkity/
  skill/
    web-research/
      SKILL.md
      references/
      assets/
      scripts/
  tools/
    registry.json
    policies.json
  sessions/
  config.json
```

### Skill 可以完整放进 `.thinkingkity`

Skill 是用户本地的工作说明、模板和参考资料，可以完整放入 Vault：

```text
.thinkingkity/skill/<skill-name>/SKILL.md
```

它适合被同步、复制、版本管理。

### Tool 只把 registry / policy 放进 `.thinkingkity`

Tool 是实际执行能力，涉及网络、文件、浏览器、进程和权限。第一版不允许从 Vault 直接加载并执行 tool 代码。

允许放入 Vault：

```text
.thinkingkity/tools/registry.json
.thinkingkity/tools/policies.json
```

不允许直接执行：

```text
.thinkingkity/tools/my-tool.js
.thinkingkity/tools/my-tool.py
```

除非未来做独立插件系统、签名、安装确认、沙箱和权限审计。

### registry.json

Vault 级 tool 启用列表：

```json
{
  "version": 1,
  "enabled": [
    "fetch_url",
    "browse_page",
    "write_markdown_document"
  ]
}
```

如果文件不存在，使用 App 默认 registry。

如果 registry 中出现未知 tool：

- 忽略。
- debug 记录 `unknown_tool_in_registry`。
- 不暴露给 AI。

### policies.json

Vault 级 tool 策略：

```json
{
  "version": 1,
  "policies": {
    "fetch_url": {
      "enabled": true,
      "requireConfirmation": true,
      "allowedDomains": [],
      "blockedDomains": ["localhost", "127.0.0.1"],
      "timeoutMs": 15000
    },
    "browse_page": {
      "enabled": true,
      "requireConfirmation": true,
      "timeoutMs": 15000
    },
    "write_markdown_document": {
      "enabled": true,
      "requireConfirmation": true,
      "allowOverwrite": false
    }
  }
}
```

策略只能收紧 App 默认权限，不能放宽硬安全边界。例如：

- 不能允许访问 localhost。
- 不能跳过写文件确认。
- 不能允许写 Vault 外文件。
- 不能允许覆盖文件，除非 App 明确实现覆盖确认。

### Skill 与 Tool 的同步关系

Skill 可以声明：

```yaml
allowed-tools:
  - fetch_url
  - browse_page
```

但最终可用性取决于：

```text
App 内置 executor
  + .thinkingkity/tools/registry.json
  + .thinkingkity/tools/policies.json
  + 当前环境能力
```

如果 skill 需要的 tool 不存在或被禁用：

- skill index 中标记 tool unavailable。
- AI 可以看到该限制。
- 如果 AI 仍请求该 tool，Graph 拒绝执行并进入 final_answer。

## Skill Loader 设计

新增：

```text
src/ai/skills/skillTypes.ts
src/ai/skills/skillLoader.ts
src/ai/skills/skillContext.ts
```

### skillTypes.ts

```ts
export interface AiSkillIndexItem {
  name: string;
  description: string;
  path: string;
  allowedTools: string[];
  priority: number;
}

export interface AiSkill {
  index: AiSkillIndexItem;
  body: string;
  truncated: boolean;
}
```

### skillLoader.ts

```ts
export async function loadSkillIndex(vaultPath: string, tools: AiToolDefinition[]): Promise<AiSkillIndexItem[]>

export async function loadFullSkills(
  vaultPath: string,
  names: string[],
  index: AiSkillIndexItem[],
): Promise<AiSkill[]>
```

Frontmatter parser：

- 第一版手写简单 parser。
- 支持 `name`、`description`、`allowed-tools`、`priority`、`enabled`、`metadata`。
- 不支持复杂 YAML。

## Prompt 设计

### Plan prompt

要求 AI 只输出 `<plan>`：

```text
You are deciding how to answer inside ThinkingKity.

Available skills:
<skill_index>
...
</skill_index>

Available tools:
<tool_index>
...
</tool_index>

Return exactly one <plan> JSON:
- direct_answer
- need_skill
- need_tool
- need_skill_tool

Do not answer the user here.
```

### Replan prompt

```text
Loaded skills:
<skill name="...">
...
</skill>

Decide whether the user's task can now be answered directly or needs a tool.
Return exactly one <plan> JSON.
```

### Final answer prompt

```text
Use the loaded skills when relevant.
Use tool results if available.
If a skill/tool was unavailable, say so briefly.
Do not fabricate missing external information.
```

## 边缘情况总表

| 情况 | 处理 |
|---|---|
| `.thinkingkity/skill` 不存在 | skill index 为空，继续 |
| skill frontmatter 无效 | 跳过该 skill，记录 warning |
| skill name 重复 | 保留高优先级，记录冲突 |
| AI 请求不存在的 skill | replan 时提供 missing skill error |
| AI 请求 disabled skill | 不加载，记录 unavailable |
| skill 加载后发现不适用 | replan 返回 direct_answer |
| skill 要求未知 tool | 不执行，final_answer 说明工具不可用 |
| 没有任何 tool 可用 | tool index 为空，AI 只能 direct_answer 或说明限制 |
| AI 请求不存在 tool | 拒绝执行，进入 final_answer |
| AI 请求 tool 参数非法 | 拒绝执行，进入 final_answer |
| 用户拒绝 tool | 把拒绝结果回填，final_answer 不编造 |
| tool 超时 | 返回失败结果，final_answer 解释 |
| tool 返回空内容 | final_answer 说明结果不足 |
| write 文件目标已存在 | 返回失败，不覆盖 |
| 图运行中用户切换会话 | abort graph run |
| 模型输出无效 plan JSON | fallback 到 final_answer |
| final_answer 又输出 tool_call | 第一版不递归，提示不支持多步工具 |

## Thinking 处理规则

引入 LangGraph 后，一个用户请求可能包含多个 LLM 节点：

```text
plan_with_skill_index
replan_with_skills
final_answer
document draft
```

每个节点都可能产生 thinking。Thinking 必须作为 UI/debug 信息处理，不能进入业务上下文。

### 核心原则

```text
thinking 只展示给用户或 debug 面板
不写入 session 正文
不进入下一次 AI 上下文
不进入 skill 内容
不进入 tool result
不保存进文档
不触发 tool 执行
```

### Graph State

新增：

```ts
export interface AiGraphThinkingBlock {
  node: "plan" | "replan" | "final_answer" | "document";
  content: string;
  createdAt: string;
}

export interface AiGraphState {
  // ...
  thinkingBlocks: AiGraphThinkingBlock[];
}
```

每个 LLM 节点在流式返回时：

- `onThinking(token)` 追加到当前 node 的 thinking block。
- `onToken(token)` 只处理可见正文。
- 如果模型把 `<think>...</think>` 混在正文里，也要剥离并放入 `thinkingBlocks`。

### Plan / Replan 节点

Plan 节点只认结构化正文：

```xml
<plan>{"mode":"need_skill","skillNames":["web-research"]}</plan>
```

如果 thinking 里写了“我应该调用 browse_page”，但正文没有合法 `<plan>` 或 `<tool_call>`，不能执行工具。

处理规则：

```text
raw thinking -> thinkingBlocks
visible content -> parse plan
parsed plan -> graph state
```

后续节点只能拿到 parsed plan，不能拿到 plan thinking。

### Tool 触发边界

工具只能由结构化正文触发：

```xml
<tool_call>{"tool":"fetch_url","url":"https://..."}</tool_call>
```

以下内容不能触发工具：

- thinking 里的工具意图。
- 普通自然语言“我打算获取网页”。
- skill 里写的工具建议。
- debug log。

这保证 thinking 不会绕过用户确认。

### UI 展示

普通聊天 UI 建议默认只展示 `final_answer` 的 thinking：

```text
Kity
[灰底 thinking]
最终回答正文
```

`plan` / `replan` thinking 属于内部调度信息，默认不展示给普通用户。可以放到 debug 面板或 console graph log。

如果未来做 graph timeline，可以按节点折叠展示：

```text
Thinking
  Plan
  Replan with Skill
  Final Answer
```

### Session 保存

Session message 只保存最终可见回答：

```ts
message.content = finalAnswerVisibleText;
```

不保存：

- plan thinking
- replan thinking
- final answer thinking
- skill selection thinking
- tool debug

如果需要调试，写入临时内存：

```ts
window.__THINKINGKITY_AI_GRAPH_LOGS__
```

不默认持久化到 Vault，避免隐私和体积问题。

### 文档生成

文档生成节点同样拆分：

```text
thinking -> 灰底展示 / debug
markdown -> 草稿 textarea
```

保存文档时只保存 markdown，不保存 thinking。

### 上下文传递

任何进入下一轮 AI 的内容必须先经过：

```ts
extractThinking(rawContent).visibleContent
```

Graph 中禁止把 `thinkingBlocks` 拼回 prompt。后续上下文只使用：

- 用户消息。
- session memory。
- skill 正文。
- tool result。
- final visible answer。

## Debug 与可观测性

每个 graph run 生成 `requestId`。

日志：

```ts
window.__THINKINGKITY_AI_CONTEXT_LOGS__
window.__THINKINGKITY_AI_GRAPH_LOGS__
```

Graph log 记录：

- node enter / exit。
- plan JSON。
- selected skills。
- loaded skills。
- tool call。
- confirmation result。
- tool result。
- final answer chars。

示例：

```ts
console.info("[ThinkingKity AI Graph]", {
  requestId,
  node: "load_full_skills",
  skills: ["web-research"],
});
```

## UI 设计

第一版最小 UI：

- 工具确认 UI 继续复用现有。
- 增加“本轮使用的 skill”调试展示，可先放 console。
- 当 skill/tool 不可用时，在 assistant 消息中用简短文字说明。

后续 UI：

- Skill 管理页。
- Skill 匹配测试。
- Skill 启用/禁用。
- 查看本轮 graph timeline。

## 未来可抽离 AI Engine 设计

当前不需要立刻拆成独立包，但代码设计要尽可能支持未来抽离。目标是让 ThinkingKity 的 AI 能力最终成为一个可复用 engine，外部应用可以通过创建对象接入自己的模型、skill store、tool registry、确认 UI 和存储。

### 目标形态

未来外部应用可以这样使用：

```ts
const engine = new ThinkingKityAiEngine({
  modelProvider,
  skillStore,
  toolRegistry,
  confirmationProvider,
  contextProvider,
  memoryStore,
  logger,
});

const result = await engine.run({
  mode: "chat",
  workspaceId: "/path/to/workspace",
  userInput: "总结这个网页 https://example.com",
  session,
  attachedContext,
});
```

或者用于 UI 流式渲染：

```ts
for await (const event of engine.stream(input)) {
  render(event);
}
```

### 当前阶段的设计要求

即使暂时不拆包，新增代码也要遵守这些边界：

- Core 不依赖 React。
- Core 不依赖 Zustand。
- Core 不直接调用 Tauri API。
- Core 不直接读写 DOM。
- Core 不直接读写本地文件。
- Core 通过 adapter 使用模型、文件、skill、tool、确认 UI。

也就是说，当前可以继续放在 `src/ai`，但要按“未来可搬到 package”的方式写。

### 分层结构

推荐内部结构：

```text
src/ai/core/
  graph/
    runAiGraph.ts
    graphState.ts
    graphEvents.ts
  parsers/
    planParser.ts
    toolParser.ts
    thinking.ts
  context/
    contextBuilder.ts

src/ai/adapters/
  thinkingKityModelProvider.ts
  vaultSkillStore.ts
  vaultToolRegistry.ts
  vaultContextProvider.ts
  reactConfirmationProvider.ts

src/ai/ui/
  AiChatDock.tsx
  DocumentDraftModal.tsx
```

第一版可以不实际移动所有文件，但新增 graph/skill/tool 代码应尽量按这个边界组织。

### Engine Options

```ts
export interface ThinkingKityAiEngineOptions {
  modelProvider: AiModelProvider;
  skillStore: AiSkillStore;
  toolRegistry: AiToolRegistry;
  confirmationProvider: AiConfirmationProvider;
  contextProvider: AiContextProvider;
  memoryStore?: AiMemoryStore;
  logger?: AiEngineLogger;
  limits?: AiEngineLimits;
}
```

### Run Input / Result

不要把核心接口绑定死在 `vaultPath`。用更通用的 `workspaceId`：

```ts
export interface AiEngineRunInput {
  requestId?: string;
  mode: "chat" | "document";
  workspaceId: string;
  userInput: string;
  language?: string;
  session: {
    id: string;
    title: string;
    messages: AiChatMessage[];
    memory?: string;
  };
  attachedContext?: AiContextRef[];
  signal?: AbortSignal;
}

export interface AiEngineRunResult {
  requestId: string;
  finalAnswer?: string;
  documentDraft?: string;
  toolResults: AiToolResult[];
  usedSkills: AiSkillIndexItem[];
  thinkingBlocks: AiGraphThinkingBlock[];
  events: AiEngineEvent[];
}
```

ThinkingKity 的 adapter 可以把：

```text
workspaceId = vaultPath
```

外部应用可以把 `workspaceId` 映射到项目路径、数据库 workspace、远程 workspace。

### Model Provider Adapter

```ts
export interface AiModelProvider {
  stream(input: AiModelStreamInput): AsyncIterable<AiModelStreamEvent>;
}

export interface AiModelStreamInput {
  messages: AiChatMessage[];
  source: string;
  signal?: AbortSignal;
}

export type AiModelStreamEvent =
  | { type: "token"; value: string }
  | { type: "thinking"; value: string }
  | { type: "error"; error: Error };
```

当前 `streamProviderChat()` 可以先包成 `ThinkingKityModelProvider`，而不是在 graph runner 里直接 import。

### Skill Store Adapter

```ts
export interface AiSkillStore {
  loadIndex(workspaceId: string, tools: AiToolDefinition[]): Promise<AiSkillIndexItem[]>;
  loadSkills(workspaceId: string, names: string[]): Promise<AiSkill[]>;
}
```

ThinkingKity 实现：

```text
workspaceId -> <vault>/.thinkingkity/skill/
```

外部应用可以从：

- 本地目录。
- 数据库。
- 远程 API。
- 内存对象。

加载 skill。

### Tool Registry / Executor Adapter

```ts
export interface AiToolRegistry {
  list(workspaceId: string): Promise<AiToolDefinition[]>;
  get(workspaceId: string, name: string): Promise<AiToolDefinition | null>;
  execute(input: AiToolExecuteInput): Promise<AiToolResult>;
}

export interface AiToolExecuteInput {
  workspaceId: string;
  call: AiToolCall;
  signal?: AbortSignal;
}
```

ThinkingKity 实现：

- executor 来自 App 内置代码。
- registry / policy 来自 `.thinkingkity/tools/`。
- 仍然要求 confirmation provider 确认。

外部应用可以注入自己的 tool registry，但 engine 默认策略必须保守。

### Confirmation Provider

Engine 不弹 UI，只发出确认请求：

```ts
export interface AiConfirmationProvider {
  confirmToolCall(request: AiToolConfirmationRequest): Promise<AiToolConfirmationResult>;
  confirmDocumentWrite?(request: AiDocumentWriteConfirmationRequest): Promise<AiToolConfirmationResult>;
}
```

ThinkingKity React UI 实现：

- 弹 modal。
- 用户确认 / 取消。

CLI 实现：

- 命令行 prompt。

Server 实现：

- 默认拒绝。
- 或走外部审批 API。

### Context Provider

```ts
export interface AiContextProvider {
  readContext(workspaceId: string, refs: AiContextRef[]): Promise<string>;
}
```

ThinkingKity 实现：

- 读取 Vault 文件。
- 展开目录。
- 遵守 `.thinkingkity` 过滤和上下文预算。

外部应用可以实现：

- 读取项目文件。
- 读取数据库记录。
- 读取云文档。

### Event Stream

为了让不同 UI 复用，Engine 应输出事件：

```ts
export type AiEngineEvent =
  | { type: "node_start"; node: string; requestId: string }
  | { type: "node_end"; node: string; requestId: string }
  | { type: "thinking"; node: string; value: string }
  | { type: "token"; node: string; value: string }
  | { type: "skill_selected"; skills: AiSkillIndexItem[] }
  | { type: "tool_confirmation_required"; call: AiToolCall }
  | { type: "tool_result"; result: AiToolResult }
  | { type: "error"; error: AiGraphError };
```

ThinkingKity UI 只消费这些 event，不直接操作 graph 内部状态。

### 抽离时的硬安全默认值

即使未来作为 SDK，默认也必须安全：

- 默认所有 network/filesystem tool 都需要确认。
- 默认不执行 workspace 内脚本。
- 默认不读取 workspace 外文件。
- 默认不访问 localhost / 内网 URL。
- 默认不覆盖文件。
- Skill 不能授权 tool。
- Host 应用可以收紧策略，但不应默认放宽。

### 渐进式改造顺序

为了未来可抽离，开发时按这个顺序做：

1. 先定义纯 TypeScript 类型和接口。
2. 把 graph runner 写成无 React/Tauri 依赖。
3. 把现有 `streamProviderChat()` 包成 model provider adapter。
4. 把 `.thinkingkity/skill` loader 包成 skill store adapter。
5. 把 `.thinkingkity/tools` registry/policy 包成 tool registry adapter。
6. `AiChatDock` 只负责 UI 和事件渲染。
7. 等内部边界稳定后，再考虑移动到 `packages/ai-engine/`。

## 实现阶段

### Phase 1：基础 Graph 骨架

1. 新增 graph state 类型。
2. 引入 `@langchain/langgraph` 依赖。
3. 新增 `runAiGraph()`，内部使用 `StateGraph` / `Annotation.Root` / `START` / `END`。
4. 用 `addNode()` 实现 `load_index`、`plan`、`load_skills`、`replan`、`confirm_tool`、`execute_tool`、`final_answer`。
5. 用 `addConditionalEdges()` 实现 plan / replan / confirm 的路由。
6. 移除自研顺序 runner，不保留另一套 graph 调度逻辑。
7. 把当前 `AiChatDock.handleSubmit()` 的 AI 决策逻辑迁入 graph runner。
8. 保持现有 fetch/browse/write 行为不变。

### Phase 2：Skill Index

1. 实现 `loadSkillIndex()`。
2. 注入 plan prompt。
3. 支持 AI 输出 `need_skill`。
4. skill 不存在 / 空 index 能正常走 direct answer。

### Phase 3：Full Skill Loading

1. 实现 `loadFullSkills()`。
2. 实现 `replan_with_skills`。
3. 支持 skill 指导 tool 调用。
4. debug 打印 loaded skill。

### Phase 4：Tool Registry

1. 把现有 tools 抽到 registry。
2. confirm / execute 通过 registry 调度。
3. 统一 unknown / disabled / invalid args 处理。

### Phase 5：文档生成接入

1. `mode: "document"` 使用同一 graph。
2. final answer 可以变成 document draft。
3. `maybe_write_document` 复用已有保存确认。

## 测试计划

### Skill 缺失

- 没有 `.thinkingkity/skill`：AI 正常回答。
- AI 请求不存在 skill：最终回答说明 skill 不可用，不卡住。
- skill disabled：不会加载。

### Tool 缺失

- registry 禁用 `browse_page`：AI 请求时不执行，最终说明不可用。
- AI 请求未知 tool：不执行。
- tool 参数非法：不执行。

### Skill 用不上

- 加载了 skill，但 replan 认为不相关：走 direct answer。
- 多个 skill 冲突：按 AI replan 和安全策略处理。

### Tool 用不上

- tool result 为空：回答说明信息不足。
- 用户拒绝 tool：回答说明无法获取外部信息。
- tool 失败：回答包含失败原因。

### 正常路径

- 无 skill 无 tool：2 次 AI 或未来优化 1 次。
- skill 无 tool：plan -> load skill -> final。
- tool 无 skill：plan -> confirm tool -> execute -> final。
- skill + tool：plan -> load skill -> replan -> confirm tool -> execute -> final。

## 验收标准

- 固定 graph 能处理所有路径，不出现永久 pending。
- Skill index 能被注入 plan 阶段。
- AI 能请求完整 skill。
- 完整 skill 能影响 tool 选择和最终回答。
- Tool 不存在 / skill 不存在都有明确降级。
- 用户拒绝 tool 后能生成合理回答。
- skill 不能绕过 tool 确认和权限。
- debug 能看到每个节点和上下文。

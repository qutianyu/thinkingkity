# AI 外部知识获取与目录上下文能力设计

## 背景

当前 ThinkingKity 的 AI 能力主要依赖三类输入：

- 当前 AI 会话消息。
- session memory。
- 用户手动附加的单个 Vault 文件。

这对“基于已有笔记问答”足够，但还不够支撑更强的 AI 工作流：

1. 用户没有选择任何文档，直接提问时，AI 可能缺少必要背景知识，需要通过 HTTP、搜索或浏览器获取外部信息。
2. 用户不只想选择单篇文章，而是希望把一整个目录作为输入，例如一个项目目录、一组会议记录、一个专题资料夹。

这份文档设计的是在已完成的“AI 对话落地成文档 / AI 受控写文件”能力之上的叠加能力。原能力已经提供了 AI 会话、上下文附加、用户确认、受限工具执行、写入 Vault 等基础设施；本文只描述新增的外部知识获取和目录级上下文输入，不重新设计已有写文档链路。

## 目标

- AI 能在上下文不足时请求外部知识获取工具。
- 外部知识获取必须可控、可确认、可追溯。
- 第一版优先实现 HTTP 获取 URL 内容，搜索和无头浏览器作为分阶段增强。
- 用户可以选择 Vault 内目录作为 AI 上下文。
- 目录上下文必须有文件类型过滤、数量限制、内容预算和路径安全限制。
- 所有能力都复用现有 React + Tauri + Zustand + AI streaming 架构。
- 新能力要能服务已有 AI 写文档流程：AI 可以先获取外部知识或读取目录上下文，再生成/更新待写入的文档。

## 非目标

- 不让模型获得任意网络访问权限。
- 不在第一版支持登录态网页、验证码页面、复杂交互式站点。
- 不把整个大目录无上限塞进模型上下文。
- 不把目录外的文件读入 AI 上下文。
- 不在第一版引入后端云服务。
- 不重做已完成的 AI 写文档、写入确认、Vault 内受限写入能力。

## 现有基础

项目已经具备这些基础：

- 前端：React 19、TypeScript、Vite。
- 状态管理：Zustand。
- 桌面端：Tauri v2。
- HTTP 插件：`@tauri-apps/plugin-http` 已在 `package.json` 中存在。
- Tauri capability：`src-tauri/capabilities/default.json` 已允许 `http://*` 和 `https://*`。
- AI 流式调用：`src/ai/client.ts` 中的 `streamProviderChat()`。
- 上下文构造：`src/ai/contextBuilder.ts`。
- 单文件上下文搜索：`src/ai/articleSearch.ts`。
- 会话持久化：`src/ai/sessionTypes.ts`、`sessionManager.ts`、`sessionStorage.ts`。
- AI 写文件基础：已具备 `write_markdown_document` 类受控工具、页面确认、Vault 内受限写入和写入结果留痕。

## 总体架构

在现有 AI 写文件工具基础上，新增两类受控输入工具：

```text
AI 知识工具
  - fetch_url
  - search_web
  - browse_page

Vault 上下文工具
  - attach_file
  - attach_directory
```

第一版沿用现有 AI 写文档能力里的应用内受控工具模型，不直接接 provider 原生 tool calling。原因是当前 `client.ts` 把 OpenAI-compatible 和 Anthropic 统一成“流式文本”接口，直接接两边的 tool protocol 会让 provider 差异扩散到 UI 和 session 层。

推荐第一版采用应用内受控工具模型：

```text
用户提问
  -> AI 判断信息不足
  -> AI 以约定格式请求工具
  -> 前端解析工具意图
  -> 页面展示确认
  -> 用户确认
  -> 应用执行 HTTP / 目录扫描
  -> 工具结果写入本轮上下文
  -> AI 继续回答
```

后续如果接 provider 原生 tools，只需要把 provider tool call 转换成相同的内部工具类型。现有写文件工具、新增联网工具、新增目录工具应共享一套确认、执行、结果回填机制。

## 与已完成写文档能力的关系

已有能力负责“产物落地”：

```text
AI 对话 / 草稿
  -> write_markdown_document 工具
  -> 页面确认
  -> Vault 内受限写入
  -> 打开新文档
```

本文新增能力负责“输入增强”：

```text
外部知识 / 目录上下文
  -> 工具确认
  -> 工具执行
  -> 结果进入 AI 上下文
  -> AI 回答或生成文档
  -> 复用已有写文档能力落地
```

组合后的完整链路：

```text
用户提出任务
  -> AI 判断需要更多输入
  -> fetch_url / attach_directory
  -> 用户确认
  -> 工具结果回填上下文
  -> AI 生成回答或文档草稿
  -> write_markdown_document
  -> 用户确认
  -> 写入 Vault
```

因此，本能力不新增任何绕过用户确认的写入路径，也不改变已有写文件权限模型。

## 核心类型

### 上下文引用

当前 `AiArticleContextRef` 只有 `type: "file"`，需要扩展为联合类型。

修改 `src/ai/sessionTypes.ts`：

```ts
export interface AiFileContextRef {
  type: "file";
  path: string;
  title: string;
  added_at?: string;
}

export interface AiDirectoryContextRef {
  type: "directory";
  path: string;
  title: string;
  recursive: boolean;
  added_at?: string;
}

export type AiArticleContextRef = AiFileContextRef | AiDirectoryContextRef;
```

保留 `AiArticleContextRef` 名称可以降低改动面，现有使用方只需要处理 `file | directory` 分支。

### 外部知识工具

新增 `src/ai/toolTypes.ts`：

```ts
export interface AiFetchUrlToolCall {
  tool: "fetch_url";
  url: string;
  purpose: string;
}

export interface AiSearchWebToolCall {
  tool: "search_web";
  query: string;
  maxResults: number;
  purpose: string;
}

export interface AiBrowsePageToolCall {
  tool: "browse_page";
  url: string;
  purpose: string;
}

export type AiKnowledgeToolCall =
  | AiFetchUrlToolCall
  | AiSearchWebToolCall
  | AiBrowsePageToolCall;

export interface AiKnowledgeToolResult {
  ok: boolean;
  tool: AiKnowledgeToolCall["tool"];
  source: string;
  title?: string;
  content?: string;
  error?: string;
  fetched_at: string;
}
```

### 工具确认状态

新增 UI 状态类型：

```ts
export interface PendingAiToolRequest {
  id: string;
  call: AiKnowledgeToolCall;
  status: "pending-confirmation" | "running" | "done" | "error" | "cancelled";
  result?: AiKnowledgeToolResult;
}
```

第一版工具请求不需要持久化到 session 文件；工具结果应作为本轮请求上下文写入，必要时可以在 assistant 消息中简短留痕。

## 能力一：AI 外部知识获取

### 分阶段方案

#### Phase 1：fetch_url

实现 URL 内容获取，适合用户给出明确链接，或 AI 判断需要读取某个 URL。

技术选型：

- 前端封装：`src/lib/webTools.ts`。
- HTTP 能力：`@tauri-apps/plugin-http` 的 `fetch`。
- HTML 转文本：第一版可用 `DOMParser` + DOM 清理，不新增依赖。

适用场景：

- 用户问“总结这个链接”。
- 用户问某个网页内容，并提供 URL。
- AI 需要读取公开 HTML、JSON、纯文本。

不适用：

- 需要执行 JS 渲染的页面。
- 需要登录的页面。
- 需要搜索引擎结果页。

#### Phase 2：search_web

实现搜索工具，但不建议直接爬搜索引擎 HTML。建议要求用户配置搜索服务：

- Brave Search API。
- SerpAPI。
- Tavily。
- 自定义搜索 API endpoint。

配置位置：

- Vault 配置 `config.json` 的 `ai.tools.search`。
- 或全局设置，后续再决定。

第一版可以只定义接口和 UI，不实现真实搜索，避免引入 API key 管理复杂度。

#### Phase 3：browse_page

无头浏览器能力用于动态页面。

可选实现路线：

1. Tauri sidecar Node 进程 + Playwright。
2. Rust 侧接 `headless_chrome` 一类库。
3. 调系统浏览器不适合，因为无法稳定读取渲染后的 DOM。

推荐路线是 sidecar + Playwright，但作为二期能力：

- 打包复杂度高。
- 浏览器二进制体积大。
- 跨平台发布和权限处理复杂。
- 页面执行 JS 有更高安全风险。

第一版文档里只保留接口，不把无头浏览器纳入 MVP。

### HTTP 工具实现细节

新增 `src/lib/webTools.ts`：

```ts
import { fetch } from "@tauri-apps/plugin-http";

const MAX_FETCH_BYTES = 1024 * 1024;
const MAX_EXTRACTED_CHARS = 60 * 1024;

export async function fetchUrlText(url: string): Promise<AiKnowledgeToolResult> {
  const safeUrl = validatePublicHttpUrl(url);
  const res = await fetch(safeUrl, {
    method: "GET",
    headers: {
      Accept: "text/html,application/xhtml+xml,text/plain,application/json;q=0.9,*/*;q=0.8",
    },
  });
  const contentType = res.headers.get("content-type") ?? "";
  const raw = await res.text();
  const text = extractReadableText(raw, contentType).slice(0, MAX_EXTRACTED_CHARS);
  return {
    ok: true,
    tool: "fetch_url",
    source: safeUrl,
    content: text,
    fetched_at: new Date().toISOString(),
  };
}
```

`validatePublicHttpUrl()` 必须拒绝：

- 非 `http:` / `https:`。
- `file:`、`data:`、`javascript:`。
- localhost、`127.0.0.0/8`、`0.0.0.0`。
- 私有网段：`10.0.0.0/8`、`172.16.0.0/12`、`192.168.0.0/16`。
- link-local：`169.254.0.0/16`。
- IPv6 local：`::1`、`fc00::/7`、`fe80::/10`。

这是为了避免 SSRF 类问题。即使 Tauri capability 允许宽泛 HTTP，AI 工具层也必须做自己的 URL 限制。

### HTML 内容提取

新增：

```ts
export function extractReadableText(raw: string, contentType: string): string
```

规则：

- JSON：格式化截断。
- text/plain：直接截断。
- HTML：
  - 使用 `DOMParser`。
  - 移除 `script`、`style`、`noscript`、`svg`、`canvas`。
  - 优先读取 `article`、`main`、`body`。
  - 合并连续空白。
  - 提取 `title`。

第一版不引入 Readability 依赖。后续如果质量不足，可以增加 `@mozilla/readability`。

### 工具调用协议

因为当前 provider client 还没有 tool calling，第一版可用“结构化标记”让模型表达工具意图。

新增 prompt 约束：

```text
当你需要外部知识时，不要编造。请输出：
<tool_call>{"tool":"fetch_url","url":"https://...","purpose":"..."}</tool_call>
```

新增 `src/ai/toolParser.ts`：

```ts
export function parseAiToolCall(content: string): AiKnowledgeToolCall | null
```

解析规则：

- 只接受完整 `<tool_call>...</tool_call>`。
- JSON parse 后校验字段。
- 同一条回复第一版只处理一个工具调用。
- 无效工具调用按普通文本展示，并提示解析失败。

更稳的做法是后续把 `streamProviderChat()` 扩展为 provider tools，但第一版结构化标记实现成本低。

### 用户确认

所有外部知识工具必须确认：

- `fetch_url`：展示 URL、用途、将发送网络请求。
- `search_web`：展示 query、结果数量、搜索服务。
- `browse_page`：展示 URL、用途、动态页面执行风险。

确认后才执行工具。用户取消时，工具结果为：

```ts
{
  ok: false,
  tool: "fetch_url",
  source: "https://example.com",
  error: "User cancelled",
  fetched_at: "..."
}
```

AI 继续回答时应知道“用户取消了联网”，不能假装已经获取了信息。

### 回填上下文

新增 `src/ai/toolContext.ts`：

```ts
export function buildKnowledgeToolContext(results: AiKnowledgeToolResult[]): AiChatMessage[]
```

生成 system message：

```text
External knowledge gathered by approved tools:

<source url="https://example.com" fetched_at="...">
...
</source>
```

`buildChatMessages()` 增加可选参数：

```ts
export async function buildChatMessages(
  vaultPath: string,
  session: AiSessionData,
  memory: string,
  language: string,
  articleRefs?: AiArticleContextRef[],
  toolResults?: AiKnowledgeToolResult[],
): Promise<AiChatMessage[]>
```

工具结果只进入本轮请求，不默认持久化全文，避免 session 文件膨胀。

## 能力二：目录作为 AI 输入

### 用户体验

在 AI 上下文选择器中，允许选择文件或目录：

- 文件：现有行为。
- 目录：显示目录图标，可选择是否递归。
- chip 文案：`notes/meeting/`。
- tooltip 展示目录路径和递归状态。

用户发送消息时，目录上下文和文件上下文一样是一轮 one-shot context，保存在该用户消息的 `context_refs` 中用于追溯。

### 数据结构

修改 `AiArticleContextRef` 为联合类型后：

- `attached_context` 可以同时包含文件和目录。
- `context_refs` 可以保存本轮使用过的目录。
- 旧 session 中只有 `type: "file"`，兼容无迁移成本。

`sessionStorage.ts` 的 `normalizeArticleRef()` 需要支持目录：

```ts
function normalizeArticleRef(value: unknown): AiArticleContextRef | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Partial<AiArticleContextRef>;
  if (raw.type === "file") { ... }
  if (raw.type === "directory") {
    if (typeof raw.path !== "string" || !raw.path) return null;
    return {
      type: "directory",
      path: raw.path,
      title: typeof raw.title === "string" ? raw.title : pathBasename(raw.path),
      recursive: raw.recursive !== false,
      added_at: typeof raw.added_at === "string" ? raw.added_at : undefined,
    };
  }
  return null;
}
```

### 目录扫描

新增 `src/ai/directoryContext.ts`：

```ts
export interface DirectoryContextOptions {
  recursive: boolean;
  maxFiles: number;
  maxTotalChars: number;
  maxFileChars: number;
}

export async function expandDirectoryContext(
  vaultPath: string,
  ref: AiDirectoryContextRef,
  options: DirectoryContextOptions,
): Promise<AiFileContextRef[]>
```

默认限制：

```ts
const DEFAULT_DIRECTORY_CONTEXT_OPTIONS = {
  recursive: true,
  maxFiles: 80,
  maxTotalChars: 160 * 1024,
  maxFileChars: 24 * 1024,
};
```

文件筛选规则复用 `articleSearch.ts` 中的 `canUseAsContextFile()` 逻辑，但建议抽到共享模块：

新增 `src/ai/contextFileRules.ts`：

```ts
export function canUseAsAiTextContext(path: string): boolean
```

跳过：

- 图片。
- PDF。
- 二进制文件。
- `.thinkingkity/`。
- `node_modules/`。
- `dist/`、`target/`、`.git/`。
- 超大文件。

目录扫描必须使用 Vault 相对路径，且只能从当前 Vault 根目录下展开。

### 内容预算

目录不能简单读完整内容。构建上下文时采用两层结构：

1. 目录索引：列出被选中的文件路径。
2. 内容摘录：按预算读取每个文件。

上下文格式：

```text
<directory path="notes/project" recursive="true" files="12" truncated="true">
<file path="notes/project/README.md">
...
</file>
<file path="notes/project/spec.md" truncated="true">
...
</file>
</directory>
```

预算耗尽后仍保留文件索引，但不继续读取内容。这样 AI 至少知道目录里有哪些文件。

### contextBuilder 改造

当前函数：

```ts
readAttachedArticleContext(vaultPath, refs)
```

需要支持 file/directory：

```ts
export async function readAttachedArticleContext(
  vaultPath: string,
  refs: AiArticleContextRef[],
): Promise<string>
```

实现：

- `file`：沿用现有读取逻辑。
- `directory`：调用 `expandDirectoryContext()`，再按预算读取文件内容。
- 同一路径去重。
- 目录里包含已单独选择的文件时，只读一次。

### articleSearch 改造

当前 `searchArticleContexts()` 只返回文件。改为：

```ts
export async function searchArticleContexts(
  vaultPath: string,
  query: string,
): Promise<AiArticleContextRef[]>
```

行为：

- 目录名命中时返回 `type: "directory"`。
- 文件名命中时返回 `type: "file"`。
- 结果中目录优先展示在同层文件之前。
- 仍限制 `MAX_RESULTS`，避免 UI 过载。

UI 上目录结果使用 folder 图标，文件结果使用 file 图标。

## 权限与安全

### 网络工具

- 所有联网工具调用必须页面确认。
- 默认关闭“自动联网”。
- URL 必须经过 allow/deny 校验。
- 不允许访问本机、内网、file/data/javascript URL。
- 内容必须截断。
- 工具结果必须标注 source 和 fetched_at。
- AI 必须在回答中区分“来自外部工具的信息”和“基于已有上下文的推断”。

### 目录上下文

- 只能选择当前 Vault 内目录。
- 路径保存为 Vault 相对路径。
- 禁止目录逃逸。
- 禁止读取 `.thinkingkity/`。
- 默认跳过构建产物和依赖目录。
- 必须有 max files、max chars、max depth 或 recursive 开关。

## 核心代码改动清单

### 新增文件

- `src/ai/toolTypes.ts`
- `src/ai/toolParser.ts`
- `src/ai/toolContext.ts`
- `src/ai/knowledgeTools.ts`
- `src/ai/directoryContext.ts`
- `src/ai/contextFileRules.ts`
- `src/lib/webTools.ts`
- `src/ai/ToolConfirmModal.tsx`

### 修改文件

- `src/ai/sessionTypes.ts`：`AiArticleContextRef` 改为 file/directory 联合类型。
- `src/ai/sessionStorage.ts`：normalize 支持 directory。
- `src/ai/contextBuilder.ts`：支持目录展开和工具结果上下文。
- `src/ai/articleSearch.ts`：搜索文件和目录。
- `src/ai/AiChatDock.tsx`：工具调用解析、确认、执行、二次请求。
- `src/ai/prompts/chat-system.zh-CN.txt` 等：加入工具调用格式和约束。
- `src/i18n/locales/*.json`：增加联网确认、目录上下文相关文案。

## AiChatDock 执行流程

当前 `handleSubmit()` 是一次请求：

```text
append user/assistant placeholder
  -> streamAiChat()
  -> saveAiSession()
```

加入工具后变成最多两段：

```text
append user/assistant placeholder
  -> streamAiChat()
  -> parseAiToolCall(assistantContent)
  -> if no tool: save assistant
  -> if tool:
       show ToolConfirmModal
       user confirms
       execute tool
       buildChatMessages(..., toolResults)
       streamAiChat() again
       save final assistant answer
```

第一版每轮最多执行一个工具调用，避免递归调用和复杂状态机。后续可以扩展为最多 3 步，但必须有清晰的进度 UI 和取消机制。

## MVP 实现顺序

1. 抽出 `contextFileRules.ts`，统一 AI 可读文件类型判断。
2. 扩展 `AiArticleContextRef` 为 file/directory。
3. 改造 `sessionStorage.ts` normalize，兼容旧 session。
4. 实现 `directoryContext.ts` 和目录预算读取。
5. 改造 `articleSearch.ts` 和上下文选择器 UI，让用户能选择目录。
6. 改造 `contextBuilder.ts`，把目录展开进上下文。
7. 实现 `webTools.ts` 的 `fetchUrlText()` 和 URL 安全校验。
8. 实现 `toolParser.ts`、`ToolConfirmModal.tsx`。
9. 修改 chat system prompt，允许 AI 请求 `fetch_url`。
10. 改造 `AiChatDock.handleSubmit()`，支持确认后执行一次工具并二次回答。

`search_web` 和 `browse_page` 不进入 MVP，只保留类型和设计。

## 测试计划

### 目录上下文

- 选择单个目录后发送问题，AI 能看到目录文件索引和内容。
- 选择目录 + 单文件，重复文件只读取一次。
- 大目录触发 `maxFiles` 和 `maxTotalChars` 截断。
- `.thinkingkity/` 不被读取。
- `node_modules/`、`dist/`、`.git/` 不被读取。
- 旧 session 文件仍能正常加载。

### HTTP 工具

- 用户提供 URL，AI 请求 `fetch_url`，页面出现确认。
- 用户取消后不发起网络请求。
- 用户确认后获取网页文本并二次回答。
- `file://`、`data:`、`localhost`、内网 IP 被拒绝。
- 超长网页被截断。
- 网络失败时 AI 收到失败结果，不编造内容。

## 验收标准

- 用户能把 Vault 内目录附加给 AI。
- 目录上下文不会读取 Vault 外文件。
- 目录上下文有明确预算和截断提示。
- AI 在信息不足时能请求 `fetch_url`。
- 所有联网请求都必须经用户确认。
- URL 安全校验能阻止本地和内网访问。
- 工具结果能被 AI 用于最终回答。
- 没有引入 provider-specific tool calling 到 UI 层。

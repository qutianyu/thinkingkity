# AI 对话落地成文档能力设计

## 背景

ThinkingKity 目前已经具备 AI 对话能力：支持 OpenAI / Anthropic 流式对话、会话持久化、附加 Vault 文件作为上下文、长对话记忆压缩。现有能力更像“问答助手”，用户和 AI 交流后的结果仍停留在聊天记录里，无法稳定沉淀为 Vault 中可编辑、可检索、可继续引用的 Markdown 文档。

需要新增“对话落地成文档”能力，让 AI 能把用户和 AI 的交流过程整理成一篇可保存的文档，并写入当前 Vault。

## 目标

- 用户可以从某个 AI 会话中生成一篇 Markdown 文档。
- AI 能基于完整对话、session memory、用户附加文件上下文，提炼出结构化内容。
- 生成结果可以先预览和编辑，再保存到 Vault 指定路径。
- 保存后的文档进入现有文件树，可用现有 Markdown 编辑器继续编辑。
- 文档内保留必要来源信息，方便用户追溯它来自哪个 AI 会话、哪些上下文文件。

## 非目标

- 不在第一版实现跨会话综合写作。
- 不在第一版实现自动后台持续写入文档。
- 不在第一版实现复杂的多人协作、版本冲突合并。
- 不替代普通聊天回复；它是聊天后的“产物生成”能力。

## 用户体验

### 入口

在 AI Chat Dock 的会话操作区新增一个 `生成文档` 按钮。按钮在以下条件满足时可用：

- 当前 Vault 已打开。
- 当前会话存在至少一条用户消息和一条有效 AI 回复。
- 当前没有流式生成中的请求。

### 推荐流程

1. 用户完成一段 AI 交流。
2. 点击 `生成文档`。
3. 弹出文档生成面板，用户选择：
   - 文档类型：总结、方案、会议纪要、需求文档、技术设计、自由格式。
   - 保存位置：默认 `AI Notes/`。
   - 文件名：默认由 AI 或本地规则生成。
   - 是否包含来源区块。
4. AI 生成 Markdown 草稿。
5. 用户在预览区检查并可直接编辑。
6. 用户点击 `保存到 Vault`。
7. 应用写入 `.md` 文件，刷新文件树并打开该文件。

### 快捷指令

聊天输入中也支持自然语言触发，例如：

- “把这次讨论整理成一篇需求文档”
- “落成技术设计文档”
- “生成一份会议纪要并保存”

第一版可以先只做按钮入口。自然语言触发可作为第二阶段，通过意图识别接入同一套生成流程。

## 文档形态

保存的 Markdown 建议包含 frontmatter，便于后续检索、追溯和扩展：

```markdown
---
title: "AI 生成的文档标题"
created: "2026-05-02T12:00:00.000Z"
source: "ai-session"
session_id: "..."
session_title: "..."
context_files:
  - "notes/example.md"
---

# AI 生成的文档标题

正文内容...

## 来源

- AI 会话：...
- 上下文文件：...
```

frontmatter 中只保存轻量元数据，不保存完整对话，避免文档过大和隐私扩散。完整对话仍由现有 `.thinkingkity/sessions/` 管理。

## 架构设计

### 现有技术栈

这个能力基于项目现有技术栈实现，不引入新的大框架：

- 前端：React 19 + TypeScript + Vite。
- 状态管理：Zustand，复用 `useVaultStore`、`useFileTreeStore`、`useEditorStore`。
- 桌面端：Tauri v2，Rust 后端提供文件系统命令。
- AI 请求：复用 `src/ai/client.ts` 中的 OpenAI-compatible / Anthropic 流式请求。
- Prompt：复用 `src/ai/promptConfig.ts` 的 raw text prompt 加载机制。
- 文件读写：普通编辑器继续使用 `writeFile()`；AI 写文档使用新增的受限 Tauri command。

### 现有 AI 架构约束

当前 AI 聊天链路是：

```text
AiChatDock
  -> buildChatMessages()
  -> streamAiChat()
  -> streamProviderChat()
  -> OpenAI-compatible / Anthropic streaming API
  -> saveAiSession()
```

这个链路目前只支持“流式文本回复”，还没有 provider 原生 tool calling 抽象。因此第一版不要直接接 OpenAI / Anthropic 的原生 tool call 协议，否则会把 provider 差异引入 UI 层。

第一版采用应用内受控工具模型：

```text
AI 生成 Markdown 草稿
  -> 前端构造 write_markdown_document 工具调用意图
  -> 页面展示确认弹窗
  -> 用户确认
  -> 调用 Tauri 受限写入命令
  -> 返回工具执行结果给聊天上下文
```

这样产品语义仍然是“AI 可以写文件”，但真正的写入执行点在应用受控工具里，路径和确认策略可控。后续如果要接 provider 原生 tool calling，可以把 provider tool call 统一转换成同一个 `AiWriteMarkdownToolCall`，其余写入链路不变。

### 新增模块

建议在 `src/ai` 下新增独立模块：

- `documentTypes.ts`：文档生成相关类型。
- `documentPrompts.ts` 或复用 `promptConfig.ts`：文档生成 prompt 配置。
- `documentGenerator.ts`：构建请求、调用模型、返回 Markdown 草稿。
- `documentWriter.ts`：生成安全文件名、处理路径、写入 Vault。
- `DocumentDraftModal.tsx`：文档生成和预览保存 UI。

还需要修改：

- `src/ai/promptConfig.ts`：增加 `documentGenerate` prompt kind。
- `src/ai/client.ts`：不必改 provider 协议，复用 `streamProviderChat()` 即可。
- `src/ai/AiChatDock.tsx`：增加生成文档入口、工具确认弹窗状态、保存后工具结果消息。
- `src/lib/tauriCommands.ts`：新增 `writeVaultMarkdownFile()` 前端封装。
- `src-tauri/src/commands.rs`：新增 `write_vault_markdown_file` 后端命令。
- `src-tauri/src/main.rs`：把新命令注册到 Tauri invoke handler。
- `src/i18n/locales/*.json`：补充按钮、确认弹窗、错误提示文案。

### 核心类型

```ts
export type AiDocumentKind =
  | "summary"
  | "proposal"
  | "meeting-notes"
  | "requirements"
  | "technical-design"
  | "custom";

export interface AiDocumentDraftOptions {
  kind: AiDocumentKind;
  customInstruction?: string;
  includeSources: boolean;
  targetDirectory: string;
  fileName: string;
}

export interface AiDocumentDraft {
  title: string;
  markdown: string;
  suggestedFileName: string;
  sourceSessionId: string;
  contextFiles: string[];
}
```

写文件工具类型：

```ts
export type AiDocumentWriteMode = "create";

export interface AiWriteMarkdownToolCall {
  tool: "write_markdown_document";
  relativePath: string;
  content: string;
  mode: AiDocumentWriteMode;
}

export interface AiWriteMarkdownToolResult {
  ok: boolean;
  relativePath?: string;
  error?: string;
  cancelled?: boolean;
}
```

第一版只实现 `create`。`overwrite`、`append`、`patch` 即使后续加入，也必须走同一个确认弹窗和后端路径校验。

### 请求上下文

生成文档时不应只取最近几轮消息。它需要比普通聊天更完整的上下文：

1. `session-memory`：现有压缩记忆。
2. 当前会话中所有未压缩消息。
3. 最近若干条已压缩消息作为风格和细节补充。
4. 用户本轮附加过的文件引用。
5. 必要时读取引用文件内容，但沿用 `contextBuilder.ts` 的截断策略，避免请求过大。

可以新增 `buildDocumentMessages()`，不要直接复用 `buildChatMessages()`：

- 普通聊天重视连续对话体验。
- 文档生成重视完整性、结构和可落地性。
- 两者 token 策略不同，独立函数更清晰。

### Prompt 策略

新增文档生成系统 prompt，按语言维护：

- `src/ai/prompts/document-generate.zh-CN.txt`
- `src/ai/prompts/document-generate.zh-TW.txt`
- `src/ai/prompts/document-generate.en-US.txt`

核心约束：

- 输出必须是完整 Markdown 文档。
- 不要输出聊天式开场白。
- 不要编造对话中没有的信息。
- 对未确定事项用 `待确认` 标记。
- 保留用户决策、约束、结论、行动项。
- 根据文档类型调整结构。

文档类型可以作为额外 system message 或 user message 传入，不建议把所有类型模板硬编码在一个巨大 prompt 里。

### buildDocumentMessages 设计

新增 `src/ai/documentGenerator.ts`，其中核心函数：

```ts
export async function buildDocumentMessages(options: {
  vaultPath: string;
  session: AiSessionData;
  memory: string;
  language: string;
  documentOptions: AiDocumentDraftOptions;
}): Promise<AiChatMessage[]>
```

和 `buildChatMessages()` 的区别：

- system prompt 使用 `documentGenerate`。
- 会话消息不是只取最近尾部，而是尽量包含所有未总结消息。
- 如果 `memory` 存在，放在 system message 中作为压缩后的历史。
- 读取用户消息里的 `context_refs`，去重后读取文件内容。
- 对超长文件继续复用 `readAttachedArticleContext()` 的截断策略。
- 末尾追加一个 user message，明确文档类型、输出语言、是否包含来源、不要输出解释性前后缀。

伪代码：

```ts
const contextRefs = collectSessionContextRefs(session);
return [
  { id: "system", role: "system", content: getAiPrompt("documentGenerate", language) },
  memoryMessageIfAny,
  fileContextMessageIfAny,
  ...selectDocumentSourceMessages(session),
  {
    id: "document-request",
    role: "user",
    content: renderDocumentRequest(documentOptions),
  },
];
```

`selectDocumentSourceMessages()` 的第一版策略：

- 包含所有 `summarized !== true` 的消息。
- 额外包含最近 8 条消息，避免压缩边界丢失上下文。
- 过滤空 assistant 占位消息。
- 保留 `role`、`content`、`created_at`。

### 草稿生成

`generateDocumentDraft()` 复用现有 streaming：

```ts
export async function generateDocumentDraft(options: {
  ai: AiConfig;
  vaultPath: string;
  session: AiSessionData;
  memory: string;
  language: string;
  documentOptions: AiDocumentDraftOptions;
  signal?: AbortSignal;
  onToken?: (token: string) => void;
}): Promise<AiDocumentDraft>
```

实现要点：

- 调用 `buildDocumentMessages()`。
- 调用 `streamProviderChat()`。
- `onToken` 实时更新 modal 中的 Markdown textarea。
- 生成结束后从 Markdown 第一个 `# ` 标题推导 `title`。
- `suggestedFileName` 由本地 slug 规则生成，不完全信任模型给出的文件名。

## 权限与安全边界

这个能力的核心原则是：产品语义上允许“AI 写文件”，但 AI 只能通过 ThinkingKity 提供的受控写入工具完成写入，不能获得任意文件系统写权限。写入工具必须把目标路径限制在当前 Vault 目录下。

### 权限模型

- AI 可以发起“创建/更新 Markdown 文档”的工具调用。
- AI 工具调用只允许传入 Vault 相对路径和 Markdown 内容。
- AI 不能传入绝对路径作为最终写入路径。
- AI 不能决定写入 Vault 外部目录。
- 用户界面只允许选择或输入 Vault 相对路径。
- 所有写入相关动作都必须在页面上展示确认界面，用户确认后才执行。
- 应用侧在写入前必须重新校验目标路径，即使路径来自 UI 控件也不能信任。
- Tauri 后端也应做最终路径校验，前端校验只作为体验优化。

### 路径规则

文档保存 API 接收的路径应是 Vault 相对路径，例如：

```ts
interface SaveAiDocumentRequest {
  vaultPath: string;
  relativePath: string;
  markdown: string;
}
```

禁止直接接收 AI 或 UI 传入的完整文件系统路径作为写入目标。AI 工具调用和 UI 保存动作都只能提交 `relativePath`，应用侧根据当前 `vaultPath` 和 `relativePath` 拼出最终路径。

保存前必须拒绝以下路径：

- 空路径。
- 绝对路径，例如 `/tmp/a.md`、`C:\Users\...`。
- 包含 `..` 路径段的路径。
- 包含 `~` 展开语义的路径。
- 包含控制字符的路径。
- 指向目录而非 `.md` 文件的路径。
- 解析后不在当前 Vault 根目录内的路径。
- 指向 `.thinkingkity/` 内部元数据目录的路径，除非未来明确设计内部写入 API。

### 推荐校验流程

前端可以做一层轻量校验，但最终以后端校验为准：

1. UI 只展示 Vault 内目录。
2. 用户输入保存目录和文件名，前端合成 `relativePath`。
3. 前端做基础清洗和提示。
4. 页面展示写入确认界面，包含目标路径、写入模式、内容预览和风险提示。
5. 用户点击确认后，AI 工具调用或 UI 保存动作才调用后端命令 `write_vault_markdown_file(vaultPath, relativePath, content)`。
6. 后端 canonicalize `vaultPath`。
7. 后端将 `relativePath` 按普通路径段拼接到 Vault 根目录。
8. 后端 canonicalize 目标父目录；如果文件尚不存在，只 canonicalize 已存在的父目录。
9. 后端确认目标路径仍以 Vault 根目录为前缀。
10. 后端拒绝 `.thinkingkity/` 内部目录。
11. 后端创建必要父目录并写入文件。

### Tauri 后端建议

现有 `writeFile()` 是通用文件写入能力，适合编辑器保存已打开文件，但不适合直接暴露给 AI 文档落地能力。建议新增一个更窄的后端命令，作为 AI 可调用的写文件工具：

```rust
write_vault_markdown_file(vault_path: String, relative_path: String, content: String)
```

这个命令只允许：

- 写入当前 Vault 内文件。
- 写入 `.md` 文件。
- 自动创建 Vault 内的父目录。
- 不覆盖 `.thinkingkity/` 内部文件。

这样即使 AI 主动请求写文件、前端状态异常或 UI 输入出现问题，写入能力仍被后端限制在 Vault 沙箱里。

### 后端实现细节

修改 `src-tauri/src/commands.rs`，不要复用现有 `resolve_path()` 作为唯一防线。`resolve_path()` 只拒绝空路径和 `..`，但它不知道 Vault 根目录，也无法阻止写到 Vault 外的绝对路径。AI 写文档需要专门的路径解析函数。

建议新增：

```rust
fn resolve_vault_relative_markdown_path(
    vault_path: &str,
    relative_path: &str,
) -> Result<PathBuf, String>
```

校验要点：

- `vault_path` 必须非空，并且 canonicalize 后是目录。
- `relative_path` 必须是相对路径。
- 拒绝 `Prefix`、`RootDir`、`ParentDir`、控制字符。
- 拒绝第一个路径段是 `.thinkingkity`。
- 扩展名必须是 `.md`。
- 目标父目录必须在 Vault 内。
- 文件已存在时第一版返回错误，不覆盖。

Rust 伪代码：

```rust
fn resolve_vault_relative_markdown_path(
    vault_path: &str,
    relative_path: &str,
) -> Result<PathBuf, String> {
    if vault_path.trim().is_empty() || relative_path.trim().is_empty() {
        return Err("Path is empty.".to_string());
    }

    let vault = Path::new(vault_path)
        .canonicalize()
        .map_err(|e| format!("Invalid vault path: {}", e))?;
    if !vault.is_dir() {
        return Err("Vault path is not a directory.".to_string());
    }

    let rel = Path::new(relative_path);
    if rel.is_absolute() {
        return Err("Absolute paths are not allowed.".to_string());
    }

    for component in rel.components() {
        match component {
            std::path::Component::Normal(part) => {
                let text = part.to_string_lossy();
                if text.chars().any(|ch| ch.is_control()) {
                    return Err("Control characters are not allowed.".to_string());
                }
            }
            _ => return Err("Only normal relative path segments are allowed.".to_string()),
        }
    }

    if rel.components().next().and_then(|c| c.as_os_str().to_str()) == Some(".thinkingkity") {
        return Err("Writing internal vault metadata is not allowed.".to_string());
    }

    if rel.extension().and_then(|v| v.to_str()) != Some("md") {
        return Err("Only Markdown files can be written.".to_string());
    }

    let target = vault.join(rel);
    let parent = target.parent().ok_or_else(|| "Missing parent directory.".to_string())?;
    let existing_parent = nearest_existing_parent(parent)?;
    let canonical_parent = existing_parent
        .canonicalize()
        .map_err(|e| format!("Invalid parent directory: {}", e))?;

    if !canonical_parent.starts_with(&vault) {
        return Err("Target path must stay inside the vault.".to_string());
    }

    Ok(target)
}
```

`nearest_existing_parent()` 用于处理新目录还不存在的情况：从目标父目录往上找第一个存在目录，确保它仍在 Vault 内，再允许 `create_dir_all()` 创建后续目录。

新增 Tauri command：

```rust
#[tauri::command]
pub fn write_vault_markdown_file(
    vault_path: &str,
    relative_path: &str,
    content: &str,
) -> Result<String, String> {
    let target = resolve_vault_relative_markdown_path(vault_path, relative_path)?;
    if target.exists() {
        return Err("File already exists.".to_string());
    }
    if let Some(parent) = target.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    fs::write(&target, content).map_err(|e| e.to_string())?;
    Ok(target.to_string_lossy().to_string())
}
```

返回值建议是最终写入的完整路径，前端保存成功后可以直接 `openFile(fullPath)`。

还需要在 `src-tauri/src/main.rs` 的 `invoke_handler` 中注册 `write_vault_markdown_file`：

```rust
.invoke_handler(tauri::generate_handler![
    commands::read_directory,
    commands::read_file,
    commands::write_file,
    commands::write_vault_markdown_file,
    // ...
])
```

### AI 写文件工具

建议把 AI 写文件能力建模成一个显式工具，而不是让聊天回复中夹带特殊语法：

```ts
interface AiWriteMarkdownToolCall {
  tool: "write_markdown_document";
  relativePath: string;
  content: string;
  mode: "create";
}
```

第一版只支持 `mode: "create"`，不支持覆盖已有文件。工具执行前应用侧必须展示待写入路径和内容预览，用户确认后再写入。后续如果希望做到“AI 自动落文档”，也必须保留页面确认步骤；Vault 级授权只能减少重复配置，不能跳过单次写入确认。

工具调用结果应回传给 AI：

```ts
interface AiWriteMarkdownToolResult {
  ok: boolean;
  relativePath?: string;
  error?: string;
}
```

AI 收到成功结果后，可以在聊天中提示用户文档已创建；收到失败结果时，只能解释失败原因，不能尝试写 Vault 外路径。

### 前端工具执行链路

新增 `src/ai/documentWriter.ts`：

```ts
export async function prepareWriteMarkdownToolCall(options: {
  vaultPath: string;
  draft: AiDocumentDraft;
  targetDirectory: string;
  fileName: string;
}): Promise<AiWriteMarkdownToolCall>
```

职责：

- 清洗目录和文件名。
- 保证文件名以 `.md` 结尾。
- 生成 Vault 相对路径，例如 `AI Notes/2026-05-02-ai-design.md`。
- 不接受模型输出的绝对路径。
- 不在前端做最终安全承诺，最终以后端校验为准。

新增 `src/lib/tauriCommands.ts` 封装：

```ts
export async function writeVaultMarkdownFile(
  vaultPath: string,
  relativePath: string,
  content: string,
): Promise<string> {
  if (IS_TAURI) {
    return invoke<string>("write_vault_markdown_file", {
      vaultPath,
      relativePath,
      content,
    });
  }
  const target = pathJoin(vaultPath, relativePath);
  await writeFile(target, content);
  return target;
}
```

浏览器 fallback 只用于开发预览。真实安全边界在 Tauri 后端。

新增 `DocumentWriteConfirmModal.tsx` 或合并进 `DocumentDraftModal.tsx`：

```ts
interface DocumentWriteConfirmModalProps {
  open: boolean;
  toolCall: AiWriteMarkdownToolCall | null;
  vaultPath: string;
  onConfirm: () => Promise<void>;
  onCancel: () => void;
}
```

确认弹窗必须展示 `relativePath`、`mode`、文件是否存在、Markdown 预览。第一版如果无法可靠判断文件是否存在，可以在点击确认后由后端返回 `File already exists.`，前端保持弹窗不关闭并展示错误。

### AiChatDock 接入点

修改 `src/ai/AiChatDock.tsx`：

- 增加 `FilePlus2` 或 `FileText` 图标按钮，放在 session 操作区。
- 增加状态：

```ts
const [documentModalOpen, setDocumentModalOpen] = useState(false);
const [documentDraft, setDocumentDraft] = useState<AiDocumentDraft | null>(null);
const [pendingWriteToolCall, setPendingWriteToolCall] = useState<AiWriteMarkdownToolCall | null>(null);
```

- `canGenerateDocument`：

```ts
const canGenerateDocument = Boolean(
  vaultPath
  && session
  && !streaming
  && session.messages.some((m) => m.role === "user" && m.content.trim())
  && session.messages.some((m) => m.role === "assistant" && m.content.trim())
);
```

- 点击按钮打开 `DocumentDraftModal`。
- modal 内调用 `generateDocumentDraft()`。
- 用户点击“写入 Vault”时，不直接写入，而是构造 `AiWriteMarkdownToolCall` 并打开确认。
- 用户确认后调用 `writeVaultMarkdownFile()`。
- 成功后调用：

```ts
await refreshTree(vaultPath);
await openFile(fullPath);
```

- 将工具结果以一条 assistant 消息追加到当前 session，内容简短即可，例如：

```text
已创建文档：AI Notes/xxx.md
```

这个追加不是文档正文，只是工具执行结果，方便会话留痕。

### 用户确认要求

所有写入相关功能都必须显式确认，包括：

- 新建文档。
- 覆盖文档。
- 追加内容。
- 局部修改或 patch。
- 重命名或移动 AI 生成的文档。
- 自动生成不冲突文件名后的实际写入。

确认界面至少展示：

- 目标 Vault。
- Vault 相对路径。
- 写入模式，例如 `create`、`overwrite`、`append`、`patch`。
- 文件是否已存在。
- Markdown 内容预览，或 patch diff。
- 确认和取消按钮。

用户取消时，不调用后端写入命令，AI 只能收到取消结果并继续留在聊天上下文中。

### 覆盖策略

默认不覆盖已有文件。目标文件已存在时，应用应自动生成不冲突路径：

```text
AI Notes/design.md
AI Notes/design-2.md
AI Notes/design-3.md
```

如果未来支持覆盖，必须由用户显式确认，不能由 AI 请求触发。

## 文件写入设计

### 默认路径

默认保存到：

```text
<vault>/AI Notes/<yyyy-mm-dd>-<slug>.md
```

如果目录不存在，保存时创建。

### 文件名规则

1. 优先使用 AI 返回的 `suggestedFileName`。
2. 移除路径分隔符、控制字符和保留字符。
3. 截断到合理长度，例如 80 字符。
4. 如果目标文件已存在，追加 `-2`、`-3`。

### 写入后动作

保存成功后：

- 调用受限后端命令 `write_vault_markdown_file()` 写入 Markdown。
- 调用 `refreshTree(vaultPath)`。
- 调用 `openFile(fullPath)` 打开新文档。
- 保留 AI 会话不变，不把草稿内容自动追加成 AI 回复，避免聊天记录膨胀。

## UI 设计

### DocumentDraftModal

面板建议包含：

- 顶部：标题、关闭按钮。
- 左侧或上方配置区：文档类型、保存目录、文件名、来源开关。
- 主体：Markdown 草稿编辑区。
- 底部：重新生成、保存到 Vault、取消。

第一版可以用普通 `<textarea>` 承载 Markdown 草稿，后续再接入现有 Markdown 编辑器预览能力。

### 状态

至少覆盖这些状态：

- `idle`：未开始。
- `generating`：正在生成草稿。
- `ready`：草稿可编辑。
- `saving`：正在写入 Vault。
- `error`：生成或保存失败。

## 失败处理

- AI 配置缺失：复用现有 `assertAiReady` 的错误提示。
- 生成中断：保留已生成草稿，允许用户保存或重新生成。
- 目标文件已存在：自动生成不冲突文件名，并在 UI 中显示最终文件名。
- 上下文文件缺失：在来源区标记缺失文件，不阻塞生成。
- 写入失败：保留草稿，不关闭弹窗。

## 与现有代码的关系

- `AiChatDock.tsx`：增加入口按钮和弹窗状态。
- `sessionTypes.ts`：无需修改现有会话结构；文档是会话产物，不是会话本体。
- `contextBuilder.ts`：可抽取 `readAttachedArticleContext()` 供文档生成复用。
- `client.ts`：复用 `streamProviderChat()`，文档生成也应支持流式草稿。
- `tauriCommands.ts`：新增受限的 Vault Markdown 写入封装，普通文件读写仍可复用 `pathJoin()` 等工具。
- `src-tauri/src/commands.rs`：新增 `write_vault_markdown_file`，在后端做 Vault 内路径校验。
- `fileTreeStore.ts` 和 `editorStore.ts`：保存后刷新树并打开文档。

## 核心代码改动清单

### 1. Prompt 配置

修改 `src/ai/promptConfig.ts`：

```ts
import documentGenerateEn from "./prompts/document-generate.en-US.txt?raw";
import documentGenerateZhCn from "./prompts/document-generate.zh-CN.txt?raw";
import documentGenerateZhTw from "./prompts/document-generate.zh-TW.txt?raw";

export type AiPromptKind = "chatSystem" | "memoryCompact" | "documentGenerate";
```

在 `PROMPTS` 中增加：

```ts
documentGenerate: {
  "en-US": documentGenerateEn,
  "zh-CN": documentGenerateZhCn,
  "zh-TW": documentGenerateZhTw,
}
```

新增 prompt 文件：

- `src/ai/prompts/document-generate.zh-CN.txt`
- `src/ai/prompts/document-generate.zh-TW.txt`
- `src/ai/prompts/document-generate.en-US.txt`

### 2. 文档类型

新增 `src/ai/documentTypes.ts`，放置：

- `AiDocumentKind`
- `AiDocumentDraftOptions`
- `AiDocumentDraft`
- `AiWriteMarkdownToolCall`
- `AiWriteMarkdownToolResult`

这些类型不要放进 `sessionTypes.ts`，避免把“会话状态”和“文档产物”耦合。

### 3. 文档生成器

新增 `src/ai/documentGenerator.ts`：

- `collectSessionContextRefs(session)`：从 `session.attached_context` 和每条 user message 的 `context_refs` 中收集文件引用。
- `selectDocumentSourceMessages(session)`：选择用于生成文档的对话消息。
- `buildDocumentMessages(options)`：构建 LLM 请求。
- `generateDocumentDraft(options)`：调用 `streamProviderChat()` 并返回 `AiDocumentDraft`。

注意：`generateDocumentDraft()` 不写文件，只生成草稿。

### 4. 文档写入器

新增 `src/ai/documentWriter.ts`：

- `sanitizeMarkdownFileName(name)`：清洗文件名。
- `buildDocumentRelativePath(directory, fileName)`：生成 Vault 相对路径。
- `prepareWriteMarkdownToolCall(options)`：构造 `write_markdown_document` 工具调用。
- `executeWriteMarkdownToolCall(options)`：用户确认后调用 `writeVaultMarkdownFile()`。

`executeWriteMarkdownToolCall()` 只能由确认弹窗的 confirm handler 调用，不能在 AI 生成完成后自动调用。

### 5. Tauri 前端封装

修改 `src/lib/tauriCommands.ts`，新增：

```ts
export async function writeVaultMarkdownFile(
  vaultPath: string,
  relativePath: string,
  content: string,
): Promise<string>
```

参数名要和 Tauri command 的 camelCase invoke 参数一致：

```ts
invoke<string>("write_vault_markdown_file", {
  vaultPath,
  relativePath,
  content,
});
```

### 6. Tauri 后端命令

修改 `src-tauri/src/commands.rs`：

- 新增 `resolve_vault_relative_markdown_path()`。
- 新增 `nearest_existing_parent()`。
- 新增 `write_vault_markdown_file()`。

修改 `src-tauri/src/main.rs`，将命令加入 invoke handler。当前项目的 Tauri 命令集中注册在 `main.rs`，新增命令必须同步注册，否则前端 invoke 会报 command not found。

### 7. AI Chat Dock

修改 `src/ai/AiChatDock.tsx`：

- 导入新模块：

```ts
import { generateDocumentDraft } from "./documentGenerator";
import {
  prepareWriteMarkdownToolCall,
  executeWriteMarkdownToolCall,
} from "./documentWriter";
import { DocumentDraftModal } from "./DocumentDraftModal";
```

- 增加按钮文案和图标。
- 增加 modal 状态。
- 成功写入后复用：

```ts
const { refreshTree } = useFileTreeStore.getState();
const { openFile } = useEditorStore.getState();
```

现有 `AiChatDock` 已经读取 `activeTabPath` 和 `vaultPath`，保存成功后直接刷新树和打开文件，不需要新增全局 store。

### 8. UI 组件

新增 `src/ai/DocumentDraftModal.tsx`：

- 配置文档类型。
- 输入保存目录和文件名。
- 展示 Markdown 草稿 textarea。
- 生成中展示 streaming 内容。
- 点击“写入 Vault”时打开确认区。
- 确认后才执行工具调用。

CSS 可以继续放在 `src/ai/styles.css`，新增类名前缀建议使用：

- `.ai-document-modal`
- `.ai-document-form`
- `.ai-document-preview`
- `.ai-document-confirm`

### 9. 国际化

修改 `src/i18n/locales/*.json` 的 `aiChat` 区块，至少新增：

- `generateDocument`
- `documentKind`
- `documentTargetDirectory`
- `documentFileName`
- `documentGenerating`
- `documentWriteConfirmTitle`
- `documentWriteConfirmDescription`
- `documentWriteConfirm`
- `documentWriteCancel`
- `documentWriteSuccess`
- `documentWriteFailed`

如果第一版只完整支持中英文，也要给其他语言提供英文 fallback 文案，避免 UI 出现 key。

## 数据流

完整数据流如下：

```text
用户点击生成文档
  -> AiChatDock 打开 DocumentDraftModal
  -> generateDocumentDraft()
  -> buildDocumentMessages()
  -> streamProviderChat()
  -> modal 实时展示 Markdown
  -> 用户编辑草稿
  -> prepareWriteMarkdownToolCall()
  -> 页面展示确认
  -> 用户确认
  -> writeVaultMarkdownFile()
  -> Tauri write_vault_markdown_file()
  -> refreshTree(vaultPath)
  -> openFile(fullPath)
  -> saveAiSession() 记录工具执行结果
```

关键点：AI 生成、用户确认、后端写入是三个明确阶段，不能合并成一个自动流程。

## MVP 实现步骤

1. 新增文档生成 prompt 和类型定义。
2. 新增 `buildDocumentMessages()`，生成面向文档的 LLM 消息。
3. 新增 `generateDocumentDraft()`，复用现有 provider streaming。
4. 新增 `write_vault_markdown_file` 后端命令，保证只能写入 Vault 内 `.md` 文件。
5. 新增 `writeVaultMarkdownFile()` 前端封装。
6. 新增 `documentWriter.ts`，构造和执行受控写入工具。
7. 实现 `DocumentDraftModal`，支持生成、编辑、确认、保存。
8. 在 `AiChatDock` 增加 `生成文档` 按钮。
9. 保存成功后刷新文件树、打开新文档，并在会话中记录工具结果。

## 测试计划

### 单元测试或轻量函数测试

如果当前项目没有前端测试框架，至少把这些函数写成纯函数，便于后续补测试：

- `sanitizeMarkdownFileName()`
- `buildDocumentRelativePath()`
- `collectSessionContextRefs()`
- `selectDocumentSourceMessages()`

### 手动验证

- 普通会话可以生成 Markdown 草稿。
- 生成中可以停止，已生成草稿不丢失。
- 点击写入时必须出现确认界面。
- 取消确认不会产生文件。
- 确认后文件写入 `AI Notes/`，文件树刷新，新文档打开。
- 已存在文件不会被覆盖。
- 尝试写 `/tmp/a.md` 失败。
- 尝试写 `../a.md` 失败。
- 尝试写 `.thinkingkity/a.md` 失败。
- 尝试写非 `.md` 文件失败。
- 生成失败时草稿弹窗不关闭。

## 后续增强

- 自然语言意图识别：用户说“帮我落一个文档”时自动打开生成面板。
- 文档模板库：用户可保存自定义模板，例如 PRD、ADR、周报。
- 双向关联：文档 frontmatter 指向 session，session summary 指向生成的文档。
- 局部更新：后续对话可以“更新刚才那篇文档”。
- 结构化提取：让模型先输出 JSON plan，再渲染 Markdown，提高稳定性。
- 质量检查：生成后自动检查标题层级、空章节、待确认项。

## 验收标准

- 能从当前 AI 会话生成一篇 Markdown 草稿。
- 草稿内容不是简单聊天摘录，而是按用户选择的文档类型组织。
- 用户可以修改草稿后保存。
- 保存后的文件出现在 Vault 文件树中，并自动打开。
- 目标文件重名时不会覆盖已有文件。
- AI 请求失败或文件写入失败时，用户已生成的草稿不会丢失。

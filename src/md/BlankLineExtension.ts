import { $node, $remark } from "@milkdown/utils";

export const blankLineNodeName = "blank_line";
const BLANK_LINE_SENTINEL = "<!--thinkingkity-blank-line-->";

type AstNode = {
  type: string;
  value?: string;
  children?: AstNode[];
  [key: string]: unknown;
};

function normalizeBlankLineSentinels(node: AstNode) {
  if (!Array.isArray(node.children)) return;
  node.children = node.children.map((child) => {
    if (
      child.type === "html" &&
      typeof child.value === "string" &&
      child.value.trim() === BLANK_LINE_SENTINEL
    ) {
      return { type: blankLineNodeName };
    }
    normalizeBlankLineSentinels(child);
    return child;
  });
}

export function encodeBlankLinesForRichEditor(markdown: string): string {
  // Split on fenced code blocks and process each segment separately.
  const parts = markdown.split(/(```[\s\S]*?```|~~~[\s\S]*?~~~)/g);
  let result = "";
  for (let i = 0; i < parts.length; i++) {
    if (i % 2 === 1) {
      // Inside code block: strip any existing sentinels (clean up already-corrupted files)
      // and preserve blank lines as-is.
      result += parts[i].split(BLANK_LINE_SENTINEL).join("");
    } else {
      // Blank lines adjacent to code block fences must stay as actual blank lines.
      // remark-stringify treats blank_line and code_block as adjacent block nodes and
      // may fail to add a newline between them, causing the sentinel and code fence to
      // land on the same line which renders as literal HTML in the code block.
      let text = parts[i];
      let leading = "";
      let trailing = "";

      if (i > 0) {
        text = text.replace(/^([ \t]*\n)+/, (m) => { leading = m; return ""; });
      }
      if (i < parts.length - 1) {
        text = text.replace(/(\n[ \t]*)+$/, (m) => { trailing = m; return ""; });
      }

      result += leading;
      result += text.replace(/^[ \t]*$/gm, BLANK_LINE_SENTINEL);
      result += trailing;
    }
  }
  return result;
}

export function decodeBlankLineSentinels(markdown: string): string {
  // Split on fenced code blocks to avoid treating sentinels inside code blocks.
  const parts = markdown.split(/(```[\s\S]*?```|~~~[\s\S]*?~~~)/g);
  let result = "";
  for (let i = 0; i < parts.length; i++) {
    if (i % 2 === 1) {
      // Inside code block: pass through unchanged.
      result += parts[i];
    } else {
      result += decodeBlankLineSentinelsInText(parts[i]);
    }
  }
  return result;
}

function decodeBlankLineSentinelsInText(text: string): string {
  const lines = text.split("\n");
  const out: string[] = [];

  for (let i = 0; i < lines.length;) {
    const isBlank = (line: string) => line.trim() === "";
    const isSentinel = (line: string) =>
      line.trim() === BLANK_LINE_SENTINEL ||
      /^<span\s+data-thinkingkity-blank-line=["']true["']\s*><\/span>$/i.test(line.trim());

    if (!isBlank(lines[i]) && !isSentinel(lines[i])) {
      out.push(lines[i]);
      i += 1;
      continue;
    }

    let sentinelCount = 0;
    let j = i;
    while (j < lines.length && (isBlank(lines[j]) || isSentinel(lines[j]))) {
      if (isSentinel(lines[j])) sentinelCount += 1;
      j += 1;
    }

    // remark-stringify surrounds block nodes with its own spacing. Collapse the
    // whole whitespace run back to exactly the number of source blank lines the
    // explicit blank-line nodes represent.
    if (sentinelCount > 0) {
      for (let count = 0; count < sentinelCount; count += 1) out.push("");
    } else {
      for (let count = i; count < j; count += 1) out.push("");
    }
    i = j;
  }

  return out.join("\n");
}

export const blankLineRemarkPlugin = $remark("blankLineRemark", () => () => (tree: any) => {
  normalizeBlankLineSentinels(tree as AstNode);
});

export const blankLineSchema = $node(blankLineNodeName, () => ({
  group: "block",
  content: "inline*",
  defining: true,
  draggable: false,
  parseDOM: [{ tag: `div[data-type="${blankLineNodeName}"]` }],
  toDOM: () => [
    "div",
    {
      class: "md-blank-line",
      "data-type": blankLineNodeName,
    },
    0,
  ],
  parseMarkdown: {
    match: (node) => node.type === blankLineNodeName,
    runner: (state, _node, type) => {
      state.addNode(type);
    },
  },
  toMarkdown: {
    match: (node) => node.type.name === blankLineNodeName,
    runner: (state, node) => {
      // A blank-line node is only a blank line while it is truly empty.
      // Once the user starts typing into it, serialize it as a normal
      // paragraph immediately. Otherwise the markdown listener would emit the
      // sentinel again and the parent React state would overwrite the freshly
      // typed characters on the next sync.
      if (node.content.size > 0) {
        state.openNode("paragraph");
        state.next(node.content);
        state.closeNode();
        return;
      }

      state.addNode(blankLineNodeName);
    },
  },
}));

export function blankLineMarkdownHandler() {
  return BLANK_LINE_SENTINEL;
}

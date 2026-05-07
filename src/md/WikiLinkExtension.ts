import { nodeRule } from "@milkdown/prose";
import { $inputRule, $node, $remark } from "@milkdown/utils";
import type { Ctx } from "@milkdown/ctx";
import { parseWikiLink } from "@/md/links/wikiLinkParser";

export const wikiLinkNodeName = "wiki_link";

type WikiLinkAstNode = {
  type: string;
  value?: string;
  raw?: string;
  target?: string;
  alias?: string;
  heading?: string;
  children?: WikiLinkAstNode[];
  [key: string]: unknown;
};

function wikiLinkAttrs(raw: string) {
  const parsed = parseWikiLink(raw);
  if (!parsed) return null;
  const targetLabel = `${parsed.target}${parsed.heading ? `#${parsed.heading}` : ""}`;

  return {
    raw: parsed.raw,
    target: parsed.target,
    alias: parsed.alias ?? "",
    heading: parsed.heading ?? "",
    label: parsed.alias || targetLabel || parsed.raw,
  };
}

function splitWikiLinks(text: string): WikiLinkAstNode[] {
  const nodes: WikiLinkAstNode[] = [];
  const re = /\\?\[\\?\[[\s\S]*?\\?\]\\?\]/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = re.exec(text)) !== null) {
    if (match.index > lastIndex) {
      nodes.push({ type: "text", value: text.slice(lastIndex, match.index) });
    }

    const raw = match[0].replace(/\\([\[\]])/g, "$1");
    const attrs = wikiLinkAttrs(raw);
    if (attrs) {
      nodes.push({
        type: wikiLinkNodeName,
        value: attrs.raw,
        ...attrs,
      });
    } else {
      nodes.push({ type: "text", value: match[0] });
    }

    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    nodes.push({ type: "text", value: text.slice(lastIndex) });
  }

  return nodes;
}

function transformWikiLinks(node: WikiLinkAstNode) {
  if (!Array.isArray(node.children)) return;

  const children: WikiLinkAstNode[] = [];
  for (const child of node.children) {
    if (child.type === "text" && typeof child.value === "string") {
      children.push(...splitWikiLinks(child.value));
    } else {
      transformWikiLinks(child);
      children.push(child);
    }
  }

  node.children = children;
}

export const wikiLinkRemarkPlugin = $remark("wikiLinkRemark", () => () => (tree: any) => {
  transformWikiLinks(tree);
});

export const wikiLinkSchema = $node(wikiLinkNodeName, () => ({
  inline: true,
  group: "inline",
  atom: true,
  selectable: true,
  draggable: false,
  marks: "",
  attrs: {
    raw: { default: "", validate: "string" },
    target: { default: "", validate: "string" },
    alias: { default: "", validate: "string" },
    heading: { default: "", validate: "string" },
    label: { default: "", validate: "string" },
  },
  parseDOM: [
    {
      tag: `span[data-type="${wikiLinkNodeName}"]`,
      getAttrs: (dom) => {
        const el = dom as HTMLElement;
        return {
          raw: el.dataset.raw ?? "",
          target: el.dataset.target ?? "",
          alias: el.dataset.alias ?? "",
          heading: el.dataset.heading ?? "",
          label: el.dataset.label ?? el.textContent ?? "",
        };
      },
    },
  ],
  toDOM: (node) => [
    "span",
    {
      class: "wiki-link wiki-link-node",
      "data-type": wikiLinkNodeName,
      "data-raw": node.attrs.raw,
      "data-target": node.attrs.target,
      "data-alias": node.attrs.alias,
      "data-heading": node.attrs.heading,
      "data-label": node.attrs.label,
    },
    node.attrs.label || node.attrs.raw,
  ],
  parseMarkdown: {
    match: (node) => node.type === wikiLinkNodeName,
    runner: (state, node, type) => {
      state.addNode(type, {
        raw: (node.raw as string) || (node.value as string) || "",
        target: (node.target as string) || "",
        alias: (node.alias as string) || "",
        heading: (node.heading as string) || "",
        label: (node.label as string) || "",
      });
    },
  },
  toMarkdown: {
    match: (node) => node.type.name === wikiLinkNodeName,
    runner: (state, node) => {
      state.addNode(wikiLinkNodeName, undefined, node.attrs.raw || node.attrs.label || "");
    },
  },
}));

export const wikiLinkInputRule = $inputRule((ctx: Ctx) => {
  return nodeRule(/\[\[([^\]\n]+)\]\]$/, wikiLinkSchema.type(ctx), {
    getAttr: (match) => wikiLinkAttrs(match[0]) ?? {},
  });
});

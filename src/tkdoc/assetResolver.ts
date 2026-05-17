import type { JSONContent } from "@tiptap/react";
import { dirname } from "@/md/markdownUtils";
import { pathJoin, readFileBase64 } from "@/lib/tauriCommands";

function isExternalAssetSrc(src: string): boolean {
  return /^(https?:|data:|blob:|asset:|file:)/i.test(src);
}

function cloneNode(node: JSONContent): JSONContent {
  return {
    ...node,
    attrs: node.attrs ? { ...node.attrs } : undefined,
    content: node.content?.map(cloneNode),
  };
}

export async function resolveTkdocAssetsForRender(
  content: JSONContent,
  filePath: string,
): Promise<JSONContent> {
  const cloned = cloneNode(content);
  const baseDir = dirname(filePath);

  const visit = async (node: JSONContent): Promise<void> => {
    if ((node.type === "image" || node.type === "video") && typeof node.attrs?.src === "string") {
      const src = node.attrs.src;
      if (src && !isExternalAssetSrc(src)) {
        const absolutePath = pathJoin(baseDir, decodeURI(src));
        node.attrs = {
          ...node.attrs,
          src: await readFileBase64(absolutePath),
          "data-tkdoc-src": src,
        };
      }
    }

    if (node.content) {
      await Promise.all(node.content.map(visit));
    }
  };

  await visit(cloned);
  return cloned;
}

export function restoreTkdocAssetSources(content: JSONContent): JSONContent {
  const cloned = cloneNode(content);

  const visit = (node: JSONContent): void => {
    if ((node.type === "image" || node.type === "video") && typeof node.attrs?.["data-tkdoc-src"] === "string") {
      node.attrs = {
        ...node.attrs,
        src: node.attrs["data-tkdoc-src"],
      };
      delete node.attrs["data-tkdoc-src"];
    }

    node.content?.forEach(visit);
  };

  visit(cloned);
  return cloned;
}

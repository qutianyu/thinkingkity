import { Plugin, PluginKey } from "@milkdown/prose/state";
import { Decoration, DecorationSet } from "@milkdown/prose/view";
import { $prose } from "@milkdown/utils";
import { extractWikiLinks } from "@/md/links/wikiLinkParser";
import { useLinkStore } from "@/md/links/linkStore";
import { useEditorStore } from "@/stores/editorStore";

export const wikiLinkPluginKey = new PluginKey("wikiLink");

// Module-level decoration version — bumped when link index updates
let decorationVersion = 0;

export function bumpDecorationVersion() {
  decorationVersion++;
}

function buildDecorationsFromDoc(doc: any): DecorationSet {
  const decorations: Decoration[] = [];
  const currentPath = useEditorStore.getState().activeTabPath;
  const index = useLinkStore.getState().index;

  doc.descendants((node: any, pos: number) => {
    if (!node.isText) return;

    const links = extractWikiLinks(node.text ?? "", 0);
    for (const link of links) {
      if (link.position == null) continue;

      const from = pos + link.position.column;
      const to = from + link.raw.length;
      if (to > doc.content.size) continue;

      let status = link.status;

      if (index && currentPath) {
        const fileEntry = index.files[currentPath];
        if (fileEntry) {
          const match = fileEntry.outgoing.find(
            (ol) =>
              ol.position?.line === link.position?.line &&
              ol.position?.column === link.position?.column &&
              ol.raw === link.raw,
          );
          if (match) status = match.status;
        }
      }

      decorations.push(
        Decoration.inline(
          from,
          to,
          { class: `wiki-link wiki-link-${status}` },
          { inclusiveStart: false, inclusiveEnd: false },
        ),
      );
    }
  });

  return DecorationSet.create(doc, decorations);
}

export const wikiLinkPlugin = $prose(() => {
  let lastVersion = decorationVersion;

  return new Plugin({
    key: wikiLinkPluginKey,
    state: {
      init(_, state) {
        return buildDecorationsFromDoc(state.doc);
      },
      apply(tr, oldDecos, _oldState, newState) {
        const versionChanged = decorationVersion !== lastVersion;
        lastVersion = decorationVersion;

        if (tr.docChanged || versionChanged) {
          return buildDecorationsFromDoc(newState.doc);
        }
        return oldDecos;
      },
    },
    props: {
      decorations(state) {
        return this.getState(state);
      },
      handleDOMEvents: {
        click: (view, event) => {
          const target = event.target as HTMLElement;
          const wikiLinkEl = target.closest(".wiki-link");
          if (!wikiLinkEl) return false;

          event.preventDefault();
          event.stopPropagation();

          const from = view.posAtDOM(wikiLinkEl, 0);
          const to = view.posAtDOM(wikiLinkEl, wikiLinkEl.childNodes.length);
          const rawText = view.state.doc.textBetween(from, to);

          const parsed = extractWikiLinks(rawText, 0);
          if (parsed.length === 0) return true;

          const link = parsed[0];
          const linkStore = useLinkStore.getState();
          const editorStore = useEditorStore.getState();
          const currentPath = editorStore.activeTabPath;

          if (!linkStore.index || !currentPath) return true;

          const fileEntry = linkStore.index.files[currentPath];
          const match = fileEntry?.outgoing.find((ol) => ol.raw === link.raw);

          if (match?.status === "resolved" && match.resolvedPath) {
            editorStore.openFile(match.resolvedPath);
            if (link.heading) {
              window.dispatchEvent(
                new CustomEvent("wiki-link-scroll-to", {
                  detail: { heading: link.heading },
                }),
              );
            }
            return true;
          }

          if (match?.status === "unresolved" || match?.status === "ambiguous") {
            window.dispatchEvent(
              new CustomEvent("wiki-link-unresolved", {
                detail: { target: link.target },
              }),
            );
            return true;
          }

          return true;
        },
      },
    },
    view(editorView: any) {
      _activeView = editorView;
      return {
        update(view: any) {
          _activeView = view;
        },
        destroy() {
          _activeView = null;
        },
      };
    },
  });
});

let _activeView: any = null;

export function refreshWikiLinkDecorations() {
  if (!_activeView) return;
  bumpDecorationVersion();
  const tr = _activeView.state.tr.setMeta(wikiLinkPluginKey, { refresh: true });
  _activeView.dispatch(tr);
}


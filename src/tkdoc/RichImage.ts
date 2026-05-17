import Image from "@tiptap/extension-image";

export type TkdocImageAlign = "left" | "center" | "right";
export type TkdocImageWidth = "original" | "small" | "medium";

export const RichImage = Image.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      widthPreset: {
        default: "original",
        parseHTML: (element) => element.getAttribute("data-width-preset") ?? "original",
        renderHTML: (attributes) => ({ "data-width-preset": attributes.widthPreset }),
      },
      align: {
        default: "left",
        parseHTML: (element) => element.getAttribute("data-align") ?? "left",
        renderHTML: (attributes) => ({ "data-align": attributes.align }),
      },
      "data-tkdoc-src": {
        default: null,
        parseHTML: (element) => element.getAttribute("data-tkdoc-src"),
        renderHTML: (attributes) =>
          attributes["data-tkdoc-src"]
            ? { "data-tkdoc-src": attributes["data-tkdoc-src"] }
            : {},
      },
    };
  },
});

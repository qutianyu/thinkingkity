export type {
  ArticleId,
  WikiLink,
  LinkHeading,
  LinkFileEntry,
  BacklinkRef,
  LinkIndex,
} from "./types";

export { parseWikiLink, extractWikiLinks, slugify } from "./wikiLinkParser";
export { parseMarkdownFile, getTitleForFile, getIndexNamesForFile } from "./markdownLinkParser";
export { resolveTarget, resolveFileLinks } from "./linkResolver";
export {
  buildIndex,
  updateFileInIndex,
  removeFileFromIndex,
  renameFileInIndex,
  readCache,
  writeCache,
  isCacheValid,
  computeBacklinks,
} from "./linkIndex";
export { useLinkStore } from "./linkStore";

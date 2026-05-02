export interface RenderHtmlImagesOptions {
  activeTabPath: string | null;
  vaultPath: string | null;
  resolveAssetUrl?: (path: string) => Promise<string>;
}

export function escapeHtmlAttribute(value: string): string {
  // HTML image snippets are stored as Markdown content, so attributes must be escaped.
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export function createImageHtml(src: string, alt: string): string {
  return `<img src="${escapeHtmlAttribute(src)}" alt="${escapeHtmlAttribute(alt)}" />`;
}

export function readImageHtml(value: string): { src: string; alt: string } | null {
  const doc = new DOMParser().parseFromString(value, "text/html");
  const img = doc.body.querySelector("img[src]");
  if (!img) return null;
  return {
    src: img.getAttribute("src") || "",
    alt: img.getAttribute("alt") || "",
  };
}

function pathSeparator(path: string): string {
  return path.includes("\\") ? "\\" : "/";
}

export function joinPath(base: string, child: string): string {
  const sep = pathSeparator(base);
  return `${base.replace(/[\\/]+$/, "")}${sep}${child.replace(/[\\/]+$/, "")}`;
}

export function dirname(path: string): string {
  const normalized = path.replace(/[\\/]+$/, "");
  const index = Math.max(normalized.lastIndexOf("/"), normalized.lastIndexOf("\\"));
  return index > 0 ? normalized.slice(0, index) : normalized;
}

function normalizePath(path: string): string {
  // Normalize without touching platform-specific drive prefixes.
  const isWindowsAbsolute = /^[A-Za-z]:\//.test(path);
  const isAbsolute = path.startsWith("/") || isWindowsAbsolute;
  const parts = path.replace(/\\/g, "/").split("/");
  const stack: string[] = [];

  for (const part of parts) {
    if (!part || part === ".") continue;
    if (part === "..") {
      if (stack.length > 0 && stack[stack.length - 1] !== "..") {
        stack.pop();
      } else if (!isAbsolute) {
        stack.push(part);
      }
      continue;
    }
    stack.push(part);
  }

  const prefix = path.startsWith("/") ? "/" : "";
  return `${prefix}${stack.join("/")}`;
}

export function getFileName(path: string): string {
  const parts = path.replace(/[/\\]$/, "").split(/[/\\]/);
  return parts[parts.length - 1] || "image";
}

export function getMarkdownRelativePath(fromDir: string, targetPath: string): string {
  // Store pasted image links relative to the note so vaults remain portable.
  const fromParts = fromDir.replace(/\\/g, "/").replace(/\/+$/, "").split("/").filter(Boolean);
  const targetParts = targetPath.replace(/\\/g, "/").replace(/\/+$/, "").split("/").filter(Boolean);

  let common = 0;
  while (
    common < fromParts.length &&
    common < targetParts.length &&
    fromParts[common] === targetParts[common]
  ) {
    common += 1;
  }

  const upward = fromParts.slice(common).map(() => "..");
  const downward = targetParts.slice(common);
  return [...upward, ...downward].join("/") || getFileName(targetPath);
}

function isExternalImageSrc(src: string): boolean {
  return /^(https?:|data:|blob:|asset:|file:)/i.test(src);
}

function isAbsolutePath(path: string): boolean {
  return path.startsWith("/") || /^[A-Za-z]:[\\/]/.test(path);
}

async function resolveImageSrcForRender(
  src: string,
  { activeTabPath, vaultPath, resolveAssetUrl }: RenderHtmlImagesOptions,
): Promise<string> {
  if (!src || isExternalImageSrc(src)) return src;
  if (isAbsolutePath(src)) return resolveAssetUrl ? resolveAssetUrl(src) : src;

  // Relative Markdown images resolve from the current note directory.
  const baseDir = activeTabPath ? dirname(activeTabPath) : vaultPath;
  if (!baseDir) return src;

  const absolutePath = normalizePath(joinPath(baseDir, decodeURI(src)));
  return resolveAssetUrl ? resolveAssetUrl(absolutePath) : absolutePath;
}

export async function renderHtmlImages(root: HTMLElement, options: RenderHtmlImagesOptions): Promise<void> {
  // Milkdown keeps raw HTML as inline atoms; replace image atoms with real previews.
  const nodes = root.querySelectorAll<HTMLElement>('.milkdown .ProseMirror span[data-type="html"][data-value]');
  const promises = Array.from(nodes).map(async (node) => {
    const value = node.dataset.value || "";
    const image = readImageHtml(value);
    if (!image) return;

    const renderedSrc = await resolveImageSrcForRender(image.src, options);
    const renderedKey = `${value}\n${renderedSrc}`;
    if (node.dataset.renderedImage === renderedKey) return;

    node.dataset.renderedImage = renderedKey;
    node.textContent = "";
    node.classList.add("md-html-image");
    node.setAttribute("contenteditable", "false");

    const img = document.createElement("img");
    img.src = renderedSrc;
    img.alt = image.alt;
    img.draggable = false;
    node.appendChild(img);
  });
  await Promise.all(promises);
}

export function uniqueFileName(fileName: string, existingNames: Set<string>): string {
  // Pasted images should never overwrite an existing vault asset.
  if (!existingNames.has(fileName)) return fileName;
  const dotIndex = fileName.lastIndexOf(".");
  const stem = dotIndex > 0 ? fileName.slice(0, dotIndex) : fileName;
  const ext = dotIndex > 0 ? fileName.slice(dotIndex) : "";
  let index = 1;
  let candidate = `${stem}-${index}${ext}`;
  while (existingNames.has(candidate)) {
    index += 1;
    candidate = `${stem}-${index}${ext}`;
  }
  return candidate;
}

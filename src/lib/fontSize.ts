export const DEFAULT_APP_FONT_SIZE_PX = 16;
export const MIN_APP_FONT_SIZE_PX = 10;
export const MAX_APP_FONT_SIZE_PX = 20;

export function normalizeAppFontSizePx(value: unknown, fallback = DEFAULT_APP_FONT_SIZE_PX): number {
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.min(MAX_APP_FONT_SIZE_PX, Math.max(MIN_APP_FONT_SIZE_PX, Math.round(numeric)));
}

export function applyAppFontSizePx(value: number): void {
  document.documentElement.style.setProperty(
    "--app-font-size",
    `${normalizeAppFontSizePx(value)}px`,
  );
}

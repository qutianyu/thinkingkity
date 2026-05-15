import { useState } from "react";
import { Bot, Database, ExternalLink, FileText, GitBranch, Info, RefreshCw, ShieldCheck, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { isTauri } from "@/lib/tauriCommands";

const REPO_URL = "https://github.com/qutianyu/thinkingkity";
const RELEASES_URL = `${REPO_URL}/releases`;
const LATEST_MANIFEST_URL = `${RELEASES_URL}/latest/download/latest.json`;

const FEATURE_ICONS = [FileText, Database, Bot, GitBranch, ShieldCheck];

type UpdateStatus = "idle" | "checking" | "current" | "available" | "unpublished" | "unsupported" | "error";
type UpdateChannel = "github" | "android";
type RuntimePlatform = "web" | "macos" | "windows" | "linux" | "android";

interface ReleasePackage {
  name: string;
  url: string;
}

interface LatestRelease {
  version: string;
  url: string;
  packages: Partial<Record<Exclude<RuntimePlatform, "web">, ReleasePackage | null>>;
}

interface AboutModalProps {
  onClose: () => void;
}

function currentUpdateChannel(): UpdateChannel {
  return __APP_PLATFORM__ === "android" ? "android" : "github";
}

function currentRuntimePlatform(): RuntimePlatform {
  if (!isTauri()) return "web";
  if (__APP_PLATFORM__ === "macos" || __APP_PLATFORM__ === "windows" || __APP_PLATFORM__ === "linux" || __APP_PLATFORM__ === "android") {
    return __APP_PLATFORM__;
  }
  return "web";
}

function parseVersion(value: string): number[] {
  return value
    .trim()
    .replace(/^v/i, "")
    .split(/[.-]/)
    .map((part) => Number.parseInt(part, 10))
    .map((part) => (Number.isFinite(part) ? part : 0));
}

function isNewerVersion(latest: string, current: string): boolean {
  const latestParts = parseVersion(latest);
  const currentParts = parseVersion(current);
  const length = Math.max(latestParts.length, currentParts.length);
  for (let i = 0; i < length; i++) {
    const diff = (latestParts[i] ?? 0) - (currentParts[i] ?? 0);
    if (diff > 0) return true;
    if (diff < 0) return false;
  }
  return false;
}

async function openExternalUrl(url: string) {
  if (isTauri()) {
    const { open } = await import("@tauri-apps/plugin-shell");
    await open(url);
    return;
  }
  window.open(url, "_blank", "noopener,noreferrer");
}

async function fetchLatestRelease(): Promise<LatestRelease | null> {
  const manifestRes = await fetch(LATEST_MANIFEST_URL, { cache: "no-store" });
  if (manifestRes.status === 404) return null;
  if (!manifestRes.ok) throw new Error("Failed to load latest release manifest");
  const manifest = await manifestRes.json() as LatestRelease;
  if (!manifest.version || !manifest.url || !manifest.packages) {
    throw new Error("Latest release manifest is invalid");
  }
  return manifest;
}

export function AboutModal({ onClose }: AboutModalProps) {
  const { t } = useTranslation();
  const [updateStatus, setUpdateStatus] = useState<UpdateStatus>("idle");
  const [latestVersion, setLatestVersion] = useState<string | null>(null);
  const [downloadAsset, setDownloadAsset] = useState<ReleasePackage | null>(null);
  const [latestReleaseUrl, setLatestReleaseUrl] = useState<string | null>(null);
  const updateChannel = currentUpdateChannel();
  const runtimePlatform = currentRuntimePlatform();
  const latestVersionLabel = latestVersion
    ?? (updateStatus === "unpublished"
      ? t("about.noPublishedVersion")
      : updateStatus === "error"
        ? t("about.checkFailed")
        : t("about.notChecked"));

  const features = [
    t("about.featureNotes"),
    t("about.featureFormats"),
    t("about.featureAi"),
    t("about.featureSync"),
    t("about.featureLocal"),
  ];

  const handleCheckUpdate = async () => {
    setUpdateStatus("checking");
    try {
      const latest = await fetchLatestRelease();
      if (!latest) {
        setLatestVersion(null);
        setDownloadAsset(null);
        setLatestReleaseUrl(null);
        setUpdateStatus("unpublished");
        return;
      }
      setLatestVersion(latest.version);
      setLatestReleaseUrl(latest.url);
      const matchedAsset = runtimePlatform === "web" ? null : latest.packages[runtimePlatform] ?? null;
      setDownloadAsset(matchedAsset);
      if (!isNewerVersion(latest.version, __APP_VERSION__)) {
        setUpdateStatus("current");
        return;
      }
      setUpdateStatus(matchedAsset ? "available" : "unsupported");
    } catch (error) {
      console.error("Failed to check latest version:", error);
      setUpdateStatus("error");
    }
  };

  return (
    <div className="about-overlay" role="dialog" aria-modal="true" aria-label={t("about.title")}>
      <div className="about-backdrop" onClick={onClose} />
      <div className="about-modal">
        <header className="about-modal-header">
          <div className="about-modal-title">
            <Info size={16} />
            <span>{t("about.title")}</span>
          </div>
          <button type="button" className="about-close-button" onClick={onClose} aria-label={t("dialog.cancel")}>
            <X size={16} />
          </button>
        </header>

        <main className="about-main">
          <section className="about-hero">
            <img src="/logo.png" alt="ThinkingKity" className="about-logo" />
            <div className="about-title-block">
              <h1>ThinkingKity</h1>
              <p>{t("about.tagline")}</p>
            </div>
            <div className="about-version-panel">
              <span className="about-version">v{__APP_VERSION__}</span>
              <button
                type="button"
                className="about-update-button"
                onClick={handleCheckUpdate}
                disabled={updateStatus === "checking"}
              >
                <RefreshCw size={13} className={updateStatus === "checking" ? "about-spin" : undefined} />
                <span>{t("about.checkUpdates")}</span>
              </button>
            </div>
          </section>

          <section className={`about-update about-update-${updateStatus}`}>
            <div>
              <span>{t("about.currentVersion")}</span>
              <strong>v{__APP_VERSION__}</strong>
            </div>
            <div>
              <span>{t("about.latestVersion")}</span>
              <strong>{latestVersionLabel}</strong>
            </div>
            <div>
              <span>{t("about.updateChannel")}</span>
              <strong>{t(`about.updateChannels.${updateChannel}`)}</strong>
            </div>
            <div>
              <span>{t("about.runtimePlatform")}</span>
              <strong>{t(`about.runtimePlatforms.${runtimePlatform}`)}</strong>
            </div>
            <p>{t(`about.updateStatus.${updateStatus}`)}</p>
            <p className="about-update-note">{t(`about.updateNotes.${updateChannel}`)}</p>
            <div className="about-update-actions">
              <button type="button" onClick={() => openExternalUrl(REPO_URL)}>
                <ExternalLink size={13} />
                <span>{t("about.openRepository")}</span>
              </button>
              <button type="button" onClick={() => openExternalUrl(latestReleaseUrl ?? RELEASES_URL)}>
                <ExternalLink size={13} />
                <span>{t("about.openReleases")}</span>
              </button>
              {downloadAsset && updateStatus === "available" && (
                <button type="button" onClick={() => openExternalUrl(downloadAsset.url)}>
                  <ExternalLink size={13} />
                  <span>{t("about.downloadForPlatform")}</span>
                </button>
              )}
            </div>
          </section>

          <section className="about-section">
            <div className="about-section-heading">
              <Info size={16} />
              <h2>{t("about.whatIsIt")}</h2>
            </div>
            <p>{t("about.description")}</p>
          </section>

          <section className="about-feature-grid" aria-label={t("about.capabilities")}>
            {features.map((feature, index) => {
              const Icon = FEATURE_ICONS[index] ?? Info;
              return (
                <article className="about-feature" key={feature}>
                  <Icon size={17} />
                  <span>{feature}</span>
                </article>
              );
            })}
          </section>

          <section className="about-section about-meta">
            <div>
              <span>{t("about.storageLabel")}</span>
              <strong>{t("about.storageValue")}</strong>
            </div>
            <div>
              <span>{t("about.syncLabel")}</span>
              <strong>{t("about.syncValue")}</strong>
            </div>
            <div>
              <span>{t("about.aiLabel")}</span>
              <strong>{t("about.aiValue")}</strong>
            </div>
          </section>
        </main>
      </div>
    </div>
  );
}

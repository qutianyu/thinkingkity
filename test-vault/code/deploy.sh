#!/usr/bin/env bash
# ───────────────────────────────────────────────────────
# Sample deployment script — demonstrates shell scripting
# ───────────────────────────────────────────────────────

set -euo pipefail

APP_NAME="thinkingkity"
ENV="${1:-production}"
BUILD_DIR="./dist"
DEPLOY_DIR="/var/www/${APP_NAME}"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

log()  { echo -e "${GREEN}[INFO]${NC}  $1"; }
warn() { echo -e "${YELLOW}[WARN]${NC}  $1"; }
err()  { echo -e "${RED}[ERROR]${NC} $1"; exit 1; }

# ── Pre-flight checks ──────────────────────────────────

command -v node >/dev/null 2>&1 || err "Node.js is required"
command -v npm  >/dev/null 2>&1 || err "npm is required"

log "Deploying ${APP_NAME} to ${ENV}..."

# ── Build ──────────────────────────────────────────────

log "Installing dependencies..."
npm ci --production

log "Running type checks..."
npx tsc --noEmit || err "TypeScript check failed"

log "Building application..."
npm run build || err "Build failed"

if [[ ! -d "${BUILD_DIR}" ]]; then
    err "Build directory '${BUILD_DIR}' not found"
fi

# ── Deploy ─────────────────────────────────────────────

if [[ "${ENV}" == "production" ]]; then
    log "Syncing to ${DEPLOY_DIR}..."
    mkdir -p "${DEPLOY_DIR}"
    rsync -av --delete "${BUILD_DIR}/" "${DEPLOY_DIR}/"
    log "Reloading web server..."
    sudo systemctl reload nginx || warn "Failed to reload nginx"
else
    log "Starting dev server (env: ${ENV})..."
    npm run dev
fi

# ── Summary ────────────────────────────────────────────

BUILD_SIZE=$(du -sh "${BUILD_DIR}" 2>/dev/null | cut -f1 || echo "N/A")
log "Deploy complete! (${APP_NAME} v$(node -p "require('./package.json').version"), build: ${BUILD_SIZE})"
echo ""
echo "  Environment : ${ENV}"
echo "  Build dir   : ${BUILD_DIR}"
echo "  Done ✓"

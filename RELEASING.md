# Releasing ThinkingKity

## Current release surfaces

| Surface | Current repository support | Distribution path |
| --- | --- | --- |
| macOS | Ready after Apple signing/notarization secrets are configured | GitHub Release DMG |
| Linux | Ready | GitHub Release AppImage and deb |
| Windows | Ready | GitHub Release NSIS and MSI |
| Web | Ready | GitHub Release Linux binary |
| Android | CI build wired | Workflow artifact until signing is configured |

## Desktop release flow

1. Ensure the worktree is clean and the changes you want to ship are committed.
2. Run `npm run release -- X.Y.Z`.
3. The release script updates version files, creates a `Release vX.Y.Z` commit, creates tag `vX.Y.Z`, then pushes the commit and tag.
4. Pushing the tag starts `.github/workflows/desktop-release.yml`, `.github/workflows/android-build.yml`, and `.github/workflows/web-build.yml`.
5. Desktop bundles and the Linux web binary `thinkingkity` are attached to the GitHub Release for the pushed tag, then `latest.json` is generated and attached to the same release as the update manifest. Workflow artifacts are also kept on the Actions run for debugging.

Use `npm run release -- X.Y.Z --no-push` when you want to inspect the version commit and tag locally before pushing them yourself.

## Manual build flow

Use the GitHub Actions UI and run either:

- `Desktop Release` for desktop bundle smoke builds
- `Android Build` for Android package smoke builds
- `Web Build` for the web bundle

Manual runs upload workflow artifacts only. GitHub Release assets are uploaded only for tag builds.

## macOS public distribution

The macOS GitHub Release artifact is only suitable for normal end-user download after it has been signed with a `Developer ID Application` certificate and notarized by Apple.

Configure these repository secrets before shipping macOS releases publicly:

| Secret | Purpose |
| --- | --- |
| `APPLE_CERTIFICATE` | Base64-encoded `.p12` export of the `Developer ID Application` certificate |
| `APPLE_CERTIFICATE_PASSWORD` | Password used when exporting the `.p12` file |
| `APPLE_SIGNING_IDENTITY` | Signing identity name, for example `Developer ID Application: Example Inc. (TEAMID)` |
| `APPLE_ID` | Apple ID used for notarization |
| `APPLE_PASSWORD` | App-specific password for that Apple ID |
| `APPLE_TEAM_ID` | Apple Developer Team ID |

When those secrets are present, the macOS workflow decodes the uploaded `.p12`, re-exports it in a Keychain-compatible legacy PKCS#12 format, imports it into a temporary CI keychain, and then lets `tauri build` sign and notarize the generated app bundle.

If those secrets are missing, CI can still produce a DMG for internal smoke testing, but a DMG downloaded from GitHub is expected to be blocked by Gatekeeper on other Macs with messages such as `“ThinkingKity” is damaged and can’t be opened`.

The workflow validates and normalizes `APPLE_CERTIFICATE` before bundling. If validation fails:

- `APPLE_CERTIFICATE is not valid base64` means the secret is not the raw base64 text of the exported `.p12`
- `Mac verify error` or a decryption error from `openssl pkcs12` usually means `APPLE_CERTIFICATE_PASSWORD` does not match the `.p12` export password
- `the .p12 does not contain a private key` means the certificate was exported without its matching private key and cannot be used for signing

The explicit normalization step avoids a class of CI failures where OpenSSL can read a PKCS#12 bundle but macOS `security import` rejects that original bundle format.

After bundling, the macOS job also verifies the generated `.app` with `codesign --verify` and `spctl --assess`. A green release job therefore means the app was not only built, but also accepted by macOS code-signing and Gatekeeper checks on the CI runner.

## Platform mapping

Desktop builds inject the update identity at build time:

| Build | Update platform | Update arch |
| --- | --- | --- |
| macOS arm64 | `macos` | `aarch64` |
| Linux x64 | `linux` | `x86_64` |
| Windows x64 | `windows` | `x86_64` |
| Android universal | `android` | `universal` |

`About` reads `latest.json` from the latest GitHub Release and uses those build-time values to choose the matching package entry.

## Android follow-up

The repository still ignores generated mobile projects under `src-tauri/gen/`. The Android workflow therefore initializes the Android project inside CI before building APK/AAB artifacts.

This is enough for build verification, but not enough for public Android distribution:

1. Install the Android SDK locally before using `npm run init:android`, `npm run dev:android`, or `npm run build:android`.
2. Configure Android signing before publishing packages outside CI artifacts.
3. Once signing is configured, decide whether Android releases should be attached to GitHub Releases as APKs, uploaded to Google Play as AABs, or both.

Android signing is intentionally separate from the desktop release flow because Android package distribution has its own keystore and store requirements.

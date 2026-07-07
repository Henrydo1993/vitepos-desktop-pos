# Deploying to the POS terminal + auto-updates

## 1. Build the Windows installer

```bash
npm run dist   # -> dist/Opal Dessert POS Setup <ver>.exe   (~86 MB, Windows x64, NSIS)
```

**This builds on macOS** — electron-builder downloads the Windows Electron and the correct
Windows `better-sqlite3` prebuilt automatically. No Windows machine or cross-compile setup needed.
(It also builds on Windows/Linux the same way.)

Send that single `.exe` to the business owner. They **double-click it** → it installs (Start-menu
+ desktop shortcut) → launches. On first run the app shows a **setup screen** (paste the Application
Password + enter printer IPs) — no command line, no `.env`, nothing technical.

For a locked-down till, set the `POS_KIOSK=1` environment variable (fullscreen, no window chrome).

## 2. Configuration on the terminal  ⚠️ prerequisite (not built yet)

Right now the app reads its config — site URL, WordPress **Application Password**, outlet/counter,
and printer IPs — from a dev `.env`. **A packaged app has no `.env`.**

So before a real install we need a **first-run Settings screen** that lets the manager enter and
save those values into the app's user-data folder (`app.getPath('userData')`), and have the main
process read from there instead of `.env`. This is the one real blocker for a clean deployment.
→ *Say the word and I'll build it.*

## 3. Auto-updates (the restaurant-cloud model)

`electron-updater` is already wired in the app (`src/main/updater.ts`): on launch it checks the
release feed, downloads any newer version, and installs it when the app quits. It just needs a
publish feed + CI, both set up here:

- `package.json` → `build.publish` targets **GitHub Releases** (set `owner` to your GitHub account).
- `package.json` → `npm run release` = build + publish.
- CI workflow below (save it as `.github/workflows/release.yml`).

### Release flow

```bash
# 1. bump "version" in package.json  (e.g. 0.2.0)
# 2. tag + push
git tag v0.2.0
git push origin v0.2.0
# GitHub Actions builds the Windows installer and publishes it (+ latest.yml) to a Release.
# Every installed terminal auto-updates on its next launch.
```

### Prerequisites

- Push this repo to **GitHub** (it is local-only right now) and set `build.publish.owner`.
- Public repo is simplest. Private repo works too but electron-updater then needs a token on each
  client — or use a plain HTTPS/S3 host instead of GitHub (`provider: generic`).

### `.github/workflows/release.yml`

```yaml
name: Release POS
on:
  push:
    tags: ['v*']
jobs:
  build-windows:
    runs-on: windows-latest
    permissions:
      contents: write   # publish the GitHub Release
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - run: npm ci
      - run: npx electron-rebuild -f -w better-sqlite3
      - run: npm run release
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

## Summary

| Step | Where | Status |
|---|---|---|
| Windows installer (`npm run dist`) | macOS or Windows | ✅ builds an x64 `.exe` |
| First-run Settings screen (config on machine) | app | ✅ built |
| Auto-update client (`electron-updater`) | app | ✅ wired |
| Publish feed + CI (tag → build → publish) | GitHub Actions | ✅ configured (needs repo pushed to GitHub) |

# Deploying to the POS terminal + auto-updates

## 1. Build the Windows installer

The app packages to an NSIS installer (`Opal Dessert POS Setup <version>.exe`) via electron-builder
(config is in `package.json` → `build`).

> **Build on Windows, not this Mac.** `better-sqlite3` is a native module and does **not**
> cross-compile Mac → Windows. On Windows it builds automatically.

### Manual build (quickest for a single terminal)

On a Windows PC with Node 20:

```bash
# copy the project folder over (or git clone)
cd vitepos-desktop-pos
npm install
npx electron-rebuild -f -w better-sqlite3
npm run dist          # -> dist/Opal Dessert POS Setup <ver>.exe
```

Copy that `.exe` to the POS terminal and run it — it installs, adds a Start-menu / desktop
shortcut, and launches. Set `POS_KIOSK=1` in the environment for fullscreen kiosk lockdown.

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
| Windows installer (`npm run dist`) | on Windows | ✅ configured |
| First-run Settings screen (config on machine) | app | ⚠️ **needs building** |
| Auto-update client (`electron-updater`) | app | ✅ wired |
| Publish feed + CI (tag → build → publish) | GitHub Actions | ✅ configured (needs repo pushed to GitHub) |

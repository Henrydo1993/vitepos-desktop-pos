# Build Notes

## Native module blocker (local macOS dev)

`better-sqlite3` is a native addon. On this Mac it fails to install because:

1. Node **v24.11.1** is newer than `better-sqlite3` 11.x's prebuilt binaries, so npm falls back to compiling from source.
2. The source compile fails: `fatal error: 'climits' file not found` — the Command Line Tools' C++ SDK headers are broken/mismatched for this macOS build (Darwin 25.3). `xcode-select -p` points at `/Library/Developer/CommandLineTools`, but the libc++ headers aren't resolvable.

This is a **local toolchain issue only**. It does not affect the code, and the real deployment target (Windows) is unaffected — `better-sqlite3` ships Windows prebuilts.

### Fix (recommended): use Node 20 LTS for local dev

Node 20 has matching `better-sqlite3` prebuilt binaries, so **no compiler is needed**:

```bash
nvm install 20
nvm use 20
rm -rf node_modules package-lock.json
npm install
npm test          # now runs all 5 test files incl. the SQLite schema test
```

### For running the Electron app locally on this Mac

The app rebuilds `better-sqlite3` against Electron's ABI via `electron-rebuild`, which **compiles** — so it also needs a working C++ toolchain. Either:
- Repair Command Line Tools: `sudo rm -rf /Library/Developer/CommandLineTools && sudo xcode-select --install`, or
- Do Electron/native runtime work on the Windows target machine (prebuilts + MSVC just work there).

Unit tests (pure logic + SQLite via Node 20 prebuilt) do **not** need this.

## Current verification status (Phase 1, Batch 1)

Passing now under Node 24 (no native deps):
- `tests/pricing.test.ts` — order money math (tax after discount) — 3 tests
- `tests/router.test.ts` — station routing — 1 test
- `tests/tickets.test.ts` — kitchen ticket format — 1 test
- `tests/normalize.test.ts` — live-product field mapping — 1 test

Blocked on native build (run under Node 20 to verify):
- `tests/catalog.test.ts` — SQLite schema round-trip

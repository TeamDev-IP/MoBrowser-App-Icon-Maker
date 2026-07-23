<!-- BEGIN:mobrowser-agent-rules -->
# Do not rely on training data for MōBrowser

Your MōBrowser training data is outdated — APIs have been renamed and reorganized, so code written
from prior knowledge will not compile. **Before writing or modifying any MōBrowser code**, read the
docs in `node_modules/@mobrowser/api/docs/`:
- `guides/` — architecture, project structure, process model, IPC, native C++ module, features, examples.
- `api/` — API reference with code examples.

Don't guess API names, signatures, or import paths — look them up. If `docs/` is missing, ask the
user to run `npm run gen` (it downloads the docs when the project contains this `AGENTS.md`).
<!-- END:mobrowser-agent-rules -->

<!-- BEGIN:mobrowser-build -->
# Building & code generation

The `mobrowser` CLI is a **local** dependency, not on your `PATH`. Always run it via npm:
`npm run mobrowser -- <command>` (or `npx --no-install mobrowser <command>`). A bare `mobrowser …`
fails with "command not found".

- `npm run gen` — regenerate IPC/protobuf bindings after editing a `.proto` file (output in
  `src/*/gen/`). No launch.
- `npm run dev:build` — build without launching: code generation, the **main** process (plus the C++
  module for native projects — slow on first run), and the **renderer** bundle. Run it before
  launching for automation, and re-run after main-process, native, or renderer changes. Build errors
  fail here — fix them first.
- `npm run mobrowser -- agent launch` — launches the `dev:build` output (does **not** build; errors
  if no build exists).
- `npm run dev` — human build-and-run (build + launch). Under `dev` (and `dev -- --automation`) the
  renderer is served live by Vite (hot reload, no rebuild); under `agent launch` it comes from the
  `dev:build` bundle. The renderer is **not type-checked in dev** — run `npm run build` to catch
  renderer/type errors.
- Automation mode lives in `mobrowser.conf.json` (`"automation": { "mode": ... }`): `"interactive"`
  (default — window shown, left running) or `"autonomous"` (window hidden, agent stops it when done).
<!-- END:mobrowser-build -->

<!-- BEGIN:mobrowser-agent -->
# Verifying changes by driving the app

`npm run mobrowser -- agent <command>` drives a running app so you can verify changes against the
real thing. Each command prints JSON on stdout and exits non-zero on failure; see `agent --help` for
the full list. (Commands are shortened to `agent …` below — always prefix with `npm run mobrowser --`.)

## Modes: interactive (default) and autonomous

Default to **interactive**; use **autonomous** only when asked ("headless", "run autonomously") or
when `mobrowser.conf.json` sets it. Launch the app **once** and reuse it for every command — never
relaunch per command.
- **Interactive:** window shown; **leave it running** when done (the user closes it) and re-attach on
  later turns. Don't `agent stop` unless asked.
- **Autonomous:** window hidden; finish the job, then **always** stop it (even on failure) via
  `agent stop` or by terminating the `npm run dev -- --automation` process.

Pick the launch command by task (mode sets visibility automatically):
- **`npm run dev -- --automation`** for **renderer/UI** work: renderer live via Vite (hot reload).
  Runs in the foreground — start it in a background terminal, drive from another, stop by terminating it.
- **`npm run mobrowser -- agent launch`** otherwise: the prebuilt app (`dev:build` first), detached;
  re-run `dev:build` and relaunch after main-process, native, or renderer changes.

`--show-window[=false]` overrides the mode's default visibility.

Typical loop:
1. `dev:build`, then start the app once (see modes above).
2. `agent snapshot` — accessibility tree with stable `[ref=eN]` markers; prefer it over screenshots.
3. Act by `ref`: `agent click --ref e12`, `fill --ref e5 --value "hi"`, `type --ref e5 --text "hi"`,
   `press-key --key Enter`. Confirm with `agent snapshot` or `agent screenshot --out shot.png`.
4. Inspect: `agent eval "location.href"`, `agent console`, `agent network`; `agent list-windows` /
   `select-window` for multi-window apps.
5. Finish per mode: interactive — leave running; autonomous — stop.

Native dialogs (alerts, confirms, prompts, file pickers) are app-modal and **intercepted** under
automation. Pre-arm an answer **before** the triggering action (consumed in order):
`agent answer-dialog --button OK | --text "Robot" | --path /tmp/file.txt | --cancel`; inspect with
`agent dialogs`.

Scope: the agent drives the **renderer** (plus native screenshots and dialogs above); it does not
drive or read the main process.

## Falling back to CDP

Prefer the `agent` commands above — use them first. Only when they cannot accomplish the task (e.g.
you need a CDP domain they don't expose, such as tracing, coverage, emulation, or precise input
timing) fall back to the app's Chrome DevTools Protocol (CDP) endpoint with any CDP-compatible tool.
Under `npm run dev`/`npm run run` it is exposed at `http://localhost:9222` by default (override with
`--remote-debugging-port=<port>`; for `agent launch`, enable it with `-- --remote-debugging-port=9222`).
Automate **this app** over that endpoint — do not launch a separate browser.
<!-- END:mobrowser-agent -->

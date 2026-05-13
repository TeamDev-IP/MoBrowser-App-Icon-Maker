# App Icon Maker

A simple desktop app for generating **macOS app icons** in the `*.icns` format with AI. You describe what you want, optionally attach a reference image, pick from several variants, refine the chosen design, then save a proper `*.icns` bundle and the `*.iconset` folder with all standard sizes.

Here's a short video demonstrating the app in action:

https://github.com/user-attachments/assets/1c87f99d-993f-408b-bd32-a1eb6552eada

## What it does

- **Prompt-based generation.** Your text is wrapped in fixed system constraints, so outputs stay on-brand for macOS-style icons (centered subject, no text, squircle-friendly composition, etc.).
- **Three variants per run.** Each generation returns three images, so you can compare quickly.
- **Optional reference image.** Attach a PNG to steer the model (for example a sketch, logo, or earlier render).
- **Refine workflow.** After you confirm one variant, you can run more generations that treat that icon as the reference until you are happy with the result.
- **Preview.** The UI shows icons with a squircle mask for a realistic preview. 
- **Export & Save.** The saved **`.icns`** uses full-bleed artwork, so macOS can apply its own mask (avoiding the gray plate and shrunken icon you get from pre-clipped corners).

Quitting with an unsaved icon triggers a confirmation dialog.

## Requirements

- **Node.js** matching `engines` in `package.json` (see there for supported major versions).
- **macOS** for development and for saving **`.icns`**: the main process uses **`sips`** and **`iconutil`**, which are part of macOS.
- An OpenAI API key for image generation.

## Setup

```bash
npm install
```

## Run

To run the app in development mode:

```bash
npm run dev
```

For local UI work without APIs:

```bash
npm run dev:mock
```

## Build

To build the app for production:

```bash
npm run build
```

## How to use the app

1. **Describe the icon** in the prompt field (short phrases work well: e.g. “blue clipboard with folded corner”).
2. **Optional:** attach a **reference image** to influence layout or style.
3. Press **Generate** (or **Enter**). Wait for **three** previews.
4. **Pick a variant** to move into refine mode, or generate again from scratch.
5. In **refine** mode, adjust the prompt and generate again; the confirmed icon is used as reference for the next batch.
6. When satisfied, click **Save**. Choose a **`.icns`** path; the app writes **`YourName.icns`** and **`YourName.iconset`** in that folder (replacing existing files only if you confirm).
7. Use **Reveal in Finder** from the success UI if you want to open the save location.

## Project layout

- **`src/main/`** — window, IPC, prompt building, provider selection, **`icns`** assembly.
- **`src/renderer/`** — React UI, squircle preview, generation pipeline state.

## Download

You can download the app from the [releases page](https://github.com/TeamDev-IP/MoBrowser-App-Icon-Maker/releases). All releases are signed and notarized by Apple.

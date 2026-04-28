import { app, BrowserWindow, desktop, ipc, Theme } from '@mobrowser/api';
import { exec } from 'node:child_process';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import {
  GenerateIconRequest,
  GenerateIconResponse,
  SaveIconRequest,
  SaveIconResponse,
  SetThemeRequest,
  ShowPathInFinderRequest,
} from './gen/app';
import { AppService } from './gen/ipc_service';
import { buildPrompt } from './lib/prompt-builder';
import { getProvider } from './lib/image-provider';

// ---------------------------------------------------------------------------
// Icon resize constants
// ---------------------------------------------------------------------------

// The 10 required macOS icon sizes: [filename, pixel dimension].
const ICON_SIZES: [string, number][] = [
  ['icon_16x16.png',      16],
  ['icon_16x16@2x.png',   32],
  ['icon_32x32.png',      32],
  ['icon_32x32@2x.png',   64],
  ['icon_128x128.png',   128],
  ['icon_128x128@2x.png', 256],
  ['icon_256x256.png',   256],
  ['icon_256x256@2x.png', 512],
  ['icon_512x512.png',   512],
  ['icon_512x512@2x.png', 1024],
];

function run(cmd: string): Promise<void> {
  return new Promise((resolve, reject) => {
    exec(cmd, (err) => (err ? reject(err) : resolve()));
  });
}

// ---------------------------------------------------------------------------
// Window
// ---------------------------------------------------------------------------

const win = new BrowserWindow({
  url: app.url,
  size: { width: 550, height: 520 },
  resizable: false,
  windowTitleVisible: false,
  windowTitlebarVisible: false,
  windowButtonPosition: { x: 20, y: 20 },
  windowButtonVisible: {
    maximize: false,
    zoom: false,
  }
});
win.centerWindow();
win.show();

// ---------------------------------------------------------------------------
// IPC service
// ---------------------------------------------------------------------------

ipc.registerService(AppService({
  async SetTheme(request: SetThemeRequest) {
    app.setTheme(request.theme as Theme);
    return {};
  },

  async SaveIcon(request: SaveIconRequest): Promise<SaveIconResponse> {
    const pick = await app.showOpenDialog({
      parentWindow: win,
      title: 'Choose where to save the icon',
      selectionPolicy: 'directories',
      features: { allowMultiple: false, canCreateDirectories: true },
    });

    if (pick.canceled) {
      return { savedPath: '', canceled: true, icnsPath: '' };
    }

    const saveDir = pick.paths[0];
    const icnsPath = path.join(saveDir, 'app.icns');

    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'iconmaker-'));
    const srcPng = path.join(tmp, 'icon_1024.png');
    await fs.writeFile(srcPng, Buffer.from(request.imageData));

    try {
      const iconsetDir = path.join(saveDir, 'icon.iconset');
      await fs.mkdir(iconsetDir, { recursive: true });

      for (const [name, size] of ICON_SIZES) {
        await run(
          `sips -z ${size} ${size} "${srcPng}" --out "${path.join(iconsetDir, name)}"`
        );
      }

      await run(`iconutil -c icns "${iconsetDir}" --output "${icnsPath}"`);
    } finally {
      await fs.rm(tmp, { recursive: true, force: true });
    }

    return { savedPath: saveDir, canceled: false, icnsPath };
  },

  async ShowPathInFinder(request: ShowPathInFinderRequest) {
    if (request.path) {
      desktop.showPath(request.path);
    }
    return {};
  },

  async GenerateIcon(request: GenerateIconRequest): Promise<GenerateIconResponse> {
    try {
      const { positive, negative } = buildPrompt(request.prompt);
      const result = await getProvider().generate({
        positivePrompt: positive,
        negativePrompt: negative,
        referenceImageB64: request.referenceImage || undefined,
        count: 3,
      });
      return { images: result.images, error: '' };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { images: [], error: message };
    }
  },
}));

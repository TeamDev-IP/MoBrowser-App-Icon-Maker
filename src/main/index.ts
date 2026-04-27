import { app, BrowserWindow, ipc, Theme } from '@mobrowser/api';
import { exec } from 'node:child_process';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import { SaveIconRequest, SaveIconResponse, SetThemeRequest } from './gen/app';
import { AppService } from './gen/ipc_service';

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

// Create a new window.
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
})
win.centerWindow()
win.show()

ipc.registerService(AppService({
  async SetTheme(request: SetThemeRequest) {
    app.setTheme(request.theme as Theme);
    return {};
  },

  async SaveIcon(request: SaveIconRequest): Promise<SaveIconResponse> {
    // Ask the user where to save.
    const pick = await app.showOpenDialog({
      parentWindow: win,
      title: 'Choose where to save the icon',
      selectionPolicy: 'directories',
      features: { allowMultiple: false, canCreateDirectories: true },
    });

    if (pick.canceled) {
      return { savedPath: '', canceled: true };
    }

    const saveDir = pick.paths[0];

    // Write the 1024×1024 source PNG to a temporary location.
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'iconmaker-'));
    const srcPng = path.join(tmp, 'icon_1024.png');
    await fs.writeFile(srcPng, Buffer.from(request.imageData));

    try {
      // Create icon.iconset directory inside the chosen save location.
      const iconsetDir = path.join(saveDir, 'icon.iconset');
      await fs.mkdir(iconsetDir, { recursive: true });

      // Use sips (macOS built-in) to resize to each required size.
      for (const [name, size] of ICON_SIZES) {
        await run(
          `sips -z ${size} ${size} "${srcPng}" --out "${path.join(iconsetDir, name)}"`
        );
      }

      // Generate app.icns using iconutil (macOS built-in).
      await run(
        `iconutil -c icns "${iconsetDir}" --output "${path.join(saveDir, 'app.icns')}"`
      );
    } finally {
      // Always clean up the temp directory.
      await fs.rm(tmp, { recursive: true, force: true });
    }

    return { savedPath: saveDir, canceled: false };
  },
}))

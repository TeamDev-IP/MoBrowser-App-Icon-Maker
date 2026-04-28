import { app, BrowserWindow, desktop, ipc, prefs, Theme } from '@mobrowser/api';
import { exec } from 'node:child_process';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import {
  GenerateIconRequest,
  GenerateIconResponse,
  GetOpenAIApiKeyStatusRequest,
  GetOpenAIApiKeyStatusResponse,
  SaveIconRequest,
  SaveIconResponse,
  SetOpenAIApiKeyRequest,
  SetOpenAIApiKeyResponse,
  SetThemeRequest,
  SetUnsavedIconStateRequest,
  ShowPathInFinderRequest,
} from './gen/app';
import { AppService } from './gen/ipc_service';
import { buildPrompt } from './lib/prompt-builder';
import type { ProviderName } from './lib/image-provider';
import { getProvider } from './lib/image-provider';
import {
  hasOpenAIApiKeyInPrefs,
  OPENAI_API_KEY_PREFS_KEY,
} from './lib/openai-api-key';

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

/** Normalize save dialog output to .icns path and companion .iconset directory. */
function resolveSaveTargets(pickedPath: string): {
  parentDir: string;
  icnsPath: string;
  iconsetDir: string;
  baseName: string;
} {
  const resolved = path.resolve(pickedPath);
  const parentDir = path.dirname(resolved);
  let base = path.basename(resolved);
  const ext = path.extname(base);
  if (ext.toLowerCase() === '.icns') {
    base = path.basename(base, ext);
  }
  if (!base || base === '.' || base === '..') {
    base = 'App';
  }
  const icnsPath = path.join(parentDir, `${base}.icns`);
  const iconsetDir = path.join(parentDir, `${base}.iconset`);
  return { parentDir, icnsPath, iconsetDir, baseName: base };
}

async function icnsOutputsExist(icnsPath: string, iconsetDir: string): Promise<boolean> {
  try {
    await fs.access(icnsPath);
    return true;
  } catch {
    /* not found. */
  }
  try {
    const st = await fs.stat(iconsetDir);
    return st.isDirectory();
  } catch {
    return false;
  }
}

async function removeIcnsOutputs(icnsPath: string, iconsetDir: string): Promise<void> {
  await fs.rm(iconsetDir, { recursive: true, force: true });
  await fs.unlink(icnsPath).catch(() => {});
}

async function buildIcnsAt(imageData: Buffer, iconsetDir: string, icnsPath: string): Promise<void> {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'iconmaker-'));
  const srcPng = path.join(tmp, 'icon_1024.png');
  await fs.writeFile(srcPng, Buffer.from(imageData));
  try {
    await fs.mkdir(iconsetDir, { recursive: true });
    for (const [name, size] of ICON_SIZES) {
      await run(
        `sips -z ${size} ${size} "${srcPng}" --out "${path.join(iconsetDir, name)}"`,
      );
    }
    await run(`iconutil -c icns "${iconsetDir}" --output "${icnsPath}"`);
  } finally {
    await fs.rm(tmp, { recursive: true, force: true });
  }
}

// ---------------------------------------------------------------------------
// Window
// ---------------------------------------------------------------------------

/** Updated from the renderer when icon data exists that is not yet saved to disk. */
let hasUnsavedIcon = false;

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

win.handle('close', async () => {
  if (!hasUnsavedIcon) {
    return 'close';
  }
  const result = await app.showMessageDialog({
    parentWindow: win,
    type: 'warning',
    title: 'Quit without saving?',
    message:
      'Your icon has not been saved. If you quit now, it will be lost.',
    buttons: [
      { label: 'Cancel', type: 'secondary' },
      { label: 'Quit Anyway', type: 'primary' },
    ],
  });
  if (result.button.type === 'primary') {
    return 'close';
  }
  return 'cancel';
});

// ---------------------------------------------------------------------------
// IPC service
// ---------------------------------------------------------------------------

ipc.registerService(AppService({
  async SetTheme(request: SetThemeRequest) {
    app.setTheme(request.theme as Theme);
    return {};
  },

  async SetUnsavedIconState(request: SetUnsavedIconStateRequest) {
    hasUnsavedIcon = request.unsaved;
    return {};
  },

  async SaveIcon(request: SaveIconRequest): Promise<SaveIconResponse> {
    let saveDialogDefault = path.join(app.getPath('userHome'), 'Desktop', 'app.icns');

    for (;;) {
      const pick = await app.showSaveDialog({
        parentWindow: win,
        title: 'Save icon',
        buttonLabelSave: 'Save',
        defaultPath: saveDialogDefault,
        filters: [{ name: 'macOS icon', extensions: ['icns'] }],
        features: { canCreateDirectories: true },
      });

      if (pick.canceled || !pick.path) {
        return { savedPath: '', canceled: true, icnsPath: '' };
      }

      const { parentDir, icnsPath, iconsetDir } = resolveSaveTargets(pick.path);

      if (await icnsOutputsExist(icnsPath, iconsetDir)) {
        const names = `${path.basename(icnsPath)}\n${path.basename(iconsetDir)}`;
        const confirm = await app.showMessageDialog({
          parentWindow: win,
          type: 'warning',
          title: 'Already exists',
          message:
            `A file or folder with this name is already in the destination folder:\n\n${names}\n\n` +
            'Replace them, or choose another name or folder.',
          buttons: [
            { label: 'Cancel', type: 'secondary' },
            { label: 'Choose Different…', type: 'regular' },
            { label: 'Replace', type: 'primary' },
          ],
        });

        if (confirm.button.type === 'primary') {
          await removeIcnsOutputs(icnsPath, iconsetDir);
          await buildIcnsAt(request.imageData, iconsetDir, icnsPath);
          hasUnsavedIcon = false;
          return { savedPath: parentDir, canceled: false, icnsPath };
        }
        if (confirm.button.type === 'regular') {
          saveDialogDefault = icnsPath;
          continue;
        }
        return { savedPath: '', canceled: true, icnsPath: '' };
      }

      await buildIcnsAt(request.imageData, iconsetDir, icnsPath);
      hasUnsavedIcon = false;
      return { savedPath: parentDir, canceled: false, icnsPath };
    }
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

  async GetOpenAIApiKeyStatus(
    _request: GetOpenAIApiKeyStatusRequest
  ): Promise<GetOpenAIApiKeyStatusResponse> {
    const name =
      (process.env.ICON_PROVIDER as ProviderName | undefined) ?? 'openai';
    return {
      openaiKeyRequired: name === 'openai',
      hasOpenaiKey: hasOpenAIApiKeyInPrefs(),
    };
  },

  async SetOpenAIApiKey(
    request: SetOpenAIApiKeyRequest
  ): Promise<SetOpenAIApiKeyResponse> {
    const key = request.apiKey.trim();
    if (!key) {
      return { error: 'API key cannot be empty.' };
    }
    prefs.setString(OPENAI_API_KEY_PREFS_KEY, key);
    if (!prefs.persist()) {
      return { error: 'Could not save preferences to disk.' };
    }
    return { error: '' };
  },
}));

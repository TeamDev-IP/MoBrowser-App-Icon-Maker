import { app, BrowserWindow, ipc, Theme } from '@mobrowser/api';
import { exec, spawn } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import { existsSync } from 'node:fs';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as os from 'node:os';
import {
  GenerateIconRequest,
  GenerateIconResponse,
  SaveIconRequest,
  SaveIconResponse,
  SetThemeRequest,
} from './gen/app';
import { AppService } from './gen/ipc_service';

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
// Python inference process
// ---------------------------------------------------------------------------

interface PendingRequest {
  resolve: (value: GenerateIconResponse) => void;
  reject: (reason: Error) => void;
}

let pythonProc: ChildProcess | null = null;
const pendingRequests = new Map<string, PendingRequest>();
let requestCounter = 0;

// Serialize all Python requests: hold the next caller until the current one finishes.
let pythonBusy = false;
const pythonQueue: Array<() => void> = [];

function getPythonScriptPath(): string {
  if (app.packaged) {
    // Production: script is bundled inside the app resources directory.
    return path.join(app.getPath('appResources'), 'python', 'inference.py');
  }
  // Development: script lives in the project source tree.
  return path.join(process.cwd(), 'assets', 'resources', 'python', 'inference.py');
}

/** Prefer project venv in development so `pip install -r requirements.txt` there is used. */
function getPythonExecutable(): string {
  if (app.packaged) {
    return 'python3';
  }
  const root = process.cwd();
  const unixVenv = path.join(root, '.venv', 'bin', 'python3');
  if (existsSync(unixVenv)) {
    return unixVenv;
  }
  const winVenv = path.join(root, '.venv', 'Scripts', 'python.exe');
  if (existsSync(winVenv)) {
    return winVenv;
  }
  return 'python3';
}

function spawnPython(): ChildProcess {
  const scriptPath = getPythonScriptPath();
  const proc = spawn(getPythonExecutable(), [scriptPath], {
    stdio: ['pipe', 'pipe', 'pipe'],
  });

  let lineBuffer = '';

  proc.stdout!.setEncoding('utf8');
  proc.stdout!.on('data', (chunk: string) => {
    lineBuffer += chunk;
    const lines = lineBuffer.split('\n');
    lineBuffer = lines.pop() ?? '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        const msg = JSON.parse(trimmed) as { id: string; images?: string[]; error?: string };
        const pending = pendingRequests.get(msg.id);
        if (!pending) continue;
        pendingRequests.delete(msg.id);

        if (msg.error) {
          pending.reject(new Error(msg.error));
        } else {
          pending.resolve({ images: msg.images ?? [], error: '' });
        }
      } catch (e) {
        console.error('[python] Failed to parse response line:', e);
      }
    }
  });

  proc.stderr!.setEncoding('utf8');
  proc.stderr!.on('data', (chunk: string) => {
    process.stderr.write(`[python] ${chunk}`);
  });

  proc.on('exit', (code) => {
    console.error(`[python] Process exited with code ${code}`);
    pythonProc = null;
    // Reject any in-flight requests.
    for (const [id, pending] of pendingRequests) {
      pendingRequests.delete(id);
      pending.reject(new Error(`Python process exited unexpectedly (code ${code})`));
    }
  });

  return proc;
}

function ensurePython(): ChildProcess {
  if (!pythonProc) {
    pythonProc = spawnPython();
  }
  return pythonProc;
}

/**
 * Send a generation request to the Python process and return a promise that
 * resolves when the response arrives.  Requests are serialized: the next one
 * starts only after the current one finishes.
 */
function callPython(request: GenerateIconRequest): Promise<GenerateIconResponse> {
  return new Promise((outerResolve, outerReject) => {
    const enqueue = () => {
      pythonBusy = true;
      const id = String(++requestCounter);
      const msg = {
        id,
        prompt: request.prompt,
        negative_prompt: request.negativePrompt,
        reference_image: request.referenceImage || undefined,
        seed: request.seed || undefined,
      };

      pendingRequests.set(id, {
        resolve: (value) => {
          pythonBusy = false;
          drainQueue();
          outerResolve(value);
        },
        reject: (err) => {
          pythonBusy = false;
          drainQueue();
          outerReject(err);
        },
      });

      const proc = ensurePython();
      proc.stdin!.write(JSON.stringify(msg) + '\n');
    };

    if (pythonBusy) {
      pythonQueue.push(enqueue);
    } else {
      enqueue();
    }
  });
}

function drainQueue(): void {
  const next = pythonQueue.shift();
  if (next) next();
}

// Kill the Python process when the app exits so it doesn't linger.
process.on('exit', () => {
  pythonProc?.kill();
});

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
      return { savedPath: '', canceled: true };
    }

    const saveDir = pick.paths[0];

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

      await run(
        `iconutil -c icns "${iconsetDir}" --output "${path.join(saveDir, 'app.icns')}"`
      );
    } finally {
      await fs.rm(tmp, { recursive: true, force: true });
    }

    return { savedPath: saveDir, canceled: false };
  },

  async GenerateIcon(request: GenerateIconRequest): Promise<GenerateIconResponse> {
    try {
      return await callPython(request);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { images: [], error: message };
    }
  },
}));

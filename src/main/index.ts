import { app, BrowserWindow, ipc, Theme } from '@mobrowser/api';
import { SetThemeRequest } from './gen/app';
import { AppService } from './gen/ipc_service';

// Create a new window.
const win = new BrowserWindow({
  size: { width: 550, height: 520 },
  resizable: false,
  windowTitleVisible: false,
  windowTitlebarVisible: false,
  windowButtonPosition: { x: 20, y: 20 },
  vibrancyEffect: 'popover',
  windowButtonVisible: {
    maximize: false,
    zoom: false,
  }
})
win.browser.loadUrl(app.url)
win.centerWindow()
win.show()

ipc.registerService(AppService({
  async SetTheme(request: SetThemeRequest) {
    app.setTheme(request.theme as Theme);
    return {};
  },
}))

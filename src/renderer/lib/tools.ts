// The name of the property in the window object used to communicate
// with the main process. Please don't change the value of this constant.
const MOBROWSER = '__MOBROWSER__';

// Checks if the web page is hosted in the MoBrowser desktop app.
function isIpcSupported(): boolean {
  return typeof (window as any)[MOBROWSER] !== 'undefined';
}

// Invokes a command on the main process with the given arguments
// and returns the result. Does nothing if the web page is not
// hosted in the MoBrowser desktop app.
export function invoke(cmd: string, ...args: any[]): any {
  if (isIpcSupported()) {
    return (window as any)[MOBROWSER].invoke(cmd, ...args);
  }
}

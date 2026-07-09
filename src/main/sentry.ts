import { app } from '@mobrowser/api';
import * as Sentry from '@sentry/node';

declare const SENTRY_DSN: string;

const SENTRY_FLUSH_TIMEOUT_MS = 2000;

if (SENTRY_DSN !== '' && app.packaged) {
  Sentry.init({
    dsn: SENTRY_DSN,
    environment: 'production',
    release: `${app.name}@${app.version}`,
    defaultIntegrations: false,
  });
  Sentry.setTag('process', 'main');
  // Send only one event per production launch to avoid stats duplication.
  Sentry.captureMessage('app.launch', 'info');

  Sentry.startSession();
  Sentry.captureSession();

  process.once('uncaughtException', captureFatalError);
  process.once('unhandledRejection', captureFatalError);
}

function captureFatalError(error: unknown): void {
  Sentry.captureException(error);
  void flushSentry().finally(() => {
    process.exit(1);
  });
}

export function flushSentry(): Promise<boolean> {
  return Sentry.flush(SENTRY_FLUSH_TIMEOUT_MS);
}

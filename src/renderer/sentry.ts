import * as Sentry from "@sentry/react";
import { ipc } from "./gen/ipc";

declare const SENTRY_DSN: string;
declare const SENTRY_ENABLED: boolean;

export async function initializeSentry(): Promise<void> {
  if (SENTRY_DSN === "" || !SENTRY_ENABLED) {
    return;
  }

  const metadata = await ipc.app.GetApplicationMetadata({});

  Sentry.init({
    dsn: SENTRY_DSN,
    environment: "production",
    release: `${metadata.name}@${metadata.version}`,
  });
  Sentry.setTag("process", "renderer");
}

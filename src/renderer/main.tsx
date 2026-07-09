import "@fontsource-variable/inter";
import React from "react";
import ReactDOM from "react-dom/client";
import * as Sentry from "@sentry/react";
import App from "./App.tsx";
import { initializeSentry } from "./sentry";

void initializeSentry().catch((error: unknown) => {
    console.warn("Sentry init failed", error);
});

ReactDOM.createRoot(document.getElementById("root")!, {
    onCaughtError: Sentry.reactErrorHandler(),
    onRecoverableError: Sentry.reactErrorHandler(),
    onUncaughtError: Sentry.reactErrorHandler(),
}).render(
    <React.StrictMode>
        <App/>
    </React.StrictMode>,
);

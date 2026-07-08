import "@fontsource-variable/inter";
import React from "react";
import ReactDOM from "react-dom/client";
import * as Sentry from "@sentry/react";
import App from "./App.tsx";
import { initializeSentry } from "./sentry";

await initializeSentry();

ReactDOM.createRoot(document.getElementById("root")!, {
    onCaughtError: Sentry.reactErrorHandler(),
    onRecoverableError: Sentry.reactErrorHandler(),
    onUncaughtError: Sentry.reactErrorHandler(),
}).render(
    <React.StrictMode>
        <App/>
    </React.StrictMode>,
);

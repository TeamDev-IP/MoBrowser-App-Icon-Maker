import path from "path"
import react from "@vitejs/plugin-react"
import { defineConfig, type UserConfig } from "vite"

export default defineConfig(({ command, mode }) => {
  const buildTimeDefines = createBuildTimeDefines(command === "build")

  if (mode === "main") {
    return defineMainConfig(buildTimeDefines)
  }
  if (mode === "renderer") {
    return defineRendererConfig(buildTimeDefines)
  }
  throw new Error(`Unsupported Vite config mode: ${mode}`)
})

function createBuildTimeDefines(sentryEnabled: boolean): Record<string, string> {
  const sentryDsn = sentryEnabled ? (process.env.SENTRY_DSN ?? "") : ""

  return {
    SENTRY_DSN: JSON.stringify(sentryDsn),
    SENTRY_ENABLED: JSON.stringify(sentryEnabled),
  }
}

function defineMainConfig(buildTimeDefines: Record<string, string>): UserConfig {
  return {
    root: path.resolve(__dirname, "./src/main"),
    define: buildTimeDefines,
    build: {
      target: "esnext",
      outDir: path.resolve(__dirname, "./out/main"),
      emptyOutDir: true,
      sourcemap: true,
      lib: {
        entry: path.resolve(__dirname, "./src/main/index.ts"),
        formats: ["es"],
        fileName: () => "index.js",
      },
    },
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src/main"),
      },
    },
    server: {
      forwardConsole: {
        unhandledErrors: true,
        logLevels: ['warn', 'error'],
      },
    },
  }
}


function defineRendererConfig(buildTimeDefines: Record<string, string>): UserConfig {
  return {
    root: path.resolve(__dirname, "./src/renderer"),
    define: buildTimeDefines,
    plugins: [react()],
    build: {
      outDir: path.resolve(__dirname, "./out/renderer"),
      emptyOutDir: true,
      sourcemap: true,
    },
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src/renderer"),
      },
    },
    server: {
      forwardConsole: {
        unhandledErrors: true,
        logLevels: ['warn', 'error'],
      },
    },
  }
}

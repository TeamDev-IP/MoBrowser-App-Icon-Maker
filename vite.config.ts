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
  const sentryDsn = sentryEnabled ? (process.env.SENTRY_DSN ?? "") : "";

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
      rollupOptions: {
        external: [
          "mobrowser",
          "import-in-the-middle",
          "module-details-from-path",
          "require-in-the-middle",
          // Externalize all Node.js built-in modules
          /^node:.*/,
        ],
      },
    },
    resolve: {
      conditions: ["node"],
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
    // web-txt2img and onnxruntime-web both use dynamic imports and worker
    // URLs that Vite's dep pre-bundler cannot resolve statically.  Excluding
    // them keeps the packages as plain ES module imports at runtime.
    optimizeDeps: {
      exclude: ["web-txt2img", "onnxruntime-web", "@xenova/transformers"],
    },
    // Copy the onnxruntime-web WASM binaries into the build output so the
    // runtime can fetch them from the same origin.
    assetsInclude: ["**/*.wasm"],
    server: {
      forwardConsole: {
        unhandledErrors: true,
        logLevels: ['warn', 'error'],
      },
    },
  }
}

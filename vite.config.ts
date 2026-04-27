import path from "path"
import react from "@vitejs/plugin-react"
import { defineConfig, type UserConfig } from "vite"

export default defineConfig(({ mode }) => {
  if (mode === "main") {
    return defineMainConfig()
  }
  if (mode === "renderer") {
    return defineRendererConfig()
  }
  throw new Error(`Unsupported Vite config mode: ${mode}`)
})

function defineMainConfig(): UserConfig {
  return {
    root: path.resolve(__dirname, "./src/main"),
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
          // Externalize all Node.js built-in modules
          /^node:.*/,
        ],
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


function defineRendererConfig(): UserConfig {
  return {
    root: path.resolve(__dirname, "./src/renderer"),
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

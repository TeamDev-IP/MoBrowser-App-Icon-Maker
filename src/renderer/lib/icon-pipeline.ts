import { useCallback, useEffect, useRef, useState } from "react"
import { loadModel, unloadModel, generateImage } from "web-txt2img"

// ── Types ──────────────────────────────────────────────────────────────────

export type PipelineStatus =
  | "idle"
  | "downloading"
  | "generating"
  | "done"
  | "error"

export interface PipelineProgress {
  /** Overall 0–1 fraction across all active phases. */
  fraction: number
  /** Human-readable message. */
  label: string
}

export interface IconPipeline {
  status: PipelineStatus
  progress: PipelineProgress
  /** Up to 3 PNG data-URL strings, filled in as each variant finishes. */
  variants: (string | null)[]
  generate: (prompt: string, _referenceDataUrl?: string) => void
  cancel: () => void
}

// ── Seeds for the 3 variants ───────────────────────────────────────────────

const VARIANT_SEEDS = [42, 1337, 7919] as const

// Number of SD-Turbo inference steps.
const NUM_STEPS = 4

// ── Tokenizer provider ─────────────────────────────────────────────────────

// Lazily created, shared across all generate calls.
let tokenizerFnPromise: Promise<(text: string, opts?: Record<string, unknown>) => Promise<{ input_ids: number[] }>> | null = null

function getTokenizerProvider() {
  return async () => {
    if (!tokenizerFnPromise) {
      tokenizerFnPromise = (async () => {
        // @huggingface/transformers v3 resolves to dist/transformers.web.js —
        // a browser-native build with no onnxruntime-node dependency.
        const { AutoTokenizer, env } = await import("@huggingface/transformers")
        env.allowLocalModels = false
        env.allowRemoteModels = true

        const tokenizer = await AutoTokenizer.from_pretrained("Xenova/clip-vit-base-patch16")

        // sd-turbo.js calls the tokenizer with { padding: true, max_length: 77, truncation: true }.
        // In @xenova/transformers v2, padding: true + max_length pads to max_length.
        // In @huggingface/transformers v3 (Python-compliant), padding: true only pads to the
        // longest sequence in a batch — a single input stays unpadded.  Normalize to
        // padding: 'max_length' so the tensor always has the 77 tokens the UNET expects.
        return async (text: string, opts?: Record<string, unknown>) => {
          const fixedOpts =
            opts?.padding === true && opts?.max_length != null
              ? { ...opts, padding: "max_length" }
              : opts
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          return (tokenizer as any)(text, fixedOpts)
        }
      })()
    }
    return tokenizerFnPromise
  }
}

// ── Squircle mask (matches the SVG mask used in the UI) ───────────────────

const SQUIRCLE_N = 3.2
const SQUIRCLE_STEPS = 72

function buildSquirclePoints(n: number, steps: number): { x: number; y: number }[] {
  const p = 2 / n
  const pts: { x: number; y: number }[] = []
  for (let i = 0; i <= steps; i++) {
    const t = (i / steps) * 2 * Math.PI
    const c = Math.cos(t)
    const s = Math.sin(t)
    pts.push({
      x: 0.5 + 0.5 * Math.sign(c) * Math.pow(Math.abs(c), p),
      y: 0.5 + 0.5 * Math.sign(s) * Math.pow(Math.abs(s), p),
    })
  }
  return pts
}

const SQUIRCLE_POINTS = buildSquirclePoints(SQUIRCLE_N, SQUIRCLE_STEPS)

/**
 * Given a 512×512 ImageBitmap from SD-Turbo, upscale 2x to 1024×1024 and
 * apply the macOS squircle mask.  Returns a PNG data URL.
 */
async function applySquircleAndUpscale(blob: Blob): Promise<string> {
  const SIZE = 1024
  const bitmap = await createImageBitmap(blob)

  const canvas = new OffscreenCanvas(SIZE, SIZE)
  const ctx = canvas.getContext("2d")!

  // Draw the squircle clip path (0–SIZE coords).
  ctx.beginPath()
  const pts = SQUIRCLE_POINTS
  ctx.moveTo(pts[0].x * SIZE, pts[0].y * SIZE)
  for (let i = 1; i < pts.length; i++) {
    ctx.lineTo(pts[i].x * SIZE, pts[i].y * SIZE)
  }
  ctx.closePath()
  ctx.clip()

  // Draw the SD-Turbo 512×512 output scaled up to 1024×1024 (bilinear by
  // default in Canvas 2D).
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = "high"
  ctx.drawImage(bitmap, 0, 0, SIZE, SIZE)
  bitmap.close()

  const resultBlob = await canvas.convertToBlob({ type: "image/png" })
  return URL.createObjectURL(resultBlob)
}

// Persists across generate() calls — once the model is loaded its weights stay
// in memory, so there's nothing to download on subsequent runs.
let modelIsLoaded = false

// ── Hook ───────────────────────────────────────────────────────────────────

export function useIconPipeline(): IconPipeline {
  const [status, setStatus] = useState<PipelineStatus>("idle")
  const [progress, setProgress] = useState<PipelineProgress>({ fraction: 0, label: "" })
  const [variants, setVariants] = useState<(string | null)[]>([null, null, null])

  const abortControllerRef = useRef<AbortController | null>(null)
  const cancelledRef = useRef(false)

  // Revoke old object URLs when variants are replaced.
  const prevVariantUrlsRef = useRef<(string | null)[]>([null, null, null])
  useEffect(() => {
    return () => {
      prevVariantUrlsRef.current.forEach((url) => url && URL.revokeObjectURL(url))
    }
  }, [])

  const cancel = useCallback(() => {
    cancelledRef.current = true
    abortControllerRef.current?.abort()
  }, [])

  const generate = useCallback(
    async (prompt: string, _referenceDataUrl?: string) => {
      // Revoke any existing variant URLs.
      prevVariantUrlsRef.current.forEach((url) => url && URL.revokeObjectURL(url))
      prevVariantUrlsRef.current = [null, null, null]

      cancelledRef.current = false
      abortControllerRef.current = new AbortController()
      setVariants([null, null, null])

      // ── Phase 1: ensure model is loaded ─────────────────────────────────
      if (!modelIsLoaded) {
        setStatus("downloading")
        setProgress({ fraction: 0, label: "Downloading model…" })
      }

      try {
        const makeLoadOptions = (backend: "webgpu" | "wasm", label: string) => ({
          backendPreference: [backend] as ("webgpu" | "wasm")[],
          tokenizerProvider: getTokenizerProvider(),
          onProgress: (p: { pct?: number; bytesDownloaded?: number; totalBytesExpected?: number }) => {
            if (modelIsLoaded) return
            const frac = p.pct != null ? p.pct / 100 : 0
            const downloaded = p.bytesDownloaded ?? 0
            const total = p.totalBytesExpected ?? 0
            const mb = total > 0 ? ` (${(downloaded / 1e6).toFixed(0)} / ${(total / 1e6).toFixed(0)} MB)` : ""
            setProgress({ fraction: frac * 0.3, label: `${label}${mb}` })
          },
        })

        let loadResult = await loadModel("sd-turbo", makeLoadOptions("webgpu", "Downloading model…"))

        // WebGPU can fail with an OOM/bad_alloc when GPU memory is constrained
        // (e.g. a reference image is already occupying GPU texture memory).
        // In that case, unload any partial state and retry on the CPU WASM backend.
        if (!loadResult.ok) {
          const isMemoryError = (loadResult.message ?? "").toLowerCase().includes("alloc") ||
            (loadResult.message ?? "").toLowerCase().includes("memory") ||
            (loadResult.message ?? "").toLowerCase().includes("create a session")
          if (isMemoryError) {
            await unloadModel("sd-turbo").catch(() => undefined)
            setProgress({ fraction: 0, label: "GPU unavailable, switching to CPU…" })
            loadResult = await loadModel("sd-turbo", makeLoadOptions("wasm", "Downloading model (CPU)…"))
          }
        }

        if (!loadResult.ok) {
          setStatus("error")
          setProgress({ fraction: 0, label: `Failed to load model: ${loadResult.message ?? loadResult.reason}` })
          return
        }

        modelIsLoaded = true

        if (cancelledRef.current) {
          setStatus("idle")
          return
        }

        // ── Phase 2: generate 3 variants sequentially ─────────────────────
        setStatus("generating")

        // Build a prompt that tells the model this is a macOS app icon.
        const iconPrompt = `${prompt.trim()}, macOS app icon, square composition, vibrant colors, professional design`

        const newVariants: (string | null)[] = [null, null, null]

        for (let i = 0; i < 3; i++) {
          if (cancelledRef.current) break

          setProgress({
            fraction: 0.3 + (i / 3) * 0.7,
            label: `Generating variant ${i + 1} of 3…`,
          })

          const signal = abortControllerRef.current.signal

          const result = await generateImage({
            model: "sd-turbo",
            prompt: iconPrompt,
            seed: VARIANT_SEEDS[i],
            signal,
            onProgress: (event) => {
              if (event.phase === "denoising" && event.pct != null) {
                const variantFrac = event.pct / 100
                setProgress({
                  fraction: 0.3 + ((i + variantFrac) / 3) * 0.7,
                  label: `Generating variant ${i + 1} of 3… (step ${Math.round(variantFrac * NUM_STEPS)}/${NUM_STEPS})`,
                })
              }
            },
          })

          if (!result.ok) {
            if (result.reason === "cancelled") break
            // On error, leave this slot null and continue.
            continue
          }

          const dataUrl = await applySquircleAndUpscale(result.blob)
          newVariants[i] = dataUrl
          prevVariantUrlsRef.current[i] = dataUrl

          // Update state after each variant so the UI fills in progressively.
          setVariants([...newVariants])
        }

        if (cancelledRef.current) {
          // If user cancelled mid-run, keep whatever partial results exist.
          const hasAny = newVariants.some((v) => v !== null)
          setStatus(hasAny ? "done" : "idle")
          setProgress({ fraction: 0, label: "" })
        } else {
          setStatus("done")
          setProgress({ fraction: 1, label: "Done" })
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        console.error("[icon-pipeline] generation failed:", err)
        setStatus("error")
        setProgress({ fraction: 0, label: `Error: ${msg}` })
      }
    },
    [],
  )

  return { status, progress, variants, generate, cancel }
}

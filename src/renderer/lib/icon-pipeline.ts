import { useCallback, useRef, useState } from "react"
import { ipc } from "@/gen/ipc"

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
  /** Up to 3 squircle-masked PNG data-URLs used for the in-app preview. */
  variants: (string | null)[]
  /**
   * Up to 3 raw (unmasked, full-square) PNG data-URLs used when writing the
   * .icns file.  macOS applies its own squircle clip when rendering app icons;
   * saving a pre-masked image with transparent corners causes the OS to put a
   * gray background plate behind the icon and shrink it to ~50%.
   */
  rawVariants: (string | null)[]
  generate: (prompt: string, referenceDataUrl?: string) => void
  cancel: () => void
}

// ── Squircle mask (Canvas API) ─────────────────────────────────────────────

/**
 * Lamé curve exponent — must match SQUIRCLE_N used in the renderer's SVG
 * clip-path and in the Python back-end it replaces.
 */
const SQUIRCLE_N = 3.2

/**
 * Build a Path2D that traces the squircle (Lamé curve, n = 3.2) inscribed in
 * a rectangle of the given dimensions.
 */
function squirclePath(width: number, height: number): Path2D {
  const cx = width / 2
  const cy = height / 2
  const rx = width / 2
  const ry = height / 2
  // Parametric exponent: x(t) = cx + rx * |cos t|^(2/n) * sign(cos t)
  const p = 2 / SQUIRCLE_N
  const steps = 512
  const path = new Path2D()
  for (let i = 0; i <= steps; i++) {
    const t = (i / steps) * 2 * Math.PI
    const cos = Math.cos(t)
    const sin = Math.sin(t)
    const x = cx + rx * Math.sign(cos) * Math.pow(Math.abs(cos), p)
    const y = cy + ry * Math.sign(sin) * Math.pow(Math.abs(sin), p)
    if (i === 0) path.moveTo(x, y)
    else path.lineTo(x, y)
  }
  path.closePath()
  return path
}

/**
 * Apply a squircle alpha mask to a PNG data URL using the Canvas API.
 * Returns a new PNG data URL with pixels outside the squircle made transparent.
 */
async function applySquircleMask(dataUrl: string): Promise<string> {
  const bitmap = await createImageBitmap(await fetch(dataUrl).then((r) => r.blob()))
  const canvas = document.createElement("canvas")
  canvas.width = bitmap.width
  canvas.height = bitmap.height
  const ctx = canvas.getContext("2d")!
  ctx.clip(squirclePath(bitmap.width, bitmap.height))
  ctx.drawImage(bitmap, 0, 0)
  bitmap.close()
  return canvas.toDataURL("image/png")
}

// ── Blob URL → base64 helper ───────────────────────────────────────────────

async function blobUrlToBase64(url: string): Promise<string> {
  const response = await fetch(url)
  const blob = await response.blob()
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onloadend = () => {
      const result = reader.result as string
      // Strip the "data:<mime>;base64," prefix.
      const comma = result.indexOf(",")
      resolve(comma >= 0 ? result.slice(comma + 1) : result)
    }
    reader.onerror = reject
    reader.readAsDataURL(blob)
  })
}

// ── Hook ───────────────────────────────────────────────────────────────────

export function useIconPipeline(): IconPipeline {
  const [status, setStatus] = useState<PipelineStatus>("idle")
  const [progress, setProgress] = useState<PipelineProgress>({ fraction: 0, label: "" })
  const [variants, setVariants] = useState<(string | null)[]>([null, null, null])
  const [rawVariants, setRawVariants] = useState<(string | null)[]>([null, null, null])

  // Set when the user clicks Stop while a request is in flight.
  const cancelledRef = useRef(false)

  const cancel = useCallback(() => {
    cancelledRef.current = true
  }, [])

  const generate = useCallback(async (prompt: string, referenceDataUrl?: string) => {
    cancelledRef.current = false
    setVariants([null, null, null])
    setRawVariants([null, null, null])
    setStatus("generating")
    setProgress({ fraction: 0, label: "" })

    try {
      // Convert the optional reference blob URL to raw base64.
      let referenceImage = ""
      if (referenceDataUrl) {
        try {
          referenceImage = await blobUrlToBase64(referenceDataUrl)
        } catch {
          // Non-fatal: proceed without the reference image.
        }
      }

      if (cancelledRef.current) {
        setStatus("idle")
        return
      }

      const response = await ipc.app.GenerateIcon({
        prompt,
        negativePrompt: "",
        referenceImage,
        seed: 0,
      })

      if (cancelledRef.current) {
        setStatus("idle")
        setProgress({ fraction: 0, label: "" })
        return
      }

      if (response.error) {
        setStatus("error")
        setProgress({ fraction: 0, label: `Error: ${response.error}` })
        return
      }

      // Apply squircle mask for the in-app preview; keep the unmasked square
      // image for saving to .icns (macOS applies its own squircle clip).
      const newVariants: (string | null)[] = [null, null, null]
      const newRawVariants: (string | null)[] = [null, null, null]
      for (let i = 0; i < Math.min(response.images.length, 3); i++) {
        const raw = `data:image/png;base64,${response.images[i]}`
        newRawVariants[i] = raw
        newVariants[i] = await applySquircleMask(raw)
      }
      setRawVariants(newRawVariants)
      setVariants(newVariants)
      setStatus("done")
      setProgress({ fraction: 1, label: "" })
    } catch (err) {
      if (cancelledRef.current) {
        setStatus("idle")
        setProgress({ fraction: 0, label: "" })
        return
      }
      const msg = err instanceof Error ? err.message : String(err)
      console.error("[icon-pipeline] IPC call failed:", err)
      setStatus("error")
      setProgress({ fraction: 0, label: `Error: ${msg}` })
    }
  }, [])

  return { status, progress, variants, rawVariants, generate, cancel }
}

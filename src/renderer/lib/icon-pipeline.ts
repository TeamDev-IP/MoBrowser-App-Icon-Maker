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
  /** Up to 3 PNG data-URL strings, filled in as each variant finishes. */
  variants: (string | null)[]
  generate: (prompt: string, referenceDataUrl?: string) => void
  cancel: () => void
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

  // Set when the user clicks Stop while a request is in flight.
  const cancelledRef = useRef(false)

  const cancel = useCallback(() => {
    cancelledRef.current = true
  }, [])

  const generate = useCallback(async (prompt: string, referenceDataUrl?: string) => {
    cancelledRef.current = false
    setVariants([null, null, null])
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

      // Convert the raw base64 strings into data URLs for display.
      const newVariants: (string | null)[] = [null, null, null]
      for (let i = 0; i < Math.min(response.images.length, 3); i++) {
        newVariants[i] = `data:image/png;base64,${response.images[i]}`
      }
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

  return { status, progress, variants, generate, cancel }
}

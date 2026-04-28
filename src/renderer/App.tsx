import { useState, useRef, useEffect, type CSSProperties, type ChangeEvent, type KeyboardEvent } from "react"
import { ThemeProvider } from "@/components/theme-provider"
import {
  ImagePlus,
  ArrowUp,
  Sparkles,
  Download,
  X,
  RefreshCw,
  ChevronRight,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { useIconPipeline } from "@/lib/icon-pipeline"
import { ipc } from "@/gen/ipc"

type IconState = "idle" | "generating" | "generated" | "refine"

type ResumeAfterCancel = "idle" | "generated" | "refine"

// Lamé / superellipse "squircle" (continuous curvature), much closer to the
// iOS/macOS app icon mask than a simple rounded rect (circular fillets).
const SQUIRCLE_N = 3.2
const SQUICLE_STEPS = 72

function buildSquirclePoints(
  cx: number,
  cy: number,
  a: number,
  b: number,
  n: number,
  steps: number
) {
  const p = 2 / n
  const pts: { x: number; y: number }[] = []
  for (let i = 0; i <= steps; i++) {
    const t = (i / steps) * 2 * Math.PI
    const c = Math.cos(t)
    const s = Math.sin(t)
    const x = cx + a * Math.sign(c) * Math.pow(Math.abs(c), p)
    const y = cy + b * Math.sign(s) * Math.pow(Math.abs(s), p)
    pts.push({ x, y })
  }
  return pts
}

function pointsToPathD(pts: { x: number; y: number }[]) {
  return (
    pts
      .map((q, i) => `${i === 0 ? "M" : "L"} ${q.x} ${q.y}`)
      .join(" ") + " Z"
  )
}

const _SQU01 = buildSquirclePoints(0.5, 0.5, 0.5, 0.5, SQUIRCLE_N, SQUICLE_STEPS)
const SQUICLE_PATH_01 = pointsToPathD(_SQU01)
const SQUICLE_PATH_100 = pointsToPathD(
  _SQU01.map((q) => ({ x: q.x * 100, y: q.y * 100 }))
)
const _BP = buildSquirclePoints(72, 72, 54, 54, SQUIRCLE_N, SQUICLE_STEPS)
const BLUEPRINT_SQUICLE_D = pointsToPathD(_BP)

const ICON_CLIP_FILTER_BASE = "drop-shadow(0 12px 24px rgba(0,0,0,0.5))"

const appIconShapeClip: CSSProperties = { clipPath: "url(#iconmaker-squircle-clip)" }

function SquircleClipDefs() {
  return (
    <svg width="0" height="0" className="absolute overflow-hidden" aria-hidden>
      <defs>
        <clipPath id="iconmaker-squircle-clip" clipPathUnits="objectBoundingBox">
          <path d={SQUICLE_PATH_01} />
        </clipPath>
      </defs>
    </svg>
  )
}

function App() {
  return (
    <ThemeProvider>
      <AppContent />
    </ThemeProvider>
  )
}

// ── Blueprint SVG face ───────────────────────────────────────────────────────

function BlueprintFace({ scanning }: { scanning: boolean }) {
  return (
    <svg
      viewBox="0 0 144 144"
      xmlns="http://www.w3.org/2000/svg"
      className="absolute inset-0 w-full h-full"
    >
      <defs>
        {/* Fine 12px grid. */}
        <pattern id="bp-fine" width="12" height="12" patternUnits="userSpaceOnUse">
          <path
            d="M 12 0 L 0 0 0 12"
            fill="none"
            stroke="white"
            strokeOpacity="0.07"
            strokeWidth="0.5"
          />
        </pattern>
        {/* Major 36px grid overlaid on fine. */}
        <pattern id="bp-major" width="36" height="36" patternUnits="userSpaceOnUse">
          <rect width="36" height="36" fill="url(#bp-fine)" />
          <path
            d="M 36 0 L 0 0 0 36"
            fill="none"
            stroke="white"
            strokeOpacity="0.14"
            strokeWidth="0.5"
          />
        </pattern>
        {/* Scan line gradient for the generating sweep. */}
        <linearGradient id="scan-grad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"   stopColor="white" stopOpacity="0" />
          <stop offset="30%"  stopColor="white" stopOpacity="0.06" />
          <stop offset="50%"  stopColor="white" stopOpacity="0.18" />
          <stop offset="70%"  stopColor="white" stopOpacity="0.06" />
          <stop offset="100%" stopColor="white" stopOpacity="0" />
        </linearGradient>
      </defs>

      {/* Background. */}
      <rect width="144" height="144" fill="#1b1b1b" />

      {/* Grid. */}
      <rect width="144" height="144" fill="url(#bp-major)" />

      {/* Center dashed guidelines. */}
      <line x1="72" y1="0"   x2="72"  y2="144" stroke="white" strokeOpacity="0.13" strokeWidth="0.75" strokeDasharray="3 3" />
      <line x1="0"  y1="72"  x2="144" y2="72"  stroke="white" strokeOpacity="0.13" strokeWidth="0.75" strokeDasharray="3 3" />

      {/* Inner canvas — dashed squicle (superellipse), same class of curve as the icon mask. */}
      <path
        d={BLUEPRINT_SQUICLE_D}
        fill="none"
        stroke="white"
        strokeOpacity="0.18"
        strokeWidth="0.75"
        strokeDasharray="4 3"
      />

      {/* Center crosshair. */}
      <line x1="67" y1="72" x2="77" y2="72" stroke="white" strokeOpacity="0.45" strokeWidth="1" strokeLinecap="round" />
      <line x1="72" y1="67" x2="72" y2="77" stroke="white" strokeOpacity="0.45" strokeWidth="1" strokeLinecap="round" />
      <circle cx="72" cy="72" r="1.5" fill="white" fillOpacity="0.3" />

      {/* Scanning sweep — only visible while generating. */}
      {scanning && (
        <rect
          x="0" y="-40" width="144" height="40"
          fill="url(#scan-grad)"
          className="blueprint-scan"
        />
      )}
    </svg>
  )
}

// ── Single icon face ─────────────────────────────────────────────────────────

const ICON_FACE_EDGE_DEFAULT = "rgba(255,255,255,0.08)"
/** Dark gray rim for the idle / generating three-icon stack. */
const ICON_STACK_EDGE = "rgba(40, 40, 45, 0.95)"
const ICON_STACK_EDGE_PX = 4

/** viewBox 0–100 stroke width so the half-stroke that remains inside the clip reads as `visibleBorderPx`. */
function squircleStrokeWidthVbForVisibleBorder(visibleBorderPx: number, boxSizePx: number): string {
  return String((2 * visibleBorderPx * 100) / boxSizePx)
}

function IconFace({
  state,
  src,
  squircleEdgeStroke = ICON_FACE_EDGE_DEFAULT,
  squircleEdgeWidth = "0.4",
}: {
  state: IconState
  /** Generated image URL.  When provided the image is shown instead of the placeholder. */
  src?: string | null
  /** SVG path stroke; defaults to a light hairline. */
  squircleEdgeStroke?: string
  /** Stroke width in the 0–100 viewBox. */
  squircleEdgeWidth?: string
}) {
  return (
    <>
      {src ? (
        <img
          src={src}
          alt="Generated icon"
          className="absolute inset-0 w-full h-full object-cover"
          draggable={false}
        />
      ) : state === "generated" ? (
        <>
          <div className="absolute inset-0 bg-linear-to-br from-violet-600 via-indigo-500 to-blue-400" />
          <div
            className="absolute inset-x-0 top-0 h-1/2 pointer-events-none"
            style={{
              background: "linear-gradient(180deg, rgba(255,255,255,0.12) 0%, transparent 100%)",
            }}
          />
          <div className="relative flex items-center justify-center h-full">
            <Sparkles className="w-12 h-12 text-white" strokeWidth={1.5} />
          </div>
        </>
      ) : (
        <BlueprintFace scanning={state === "generating"} />
      )}

      {/* Subtle edge along the superellipse, matches clip shape at any size. */}
      <svg
        className="absolute inset-0 w-full h-full pointer-events-none"
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        aria-hidden
      >
        <path
          d={SQUICLE_PATH_100}
          fill="none"
          stroke={squircleEdgeStroke}
          strokeWidth={squircleEdgeWidth}
        />
      </svg>
    </>
  )
}

// ── Three-icon stack (idle / generating) ─────────────────────────────────────

function IconStack({ state }: { state: IconState }) {
  return (
    <div className="relative" style={{ width: "252px", height: "150px" }}>
      {/* Left icon — smaller, lower, slightly rotated, behind center. */}
      <div
        className="absolute"
        style={{
          left: "4px", top: "17px", transform: "rotate(-2deg)", zIndex: 0, opacity: 0.5,
          filter: ICON_CLIP_FILTER_BASE,
        }}
      >
        <div className="overflow-hidden" style={{ width: "116px", height: "116px", ...appIconShapeClip }}>
          <IconFace
            state={state}
            squircleEdgeStroke={ICON_STACK_EDGE}
            squircleEdgeWidth={squircleStrokeWidthVbForVisibleBorder(ICON_STACK_EDGE_PX, 116)}
          />
        </div>
      </div>

      {/* Right icon — mirror of left. */}
      <div
        className="absolute"
        style={{
          right: "4px", top: "17px", transform: "rotate(2deg)", zIndex: 0, opacity: 0.5,
          filter: ICON_CLIP_FILTER_BASE,
        }}
      >
        <div className="overflow-hidden" style={{ width: "116px", height: "116px", ...appIconShapeClip }}>
          <IconFace
            state={state}
            squircleEdgeStroke={ICON_STACK_EDGE}
            squircleEdgeWidth={squircleStrokeWidthVbForVisibleBorder(ICON_STACK_EDGE_PX, 116)}
          />
        </div>
      </div>

      {/* Center icon — front, full size. */}
      <div
        className="absolute left-1/2 top-[3px] z-10 -translate-x-1/2"
        style={{ filter: ICON_CLIP_FILTER_BASE }}
      >
        <div className="overflow-hidden" style={{ width: "144px", height: "144px", ...appIconShapeClip }}>
          <IconFace
            state={state}
            squircleEdgeStroke={ICON_STACK_EDGE}
            squircleEdgeWidth={squircleStrokeWidthVbForVisibleBorder(ICON_STACK_EDGE_PX, 144)}
          />
        </div>
      </div>
    </div>
  )
}

// ── Three selectable variants (generated) ────────────────────────────────────

function VariantPicker({
  selected,
  onSelect,
  variants,
}: {
  selected: number | null
  onSelect: (i: number) => void
  variants: (string | null)[]
}) {
  const iconPx = 144
  const selectionRingPx = 4
  // Extra layout space so the stroke (centered on the path) is not clipped at the squircle extrema.
  const cellPx = iconPx + selectionRingPx
  const vbPad = (selectionRingPx / 2) * (100 / iconPx)
  const viewBoxVb = `${-vbPad} ${-vbPad} ${100 + 2 * vbPad} ${100 + 2 * vbPad}`
  const ringStrokeVb = String((selectionRingPx * 100) / iconPx)

  return (
    <div className="flex gap-8">
      {[0, 1, 2].map((i) => {
        const isSelected = selected === i
        const src = variants[i]
        return (
          <button
            key={i}
            onClick={() => onSelect(i)}
            className="relative flex items-center justify-center overflow-visible rounded-none focus:outline-none"
            type="button"
            style={{
              width: cellPx,
              height: cellPx,
              filter: ICON_CLIP_FILTER_BASE,
            }}
          >
            <div
              className="relative z-0 shrink-0 overflow-hidden"
              style={{
                width: iconPx,
                height: iconPx,
                ...appIconShapeClip,
              }}
            >
              <IconFace state="generated" src={src} />
            </div>
            {isSelected && (
              <svg
                className="absolute inset-0 z-10 w-full h-full pointer-events-none overflow-visible"
                viewBox={viewBoxVb}
                preserveAspectRatio="none"
                overflow="visible"
                aria-hidden
              >
                <path
                  d={SQUICLE_PATH_100}
                  fill="none"
                  stroke="white"
                  strokeWidth={ringStrokeVb}
                  strokeLinejoin="round"
                  strokeLinecap="round"
                />
              </svg>
            )}
          </button>
        )
      })}
    </div>
  )
}

// ── Single "base" icon (after user confirms a variant) ───────────────────────

function SingleRefineIcon({ src }: { src?: string | null }) {
  return (
    <div className="relative" style={{ width: "144px", height: "144px", filter: ICON_CLIP_FILTER_BASE }}>
      <div className="overflow-hidden" style={{ width: "100%", height: "100%", ...appIconShapeClip }}>
        <IconFace state="generated" src={src} />
      </div>
    </div>
  )
}

// ── MacOSIcon — switches between stack and picker ────────────────────────────

function MacOSIcon({
  state,
  selected,
  onSelect,
  variants,
  baseIconSrc,
}: {
  state: IconState
  selected: number | null
  onSelect: (i: number) => void
  variants: (string | null)[]
  baseIconSrc?: string | null
}) {
  if (state === "refine") {
    return <SingleRefineIcon src={baseIconSrc} />
  }
  if (state === "generated") {
    return <VariantPicker selected={selected} onSelect={onSelect} variants={variants} />
  }
  return <IconStack state={state} />
}

// ── Title-bar status (progress line + compact label) ─────────────────────────

function TitleBarStatus({
  label,
  fraction,
  isError,
}: {
  label: string
  fraction: number
  isError: boolean
}) {
  if (!label) return null
  return (
    <>
      {/* 2px progress line pinned to the very top edge. */}
      {!isError && (
        <div className="absolute top-0 left-0 right-0 h-[2px] z-50 overflow-hidden">
          <div
            className="h-full bg-primary/70 transition-all duration-300 ease-out"
            style={{ width: `${Math.round(fraction * 100)}%` }}
          />
        </div>
      )}
      {/* Small label centered in the 56px title bar. */}
      <div className="absolute top-0 left-0 right-0 h-14 flex items-center justify-center pointer-events-none z-40">
        <span
          className={cn(
            "text-[11px] tabular-nums select-none",
            isError ? "text-destructive" : "text-muted-foreground/60",
          )}
        >
          {isError ? label : `${label} · ${Math.round(fraction * 100)}%`}
        </span>
      </div>
    </>
  )
}

// ── Prompt input area ─────────────────────────────────────────────────────────

type PrimaryAction = "submit" | "stop" | "refresh" | "select"

function PromptInput({
  value,
  onChange,
  primaryAction,
  onPrimary,
  primaryEnabled,
  inputDisabled,
  placeholder,
  attachments,
  onAttachmentsChange,
}: {
  value: string
  onChange: (v: string) => void
  primaryAction: PrimaryAction
  onPrimary: () => void
  primaryEnabled: boolean
  inputDisabled: boolean
  placeholder: string
  attachments: string[]
  onAttachmentsChange: (attachments: string[]) => void
}) {
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      if (primaryAction === "select") return
      if (primaryEnabled) onPrimary()
    }
  }

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? [])
    const newUrls = files.map((file) => URL.createObjectURL(file))
    onAttachmentsChange([...attachments, ...newUrls])
    e.target.value = ""
  }

  const removeAttachment = (index: number) => {
    const removed = attachments[index]
    URL.revokeObjectURL(removed)
    onAttachmentsChange(attachments.filter((_, i) => i !== index))
  }

  return (
    <div
      className={cn(
        "w-full rounded-lg border border-border bg-secondary/40 transition-all duration-200",
        "focus-within:border-border/80 focus-within:bg-secondary/60"
      )}
    >
      {/* Textarea. */}
      <textarea
        ref={textareaRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={handleKeyDown}
        disabled={inputDisabled}
        placeholder={placeholder}
        rows={2}
        className={cn(
          "w-full bg-transparent resize-none border-0 outline-none ring-0",
          "px-4 pt-3.5 pb-2 text-sm text-foreground placeholder:text-muted-foreground",
          "leading-relaxed overflow-y-auto",
          inputDisabled && "opacity-60"
        )}
        style={{ scrollbarWidth: "thin", scrollbarColor: "rgba(255,255,255,0.15) transparent" }}
      />

      {/* Bottom action bar. */}
      <div className="flex items-center justify-between px-3 pb-3 pt-1">
        <div
          className={cn(
            "flex items-center gap-2",
            inputDisabled && "pointer-events-none opacity-60"
          )}
        >
          {/* Attach reference image. */}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={handleFileChange}
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            className={cn(
              "flex items-center justify-center w-8 h-8 rounded-lg",
              "text-muted-foreground hover:text-foreground hover:bg-white/10",
              "transition-colors shrink-0"
            )}
            title="Attach reference image"
          >
            <ImagePlus className="w-4 h-4" />
          </button>

          {/* Inline attachment thumbnails — same row, no height change. */}
          {attachments.map((src, i) => (
            <div
              key={i}
              className="relative group w-7 h-7 rounded-lg overflow-hidden shrink-0"
            >
              <img src={src} alt="Reference" className="w-full h-full object-cover" />
              <button
                onClick={() => removeAttachment(i)}
                className="absolute inset-0 flex items-center justify-center bg-black/70 opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <X className="w-3 h-3 text-white" />
              </button>
            </div>
          ))}
        </div>

        <button
          type="button"
          onClick={onPrimary}
          disabled={!primaryEnabled}
          className={cn(
            "flex items-center justify-center gap-0.5 rounded-lg transition-all duration-200 shrink-0 h-8 font-medium text-xs",
            primaryAction === "select" ? "min-w-[88px] px-3" : "w-8 min-w-8 px-0",
            primaryEnabled
              ? "bg-primary text-primary-foreground hover:bg-primary/90 shadow-sm"
              : "bg-muted text-muted-foreground cursor-not-allowed"
          )}
          title={
            primaryAction === "stop"
              ? "Stop generation"
              : primaryAction === "refresh"
                ? "Re-generate all variants (Enter)"
                : primaryAction === "select"
                  ? "Use this design as the base: remove other variants, then describe how to build three new ones"
                  : "Generate (Enter)"
          }
          aria-label={
            primaryAction === "stop"
              ? "Stop"
              : primaryAction === "refresh"
                ? "Refresh"
                : primaryAction === "select"
                  ? "Select"
                  : "Submit"
          }
        >
          {primaryAction === "stop" && (
            <span className="w-2.5 h-2.5 rounded-[1px] bg-current" aria-hidden />
          )}
          {primaryAction === "refresh" && <RefreshCw className="w-4 h-4" strokeWidth={2.5} />}
          {primaryAction === "submit" && <ArrowUp className="w-4 h-4" strokeWidth={2.5} />}
          {primaryAction === "select" && (
            <>
              <span>Select</span>
              <ChevronRight className="w-3.5 h-3.5" strokeWidth={2.5} />
            </>
          )}
        </button>
      </div>
    </div>
  )
}

// ── Main app content ──────────────────────────────────────────────────────────

function AppContent() {
  const [iconState, setIconState] = useState<IconState>("idle")
  const [prompt, setPrompt] = useState("")
  const [attachments, setAttachments] = useState<string[]>([])
  const [selectedVariant, setSelectedVariant] = useState<number | null>(null)
  const [baseIconSrc, setBaseIconSrc] = useState<string | null>(null)
  const resumeAfterCancelRef = useRef<ResumeAfterCancel>("idle")

  const pipeline = useIconPipeline()

  // Sync iconState with pipeline status changes.
  useEffect(() => {
    if (pipeline.status === "done") {
      const hasAny = pipeline.variants.some((v) => v !== null)
      setIconState(hasAny ? "generated" : "idle")
    } else if (pipeline.status === "error") {
      // Restore the icon display to what it was before generation started
      // (the error message stays visible in the status bar).
      setIconState(resumeAfterCancelRef.current)
    }
  }, [pipeline.status]) // eslint-disable-line react-hooks/exhaustive-deps

  const startGeneration = () => {
    if (!prompt.trim() || iconState === "generating") return
    resumeAfterCancelRef.current =
      iconState === "refine" ? "refine" : iconState === "generated" ? "generated" : "idle"
    setSelectedVariant(null)
    setIconState("generating")
    pipeline.generate(prompt, attachments[0])
  }

  const stopGeneration = () => {
    pipeline.cancel()
    setIconState(resumeAfterCancelRef.current)
  }

  const confirmSelectedVariant = () => {
    if (iconState !== "generated" || selectedVariant === null) return
    setBaseIconSrc(pipeline.variants[selectedVariant])
    setIconState("refine")
    setSelectedVariant(null)
    setPrompt("")
  }

  const handleSave = async () => {
    const src =
      iconState === "refine"
        ? baseIconSrc
        : selectedVariant !== null
          ? pipeline.variants[selectedVariant]
          : null
    if (!src) return

    try {
      // Fetch the object URL and convert to Uint8Array for IPC transfer.
      const response = await fetch(src)
      const buffer = await response.arrayBuffer()
      const imageData = new Uint8Array(buffer)
      await ipc.app.SaveIcon({ imageData })
    } catch {
      // Silently ignore cancellation or IPC errors.
    }
  }

  const inputPlaceholder =
    iconState === "refine"
      ? "Make changes to the icon or describe a new idea…"
      : "Describe your app icon…"

  const primaryAction: PrimaryAction =
    iconState === "generating"
      ? "stop"
      : iconState === "generated" && selectedVariant !== null
        ? "select"
        : iconState === "generated" && selectedVariant === null
          ? "refresh"
          : "submit"

  const primaryEnabled =
    iconState === "generating"
      ? true
      : primaryAction === "select"
        ? selectedVariant !== null
        : primaryAction === "refresh" || primaryAction === "submit"
          ? prompt.trim().length > 0
          : false

  const onPrimary = () => {
    if (primaryAction === "stop") {
      stopGeneration()
      return
    }
    if (primaryAction === "select") {
      confirmSelectedVariant()
      return
    }
    startGeneration()
  }

  const canSave =
    (iconState === "generated" && selectedVariant !== null) || iconState === "refine"

  const showStatus =
    (pipeline.status === "downloading" || pipeline.status === "error") &&
    pipeline.progress.label !== ""

  return (
    <div className="dark flex flex-col h-screen bg-background text-foreground overflow-hidden">
      <SquircleClipDefs />
      {/* macOS traffic-light spacer (also serves as the drag region). */}
      <div className="draggable" />

      {/* Compact title-bar status: progress line + label. */}
      {showStatus && (
        <TitleBarStatus
          label={pipeline.progress.label}
          fraction={pipeline.progress.fraction}
          isError={pipeline.status === "error"}
        />
      )}

      {/* Save button — top right corner. */}
      <div className="absolute top-3 right-3 z-50">
        <button
          disabled={!canSave}
          onClick={handleSave}
          className={cn(
            "flex items-center gap-2 px-4 h-8 rounded-lg text-sm font-medium transition-all duration-200 non-draggable",
            canSave
              ? "bg-primary text-primary-foreground hover:bg-primary/90 active:scale-[0.97] shadow-md"
              : "bg-secondary/30 text-muted-foreground/40 cursor-not-allowed"
          )}
        >
          <Download className="w-3.5 h-3.5" />
          Save
        </button>
      </div>

      {/* Icon preview — pinned to top, centered horizontally. */}
      <div className="flex justify-center pt-28 pb-20 px-10">
        <MacOSIcon
          state={iconState}
          selected={selectedVariant}
          onSelect={setSelectedVariant}
          variants={pipeline.variants}
          baseIconSrc={baseIconSrc}
        />
      </div>

      {/* Bottom area — input, pushed to the bottom. */}
      <div className="flex flex-1 flex-col items-center justify-end gap-6 px-4 pb-4">
        <PromptInput
          value={prompt}
          onChange={setPrompt}
          primaryAction={primaryAction}
          onPrimary={onPrimary}
          primaryEnabled={primaryEnabled}
          inputDisabled={iconState === "generating"}
          placeholder={inputPlaceholder}
          attachments={attachments}
          onAttachmentsChange={setAttachments}
        />
      </div>
    </div>
  )
}

export default App

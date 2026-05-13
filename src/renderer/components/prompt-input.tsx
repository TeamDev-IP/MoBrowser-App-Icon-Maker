import { useRef, type ChangeEvent, type KeyboardEvent } from "react"
import {
  ArrowUp,
  ChevronRight,
  ImagePlus,
  RefreshCw,
  Settings2,
  X,
} from "lucide-react"
import { cn } from "@/lib/utils"

export type PrimaryAction = "submit" | "stop" | "refresh" | "select"

export function PromptInput({
  value,
  onChange,
  primaryAction,
  onPrimary,
  primaryEnabled,
  onRegenerate,
  regenerateEnabled,
  inputDisabled,
  placeholder,
  attachments,
  onAttachmentsChange,
  onOpenApiKeySettings,
}: {
  value: string
  onChange: (v: string) => void
  primaryAction: PrimaryAction
  onPrimary: () => void
  primaryEnabled: boolean
  onRegenerate?: () => void
  regenerateEnabled?: boolean
  inputDisabled: boolean
  placeholder: string
  attachments: string[]
  onAttachmentsChange: (attachments: string[]) => void
  onOpenApiKeySettings: () => void
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
        "focus-within:border-border/80 focus-within:bg-secondary/60 p-3"
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
          "text-sm text-foreground placeholder:text-muted-foreground",
          "leading-relaxed overflow-y-auto",
          inputDisabled && "opacity-60"
        )}
        style={{ scrollbarWidth: "thin", scrollbarColor: "rgba(255,255,255,0.15) transparent" }}
      />

      {/* Bottom action bar. */}
      <div className="flex items-center justify-between pt-1">
        <div
          className={cn(
            "flex items-center gap-0.5",
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

          <button
            type="button"
            onClick={onOpenApiKeySettings}
            className={cn(
              "flex items-center justify-center w-8 h-8 rounded-lg",
              "text-muted-foreground hover:text-foreground hover:bg-white/10",
              "transition-colors shrink-0"
            )}
            title="OpenAI API key"
            aria-label="OpenAI API key settings"
          >
            <Settings2 className="w-4 h-4" />
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

        <div className="flex items-center gap-2 shrink-0">
          {onRegenerate != null && (
            <button
              type="button"
              onClick={onRegenerate}
              disabled={!regenerateEnabled}
              className={cn(
                "flex items-center justify-center rounded-lg transition-all duration-200 shrink-0 w-8 min-w-8 h-8 px-0",
                regenerateEnabled
                  ? "bg-secondary/70 text-foreground hover:bg-secondary shadow-sm"
                  : "bg-muted text-muted-foreground cursor-not-allowed"
              )}
              title="Regenerate: three new variants from the same prompt"
              aria-label="Regenerate"
            >
              <RefreshCw className="w-4 h-4" strokeWidth={2.5} />
            </button>
          )}
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
    </div>
  )
}

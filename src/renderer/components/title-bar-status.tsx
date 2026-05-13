import { cn } from "@/lib/utils"

export function TitleBarStatus({
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
            className="h-full bg-primary/50 transition-all duration-300 ease-out"
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

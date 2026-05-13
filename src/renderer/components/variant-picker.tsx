import { IconFace } from "@/components/icon-face"
import {
  ICON_CLIP_FILTER_BASE,
  SQUICLE_PATH_100,
  appIconShapeClip,
} from "@/components/squircle"

export function VariantPicker({
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
            className="group relative flex items-center justify-center overflow-visible rounded-none focus:outline-none"
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
            {!isSelected && (
              <svg
                className="pointer-events-none absolute inset-0 z-10 h-full w-full overflow-visible opacity-0 transition-opacity duration-150 group-hover:opacity-100"
                viewBox={viewBoxVb}
                preserveAspectRatio="none"
                overflow="visible"
                aria-hidden
              >
                <path
                  d={SQUICLE_PATH_100}
                  fill="none"
                  stroke="rgb(156, 163, 175)"
                  strokeWidth={ringStrokeVb}
                  strokeLinejoin="round"
                  strokeLinecap="round"
                />
              </svg>
            )}
            {isSelected && (
              <svg
                className="pointer-events-none absolute inset-0 z-10 h-full w-full overflow-visible"
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

import { SQUICLE_PATH_01 } from "@/components/squircle"

export function SquircleClipDefs() {
  return (
    <svg width="0" height="0" className="absolute overflow-hidden" aria-hidden>
      <defs>
        <clipPath id="moicons-squircle-clip" clipPathUnits="objectBoundingBox">
          <path d={SQUICLE_PATH_01} />
        </clipPath>
      </defs>
    </svg>
  )
}

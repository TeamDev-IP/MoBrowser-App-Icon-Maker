import { IconFace } from "@/components/icon-face"
import type { IconState } from "@/components/icon-types"
import {
  ICON_CLIP_FILTER_BASE,
  ICON_STACK_EDGE,
  ICON_STACK_EDGE_PX,
  appIconShapeClip,
  squircleStrokeWidthVbForVisibleBorder,
} from "@/components/squircle"

export function IconStack({ state }: { state: IconState }) {
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

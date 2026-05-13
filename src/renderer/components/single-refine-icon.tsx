import { IconFace } from "@/components/icon-face"
import { ICON_CLIP_FILTER_BASE, appIconShapeClip } from "@/components/squircle"

export function SingleRefineIcon({ src }: { src?: string | null }) {
  return (
    <div className="relative" style={{ width: "144px", height: "144px", filter: ICON_CLIP_FILTER_BASE }}>
      <div className="overflow-hidden" style={{ width: "100%", height: "100%", ...appIconShapeClip }}>
        <IconFace state="generated" src={src} />
      </div>
    </div>
  )
}

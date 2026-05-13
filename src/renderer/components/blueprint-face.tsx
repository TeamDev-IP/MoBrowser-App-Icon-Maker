import { BLUEPRINT_SQUICLE_D } from "@/components/squircle"

export function BlueprintFace({ scanning }: { scanning: boolean }) {
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
            strokeOpacity="0.085"
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
            strokeOpacity="0.16"
            strokeWidth="0.5"
          />
        </pattern>
        {/* Scan line gradient for the generating sweep. */}
        <linearGradient id="scan-grad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"   stopColor="white" stopOpacity="0" />
          <stop offset="30%"  stopColor="white" stopOpacity="0.05" />
          <stop offset="50%"  stopColor="white" stopOpacity="0.14" />
          <stop offset="70%"  stopColor="white" stopOpacity="0.05" />
          <stop offset="100%" stopColor="white" stopOpacity="0" />
        </linearGradient>
      </defs>

      {/* Background. */}
      <rect width="144" height="144" fill="#2a2a2e" />

      {/* Grid. */}
      <rect width="144" height="144" fill="url(#bp-major)" />

      {/* Center dashed guidelines. */}
      <line x1="72" y1="0"   x2="72"  y2="144" stroke="white" strokeOpacity="0.15" strokeWidth="0.75" strokeDasharray="3 3" />
      <line x1="0"  y1="72"  x2="144" y2="72"  stroke="white" strokeOpacity="0.15" strokeWidth="0.75" strokeDasharray="3 3" />

      {/* Inner canvas — dashed squicle (superellipse), same class of curve as the icon mask. */}
      <path
        d={BLUEPRINT_SQUICLE_D}
        fill="none"
        stroke="white"
        strokeOpacity="0.2"
        strokeWidth="0.75"
        strokeDasharray="4 3"
      />

      {/* Center crosshair. */}
      <line x1="67" y1="72" x2="77" y2="72" stroke="white" strokeOpacity="0.4" strokeWidth="1" strokeLinecap="round" />
      <line x1="72" y1="67" x2="72" y2="77" stroke="white" strokeOpacity="0.4" strokeWidth="1" strokeLinecap="round" />
      <circle cx="72" cy="72" r="1.5" fill="white" fillOpacity="0.28" />

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

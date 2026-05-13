import type { IconState } from "@/components/icon-types"
import { IconStack } from "@/components/icon-stack"
import { SingleRefineIcon } from "@/components/single-refine-icon"
import { VariantPicker } from "@/components/variant-picker"

export function MacOSIcon({
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

"use client"

import * as React from "react"
import { Collapsible as CollapsiblePrimitive } from "@base-ui/react/collapsible"

const Collapsible = React.forwardRef<
  React.ElementRef<typeof CollapsiblePrimitive.Root>,
  React.PropsWithoutRef<CollapsiblePrimitive.Root.Props>
>(function Collapsible({ ...props }, ref) {
  return <CollapsiblePrimitive.Root
    ref={ref} data-slot="collapsible" {...props} />

})

const CollapsibleTrigger = React.forwardRef<
  HTMLButtonElement,
  React.PropsWithoutRef<CollapsiblePrimitive.Trigger.Props>
>(function CollapsibleTrigger({ ...props }, ref) {
  return (
    <CollapsiblePrimitive.Trigger
      ref={ref} data-slot="collapsible-trigger" {...props} />
  )

})

const CollapsibleContent = React.forwardRef<
  React.ElementRef<typeof CollapsiblePrimitive.Panel>,
  React.PropsWithoutRef<CollapsiblePrimitive.Panel.Props>
>(function CollapsibleContent({ ...props }, ref) {
  return (
    <CollapsiblePrimitive.Panel
      ref={ref} data-slot="collapsible-content" {...props} />
  )

})

export { Collapsible, CollapsibleTrigger, CollapsibleContent }

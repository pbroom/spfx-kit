"use client"

import * as React from "react"
import { Separator as SeparatorPrimitive } from "@base-ui/react/separator"

import { cn } from "../../lib/utils"

const Separator = React.forwardRef<
  React.ElementRef<typeof SeparatorPrimitive>,
  React.PropsWithoutRef<SeparatorPrimitive.Props>
>(function Separator({
  className,
  orientation = "horizontal",
  ...props
}, ref) {
  return (
    <SeparatorPrimitive
      ref={ref}
      data-slot="separator"
      orientation={orientation}
      className={cn(
        "skui:shrink-0 skui:bg-border skui:data-horizontal:h-px skui:data-horizontal:w-full skui:data-vertical:w-px skui:data-vertical:self-stretch",
        className
      )}
      {...props}
    />
  )

})

export { Separator }

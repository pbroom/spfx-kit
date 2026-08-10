"use client"

import * as React from "react"
import { ScrollArea as ScrollAreaPrimitive } from "@base-ui/react/scroll-area"

import { cn } from "../../lib/utils"

const ScrollArea = React.forwardRef<
  React.ElementRef<typeof ScrollAreaPrimitive.Root>,
  React.PropsWithoutRef<ScrollAreaPrimitive.Root.Props>
>(function ScrollArea({
  className,
  children,
  ...props
}, ref) {
  return (
    <ScrollAreaPrimitive.Root
      ref={ref}
      data-slot="scroll-area"
      className={cn("skui:relative", className)}
      {...props}
    >
      <ScrollAreaPrimitive.Viewport
        data-slot="scroll-area-viewport"
        className="skui:size-full skui:rounded-[inherit] skui:transition-[color,box-shadow] skui:outline-none skui:focus-visible:ring-[3px] skui:focus-visible:ring-ring/50 skui:focus-visible:outline-1"
      >
        {children}
      </ScrollAreaPrimitive.Viewport>
      <ScrollBar />
      <ScrollAreaPrimitive.Corner />
    </ScrollAreaPrimitive.Root>
  )

})

const ScrollBar = React.forwardRef<
  React.ElementRef<typeof ScrollAreaPrimitive.Scrollbar>,
  React.PropsWithoutRef<ScrollAreaPrimitive.Scrollbar.Props>
>(function ScrollBar({
  className,
  orientation = "vertical",
  ...props
}, ref) {
  return (
    <ScrollAreaPrimitive.Scrollbar
      ref={ref}
      data-slot="scroll-area-scrollbar"
      data-orientation={orientation}
      orientation={orientation}
      className={cn(
        "skui:flex skui:touch-none skui:p-px skui:transition-colors skui:select-none skui:data-horizontal:h-2.5 skui:data-horizontal:flex-col skui:data-horizontal:border-t skui:data-horizontal:border-t-transparent skui:data-vertical:h-full skui:data-vertical:w-2.5 skui:data-vertical:border-l skui:data-vertical:border-l-transparent",
        className
      )}
      {...props}
    >
      <ScrollAreaPrimitive.Thumb
        data-slot="scroll-area-thumb"
        className="skui:relative skui:flex-1 skui:rounded-full skui:bg-border"
      />
    </ScrollAreaPrimitive.Scrollbar>
  )

})

export { ScrollArea, ScrollBar }

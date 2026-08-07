"use client"

import * as React from "react"
import { Tooltip as TooltipPrimitive } from "@base-ui/react/tooltip"

import { cn } from "../../lib/utils"

function TooltipProvider({
  delay = 0,
  ...props
}: TooltipPrimitive.Provider.Props) {
  return (
    <TooltipPrimitive.Provider
      data-slot="tooltip-provider"
      delay={delay}
      {...props}
    />
  )
}

function Tooltip({ ...props }: TooltipPrimitive.Root.Props) {
  return <TooltipPrimitive.Root data-slot="tooltip" {...props} />
}

const TooltipTrigger = React.forwardRef<
  HTMLButtonElement,
  React.PropsWithoutRef<TooltipPrimitive.Trigger.Props>
>(function TooltipTrigger({ ...props }, ref) {
  return <TooltipPrimitive.Trigger
    ref={ref} data-slot="tooltip-trigger" {...props} />

})

const TooltipContent = React.forwardRef<
  React.ElementRef<typeof TooltipPrimitive.Popup>,
  React.PropsWithoutRef<TooltipPrimitive.Popup.Props &
  Pick<
    TooltipPrimitive.Positioner.Props,
    "align" | "alignOffset" | "side" | "sideOffset"
  >>
>(function TooltipContent({
  className,
  side = "top",
  sideOffset = 4,
  align = "center",
  alignOffset = 0,
  children,
  ...props
}, ref) {
  return (
    <TooltipPrimitive.Portal>
      <TooltipPrimitive.Positioner
        align={align}
        alignOffset={alignOffset}
        side={side}
        sideOffset={sideOffset}
        className="skui:isolate skui:z-50"
      >
        <TooltipPrimitive.Popup
          ref={ref}
          data-slot="tooltip-content"
          className={cn(
            "skui:z-50 skui:inline-flex skui:w-fit skui:max-w-xs skui:origin-(--transform-origin) skui:items-center skui:gap-1.5 skui:rounded-md skui:bg-foreground skui:px-3 skui:py-1.5 skui:text-xs skui:text-background skui:has-data-[slot=kbd]:pr-1.5 skui:data-[side=bottom]:slide-in-from-top-2 skui:data-[side=inline-end]:slide-in-from-left-2 skui:data-[side=inline-start]:slide-in-from-right-2 skui:data-[side=left]:slide-in-from-right-2 skui:data-[side=right]:slide-in-from-left-2 skui:data-[side=top]:slide-in-from-bottom-2 skui:**:data-[slot=kbd]:relative skui:**:data-[slot=kbd]:isolate skui:**:data-[slot=kbd]:z-50 skui:**:data-[slot=kbd]:rounded-sm skui:data-[state=delayed-open]:animate-in skui:data-[state=delayed-open]:fade-in-0 skui:data-[state=delayed-open]:zoom-in-95 skui:data-open:animate-in skui:data-open:fade-in-0 skui:data-open:zoom-in-95 skui:data-closed:animate-out skui:data-closed:fade-out-0 skui:data-closed:zoom-out-95",
            className
          )}
          {...props}
        >
          {children}
          <TooltipPrimitive.Arrow className="skui:z-50 skui:size-2.5 skui:translate-y-[calc(-50%-2px)] skui:rotate-45 skui:rounded-[2px] skui:bg-foreground skui:fill-foreground skui:data-[side=bottom]:top-1 skui:data-[side=inline-end]:top-1/2! skui:data-[side=inline-end]:-left-1 skui:data-[side=inline-end]:-translate-y-1/2 skui:data-[side=inline-start]:top-1/2! skui:data-[side=inline-start]:-right-1 skui:data-[side=inline-start]:-translate-y-1/2 skui:data-[side=left]:top-1/2! skui:data-[side=left]:-right-1 skui:data-[side=left]:-translate-y-1/2 skui:data-[side=right]:top-1/2! skui:data-[side=right]:-left-1 skui:data-[side=right]:-translate-y-1/2 skui:data-[side=top]:-bottom-2.5" />
        </TooltipPrimitive.Popup>
      </TooltipPrimitive.Positioner>
    </TooltipPrimitive.Portal>
  )

})

export { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider }

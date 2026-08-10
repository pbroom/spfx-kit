"use client"

import * as React from "react"
import { useSpfxUiOwnedRender, useSpfxUiPortalHost, useSpfxUiPortalId } from "../../lib/ui-root"
import { PreviewCard as PreviewCardPrimitive } from "@base-ui/react/preview-card"

import { cn } from "../../lib/utils"

function HoverCard({ ...props }: PreviewCardPrimitive.Root.Props) {
  return <PreviewCardPrimitive.Root data-slot="hover-card" {...props} />
}

const HoverCardTrigger = React.forwardRef<
  HTMLAnchorElement,
  React.PropsWithoutRef<PreviewCardPrimitive.Trigger.Props>
>(function HoverCardTrigger({ ...props }, ref) {
  return (
    <PreviewCardPrimitive.Trigger
      ref={ref} data-slot="hover-card-trigger" {...props} />
  )

})

const HoverCardContent = React.forwardRef<
  React.ElementRef<typeof PreviewCardPrimitive.Popup>,
  React.PropsWithoutRef<PreviewCardPrimitive.Popup.Props &
  Pick<
    PreviewCardPrimitive.Positioner.Props,
    "align" | "alignOffset" | "side" | "sideOffset"
  >>
>(function HoverCardContent({
  className,
  side = "bottom",
  sideOffset = 4,
  align = "center",
  alignOffset = 4,
  ...props
}, ref) {
  return (
    <PreviewCardPrimitive.Portal data-slot="hover-card-portal" id={useSpfxUiPortalId(props.id)} container={useSpfxUiPortalHost()}>
      <PreviewCardPrimitive.Positioner
        align={align}
        alignOffset={alignOffset}
        side={side}
        sideOffset={sideOffset}
        className="skui:isolate skui:z-50"
      >
        <PreviewCardPrimitive.Popup
          ref={ref}
          data-slot="hover-card-content"
          className={cn(
            "skui:z-50 skui:w-64 skui:origin-(--transform-origin) skui:rounded-lg skui:bg-popover skui:p-2.5 skui:text-sm skui:text-popover-foreground skui:shadow-md skui:ring-1 skui:ring-foreground/10 skui:outline-hidden skui:duration-100 skui:data-[side=bottom]:slide-in-from-top-2 skui:data-[side=inline-end]:slide-in-from-left-2 skui:data-[side=inline-start]:slide-in-from-right-2 skui:data-[side=left]:slide-in-from-right-2 skui:data-[side=right]:slide-in-from-left-2 skui:data-[side=top]:slide-in-from-bottom-2 skui:data-open:animate-in skui:data-open:fade-in-0 skui:data-open:zoom-in-95 skui:data-closed:animate-out skui:data-closed:fade-out-0 skui:data-closed:zoom-out-95",
            className
          )}
          {...props} id={props.id} render={useSpfxUiOwnedRender(props.render, props.id, "HoverCardContent")}
        />
      </PreviewCardPrimitive.Positioner>
    </PreviewCardPrimitive.Portal>
  )

})

export { HoverCard, HoverCardTrigger, HoverCardContent }

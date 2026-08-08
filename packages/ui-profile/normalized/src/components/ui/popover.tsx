"use client"

import { useSpfxUiOwnedRender, useSpfxUiPortalHost, useSpfxUiPortalId } from "../../lib/ui-root"
import * as React from "react"
import { Popover as PopoverPrimitive } from "@base-ui/react/popover"

import { cn } from "../../lib/utils"

function Popover({ ...props }: PopoverPrimitive.Root.Props) {
  return <PopoverPrimitive.Root data-slot="popover" {...props} />
}

const PopoverTrigger = React.forwardRef<
  HTMLButtonElement,
  React.PropsWithoutRef<PopoverPrimitive.Trigger.Props>
>(function PopoverTrigger({ ...props }, ref) {
  return <PopoverPrimitive.Trigger
    ref={ref} data-slot="popover-trigger" {...props} />

})

const PopoverContent = React.forwardRef<
  React.ElementRef<typeof PopoverPrimitive.Popup>,
  React.PropsWithoutRef<PopoverPrimitive.Popup.Props &
  Pick<
    PopoverPrimitive.Positioner.Props,
    "align" | "alignOffset" | "side" | "sideOffset"
  >>
>(function PopoverContent({
  className,
  align = "center",
  alignOffset = 0,
  side = "bottom",
  sideOffset = 4,
  ...props
}, ref) {
  return (
    <PopoverPrimitive.Portal id={useSpfxUiPortalId(props.id)} container={useSpfxUiPortalHost()}>
      <PopoverPrimitive.Positioner
        align={align}
        alignOffset={alignOffset}
        side={side}
        sideOffset={sideOffset}
        className="skui:isolate skui:z-50"
      >
        <PopoverPrimitive.Popup
          ref={ref}
          data-slot="popover-content"
          className={cn(
            "skui:z-50 skui:flex skui:w-72 skui:origin-(--transform-origin) skui:flex-col skui:gap-2.5 skui:rounded-lg skui:bg-popover skui:p-2.5 skui:text-sm skui:text-popover-foreground skui:shadow-md skui:ring-1 skui:ring-foreground/10 skui:outline-hidden skui:duration-100 skui:data-[side=bottom]:slide-in-from-top-2 skui:data-[side=inline-end]:slide-in-from-left-2 skui:data-[side=inline-start]:slide-in-from-right-2 skui:data-[side=left]:slide-in-from-right-2 skui:data-[side=right]:slide-in-from-left-2 skui:data-[side=top]:slide-in-from-bottom-2 skui:data-open:animate-in skui:data-open:fade-in-0 skui:data-open:zoom-in-95 skui:data-closed:animate-out skui:data-closed:fade-out-0 skui:data-closed:zoom-out-95",
            className
          )}
          {...props} id={props.id} render={useSpfxUiOwnedRender(props.render, props.id, "PopoverContent")}
        />
      </PopoverPrimitive.Positioner>
    </PopoverPrimitive.Portal>
  )

})

const PopoverHeader = React.forwardRef<
  React.ElementRef<"div">,
  React.PropsWithoutRef<React.ComponentProps<"div">>
>(function PopoverHeader({ className, ...props }, ref) {
  return (
    <div
      ref={ref}
      data-slot="popover-header"
      className={cn("skui:flex skui:flex-col skui:gap-0.5 skui:text-sm", className)}
      {...props}
    />
  )

})

const PopoverTitle = React.forwardRef<
  React.ElementRef<typeof PopoverPrimitive.Title>,
  React.PropsWithoutRef<PopoverPrimitive.Title.Props>
>(function PopoverTitle({ className, ...props }, ref) {
  return (
    <PopoverPrimitive.Title
      ref={ref}
      data-slot="popover-title"
      className={cn("skui:font-medium", className)}
      {...props}
    />
  )

})

const PopoverDescription = React.forwardRef<
  React.ElementRef<typeof PopoverPrimitive.Description>,
  React.PropsWithoutRef<PopoverPrimitive.Description.Props>
>(function PopoverDescription({
  className,
  ...props
}, ref) {
  return (
    <PopoverPrimitive.Description
      ref={ref}
      data-slot="popover-description"
      className={cn("skui:text-muted-foreground", className)}
      {...props}
    />
  )

})

export {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
}

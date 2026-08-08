"use client"

import { useSpfxUiOwnedPortalRender, useSpfxUiOwnedRender, useSpfxUiPortalHost, useSpfxUiPortalId } from "../../lib/ui-root"
import { XIcon } from "lucide-react"
import * as React from "react"
import { Dialog as SheetPrimitive } from "@base-ui/react/dialog"

import { cn } from "../../lib/utils"
import { Button } from "./button"

function Sheet({ ...props }: SheetPrimitive.Root.Props) {
  return <SheetPrimitive.Root data-slot="sheet" {...props} />
}

const SheetTrigger = React.forwardRef<
  HTMLButtonElement,
  React.PropsWithoutRef<SheetPrimitive.Trigger.Props>
>(function SheetTrigger({ ...props }, ref) {
  return <SheetPrimitive.Trigger
    ref={ref} data-slot="sheet-trigger" {...props} />

})

const SheetClose = React.forwardRef<
  HTMLButtonElement,
  React.PropsWithoutRef<SheetPrimitive.Close.Props>
>(function SheetClose({ ...props }, ref) {
  return <SheetPrimitive.Close
    ref={ref} data-slot="sheet-close" {...props} />

})

function SheetPortal({ ...props }: SheetPrimitive.Portal.Props) {
  return <SheetPrimitive.Portal data-slot="sheet-portal" {...props} id={useSpfxUiPortalId(props.id)} container={useSpfxUiPortalHost()} render={useSpfxUiOwnedPortalRender(props.render, props.id, "SheetPortal")} />
}

const SheetOverlay = React.forwardRef<
  React.ElementRef<typeof SheetPrimitive.Backdrop>,
  React.PropsWithoutRef<SheetPrimitive.Backdrop.Props>
>(function SheetOverlay({ className, ...props }, ref) {
  return (
    <SheetPrimitive.Backdrop
      ref={ref}
      data-slot="sheet-overlay"
      className={cn(
        "skui:fixed skui:inset-0 skui:z-50 skui:bg-black/10 skui:transition-opacity skui:duration-150 skui:data-ending-style:opacity-0 skui:data-starting-style:opacity-0 skui:supports-backdrop-filter:backdrop-blur-xs",
        className
      )}
      {...props}
    />
  )

})

const SheetContent = React.forwardRef<
  React.ElementRef<typeof SheetPrimitive.Popup>,
  React.PropsWithoutRef<SheetPrimitive.Popup.Props & {
  side?: "top" | "right" | "bottom" | "left"
  showCloseButton?: boolean
}>
>(function SheetContent({
  className,
  children,
  side = "right",
  showCloseButton = true,
  ...props
}, ref) {
  return (
    <SheetPortal id={props.id}>
      <SheetOverlay />
      <SheetPrimitive.Popup
        ref={ref}
        data-slot="sheet-content"
        data-side={side}
        className={cn(
          "skui:fixed skui:z-50 skui:flex skui:flex-col skui:gap-4 skui:bg-popover skui:bg-clip-padding skui:text-sm skui:text-popover-foreground skui:shadow-lg skui:transition skui:duration-200 skui:ease-in-out skui:data-ending-style:opacity-0 skui:data-starting-style:opacity-0 skui:data-[side=bottom]:inset-x-0 skui:data-[side=bottom]:bottom-0 skui:data-[side=bottom]:h-auto skui:data-[side=bottom]:border-t skui:data-[side=bottom]:data-ending-style:translate-y-[2.5rem] skui:data-[side=bottom]:data-starting-style:translate-y-[2.5rem] skui:data-[side=left]:inset-y-0 skui:data-[side=left]:left-0 skui:data-[side=left]:h-full skui:data-[side=left]:w-3/4 skui:data-[side=left]:border-r skui:data-[side=left]:data-ending-style:translate-x-[-2.5rem] skui:data-[side=left]:data-starting-style:translate-x-[-2.5rem] skui:data-[side=right]:inset-y-0 skui:data-[side=right]:right-0 skui:data-[side=right]:h-full skui:data-[side=right]:w-3/4 skui:data-[side=right]:border-l skui:data-[side=right]:data-ending-style:translate-x-[2.5rem] skui:data-[side=right]:data-starting-style:translate-x-[2.5rem] skui:data-[side=top]:inset-x-0 skui:data-[side=top]:top-0 skui:data-[side=top]:h-auto skui:data-[side=top]:border-b skui:data-[side=top]:data-ending-style:translate-y-[-2.5rem] skui:data-[side=top]:data-starting-style:translate-y-[-2.5rem] skui:data-[side=left]:sm:max-w-sm skui:data-[side=right]:sm:max-w-sm",
          className
        )}
        {...props} id={props.id} render={useSpfxUiOwnedRender(props.render, props.id, "SheetContent")}
      >
        {children}
        {showCloseButton && (
          <SheetPrimitive.Close
            data-slot="sheet-close"
            render={
              <Button
                variant="ghost"
                className="skui:absolute skui:top-3 skui:right-3"
                size="icon-sm"
              />
            }
          >
            <XIcon />
            <span className="skui:sr-only">Close</span>
          </SheetPrimitive.Close>
        )}
      </SheetPrimitive.Popup>
    </SheetPortal>
  )

})

const SheetHeader = React.forwardRef<
  React.ElementRef<"div">,
  React.PropsWithoutRef<React.ComponentProps<"div">>
>(function SheetHeader({ className, ...props }, ref) {
  return (
    <div
      ref={ref}
      data-slot="sheet-header"
      className={cn("skui:flex skui:flex-col skui:gap-0.5 skui:p-4", className)}
      {...props}
    />
  )

})

const SheetFooter = React.forwardRef<
  React.ElementRef<"div">,
  React.PropsWithoutRef<React.ComponentProps<"div">>
>(function SheetFooter({ className, ...props }, ref) {
  return (
    <div
      ref={ref}
      data-slot="sheet-footer"
      className={cn("skui:mt-auto skui:flex skui:flex-col skui:gap-2 skui:p-4", className)}
      {...props}
    />
  )

})

const SheetTitle = React.forwardRef<
  React.ElementRef<typeof SheetPrimitive.Title>,
  React.PropsWithoutRef<SheetPrimitive.Title.Props>
>(function SheetTitle({ className, ...props }, ref) {
  return (
    <SheetPrimitive.Title
      ref={ref}
      data-slot="sheet-title"
      className={cn(
        "skui:font-heading skui:text-base skui:font-medium skui:text-foreground",
        className
      )}
      {...props}
    />
  )

})

const SheetDescription = React.forwardRef<
  React.ElementRef<typeof SheetPrimitive.Description>,
  React.PropsWithoutRef<SheetPrimitive.Description.Props>
>(function SheetDescription({
  className,
  ...props
}, ref) {
  return (
    <SheetPrimitive.Description
      ref={ref}
      data-slot="sheet-description"
      className={cn("skui:text-sm skui:text-muted-foreground", className)}
      {...props}
    />
  )

})

export {
  Sheet,
  SheetTrigger,
  SheetClose,
  SheetContent,
  SheetHeader,
  SheetFooter,
  SheetTitle,
  SheetDescription,
}

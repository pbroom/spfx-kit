"use client"

import { useSpfxUiOwnedPortalRender, useSpfxUiOwnedRender, useSpfxUiPortalHost, useSpfxUiPortalId } from "../../lib/ui-root"
import { XIcon } from "lucide-react"
import * as React from "react"
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog"

import { cn } from "../../lib/utils"
import { Button } from "./button"

function Dialog({ ...props }: DialogPrimitive.Root.Props) {
  return <DialogPrimitive.Root data-slot="dialog" {...props} />
}

const DialogTrigger = React.forwardRef<
  HTMLButtonElement,
  React.PropsWithoutRef<DialogPrimitive.Trigger.Props>
>(function DialogTrigger({ ...props }, ref) {
  return <DialogPrimitive.Trigger
    ref={ref} data-slot="dialog-trigger" {...props} />

})

function DialogPortal({ ...props }: DialogPrimitive.Portal.Props) {
  return <DialogPrimitive.Portal data-slot="dialog-portal" {...props} id={useSpfxUiPortalId(props.id)} container={useSpfxUiPortalHost()} render={useSpfxUiOwnedPortalRender(props.render, props.id, "DialogPortal")} />
}

const DialogClose = React.forwardRef<
  HTMLButtonElement,
  React.PropsWithoutRef<DialogPrimitive.Close.Props>
>(function DialogClose({ ...props }, ref) {
  return <DialogPrimitive.Close
    ref={ref} data-slot="dialog-close" {...props} />

})

const DialogOverlay = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Backdrop>,
  React.PropsWithoutRef<DialogPrimitive.Backdrop.Props>
>(function DialogOverlay({
  className,
  ...props
}, ref) {
  return (
    <DialogPrimitive.Backdrop
      ref={ref}
      data-slot="dialog-overlay"
      className={cn(
        "skui:fixed skui:inset-0 skui:isolate skui:z-50 skui:bg-black/10 skui:duration-100 skui:supports-backdrop-filter:backdrop-blur-xs skui:data-open:animate-in skui:data-open:fade-in-0 skui:data-closed:animate-out skui:data-closed:fade-out-0",
        className
      )}
      {...props}
    />
  )

})

const DialogContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Popup>,
  React.PropsWithoutRef<DialogPrimitive.Popup.Props & {
  showCloseButton?: boolean
}>
>(function DialogContent({
  className,
  children,
  showCloseButton = true,
  ...props
}, ref) {
  return (
    <DialogPortal id={props.id}>
      <DialogOverlay />
      <DialogPrimitive.Popup
        ref={ref}
        data-slot="dialog-content"
        className={cn(
          "skui:fixed skui:top-1/2 skui:left-1/2 skui:z-50 skui:grid skui:w-full skui:max-w-[calc(100%-2rem)] skui:-translate-x-1/2 skui:-translate-y-1/2 skui:gap-4 skui:rounded-xl skui:bg-popover skui:p-4 skui:text-sm skui:text-popover-foreground skui:ring-1 skui:ring-foreground/10 skui:duration-100 skui:outline-none skui:sm:max-w-sm skui:data-open:animate-in skui:data-open:fade-in-0 skui:data-open:zoom-in-95 skui:data-closed:animate-out skui:data-closed:fade-out-0 skui:data-closed:zoom-out-95",
          className
        )}
        {...props} id={props.id} render={useSpfxUiOwnedRender(props.render, props.id, "DialogContent")}
      >
        {children}
        {showCloseButton && (
          <DialogPrimitive.Close
            data-slot="dialog-close"
            render={
              <Button
                variant="ghost"
                className="skui:absolute skui:top-2 skui:right-2"
                size="icon-sm"
              />
            }
          >
            <XIcon />
            <span className="skui:sr-only">Close</span>
          </DialogPrimitive.Close>
        )}
      </DialogPrimitive.Popup>
    </DialogPortal>
  )

})

const DialogHeader = React.forwardRef<
  React.ElementRef<"div">,
  React.PropsWithoutRef<React.ComponentProps<"div">>
>(function DialogHeader({ className, ...props }, ref) {
  return (
    <div
      ref={ref}
      data-slot="dialog-header"
      className={cn("skui:flex skui:flex-col skui:gap-2", className)}
      {...props}
    />
  )

})

const DialogFooter = React.forwardRef<
  React.ElementRef<"div">,
  React.PropsWithoutRef<React.ComponentProps<"div"> & {
  showCloseButton?: boolean
}>
>(function DialogFooter({
  className,
  showCloseButton = false,
  children,
  ...props
}, ref) {
  return (
    <div
      ref={ref}
      data-slot="dialog-footer"
      className={cn(
        "skui:-mx-4 skui:-mb-4 skui:flex skui:flex-col-reverse skui:gap-2 skui:rounded-b-xl skui:border-t skui:bg-muted/50 skui:p-4 skui:sm:flex-row skui:sm:justify-end",
        className
      )}
      {...props}
    >
      {children}
      {showCloseButton && (
        <DialogPrimitive.Close render={<Button variant="outline" />}>
          Close
        </DialogPrimitive.Close>
      )}
    </div>
  )

})

const DialogTitle = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Title>,
  React.PropsWithoutRef<DialogPrimitive.Title.Props>
>(function DialogTitle({ className, ...props }, ref) {
  return (
    <DialogPrimitive.Title
      ref={ref}
      data-slot="dialog-title"
      className={cn(
        "skui:font-heading skui:text-base skui:leading-none skui:font-medium",
        className
      )}
      {...props}
    />
  )

})

const DialogDescription = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Description>,
  React.PropsWithoutRef<DialogPrimitive.Description.Props>
>(function DialogDescription({
  className,
  ...props
}, ref) {
  return (
    <DialogPrimitive.Description
      ref={ref}
      data-slot="dialog-description"
      className={cn(
        "skui:text-sm skui:text-muted-foreground skui:*:[a]:underline skui:*:[a]:underline-offset-3 skui:*:[a]:hover:text-foreground",
        className
      )}
      {...props}
    />
  )

})

export {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
  DialogTrigger,
}

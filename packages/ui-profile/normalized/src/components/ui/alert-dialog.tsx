"use client"

import { useSpfxUiOwnedPortalRender, useSpfxUiOwnedRender, useSpfxUiPortalHost, useSpfxUiPortalId } from "../../lib/ui-root"
import * as React from "react"
import { AlertDialog as AlertDialogPrimitive } from "@base-ui/react/alert-dialog"

import { cn } from "../../lib/utils"
import { Button } from "./button"

function AlertDialog({ ...props }: AlertDialogPrimitive.Root.Props) {
  return <AlertDialogPrimitive.Root data-slot="alert-dialog" {...props} />
}

const AlertDialogTrigger = React.forwardRef<
  HTMLButtonElement,
  React.PropsWithoutRef<AlertDialogPrimitive.Trigger.Props>
>(function AlertDialogTrigger({ ...props }, ref) {
  return (
    <AlertDialogPrimitive.Trigger
      ref={ref} data-slot="alert-dialog-trigger" {...props} />
  )

})

function AlertDialogPortal({ ...props }: AlertDialogPrimitive.Portal.Props) {
  return (
    <AlertDialogPrimitive.Portal data-slot="alert-dialog-portal" {...props} id={useSpfxUiPortalId(props.id)} container={useSpfxUiPortalHost()} render={useSpfxUiOwnedPortalRender(props.render, props.id, "AlertDialogPortal")} />
  )
}

const AlertDialogOverlay = React.forwardRef<
  React.ElementRef<typeof AlertDialogPrimitive.Backdrop>,
  React.PropsWithoutRef<AlertDialogPrimitive.Backdrop.Props>
>(function AlertDialogOverlay({
  className,
  ...props
}, ref) {
  return (
    <AlertDialogPrimitive.Backdrop
      ref={ref}
      data-slot="alert-dialog-overlay"
      className={cn(
        "skui:fixed skui:inset-0 skui:isolate skui:z-50 skui:bg-black/10 skui:duration-100 skui:supports-backdrop-filter:backdrop-blur-xs skui:data-open:animate-in skui:data-open:fade-in-0 skui:data-closed:animate-out skui:data-closed:fade-out-0",
        className
      )}
      {...props}
    />
  )

})

const AlertDialogContent = React.forwardRef<
  React.ElementRef<typeof AlertDialogPrimitive.Popup>,
  React.PropsWithoutRef<AlertDialogPrimitive.Popup.Props & {
  size?: "default" | "sm"
}>
>(function AlertDialogContent({
  className,
  size = "default",
  ...props
}, ref) {
  return (
    <AlertDialogPortal id={props.id}>
      <AlertDialogOverlay />
      <AlertDialogPrimitive.Popup
        ref={ref}
        data-slot="alert-dialog-content"
        data-size={size}
        className={cn(
          "skui:group/alert-dialog-content skui:fixed skui:top-1/2 skui:left-1/2 skui:z-50 skui:grid skui:w-full skui:-translate-x-1/2 skui:-translate-y-1/2 skui:gap-4 skui:rounded-xl skui:bg-popover skui:p-4 skui:text-popover-foreground skui:ring-1 skui:ring-foreground/10 skui:duration-100 skui:outline-none skui:data-[size=default]:max-w-xs skui:data-[size=sm]:max-w-xs skui:data-[size=default]:sm:max-w-sm skui:data-open:animate-in skui:data-open:fade-in-0 skui:data-open:zoom-in-95 skui:data-closed:animate-out skui:data-closed:fade-out-0 skui:data-closed:zoom-out-95",
          className
        )}
        {...props} id={props.id} render={useSpfxUiOwnedRender(props.render, props.id, "AlertDialogContent")}
      />
    </AlertDialogPortal>
  )

})

const AlertDialogHeader = React.forwardRef<
  React.ElementRef<"div">,
  React.PropsWithoutRef<React.ComponentProps<"div">>
>(function AlertDialogHeader({
  className,
  ...props
}, ref) {
  return (
    <div
      ref={ref}
      data-slot="alert-dialog-header"
      className={cn(
        "skui:grid skui:grid-rows-[auto_1fr] skui:place-items-center skui:gap-1.5 skui:text-center skui:has-data-[slot=alert-dialog-media]:grid-rows-[auto_auto_1fr] skui:has-data-[slot=alert-dialog-media]:gap-x-4 skui:sm:group-data-[size=default]/alert-dialog-content:place-items-start skui:sm:group-data-[size=default]/alert-dialog-content:text-left skui:sm:group-data-[size=default]/alert-dialog-content:has-data-[slot=alert-dialog-media]:grid-rows-[auto_1fr]",
        className
      )}
      {...props}
    />
  )

})

const AlertDialogFooter = React.forwardRef<
  React.ElementRef<"div">,
  React.PropsWithoutRef<React.ComponentProps<"div">>
>(function AlertDialogFooter({
  className,
  ...props
}, ref) {
  return (
    <div
      ref={ref}
      data-slot="alert-dialog-footer"
      className={cn(
        "skui:-mx-4 skui:-mb-4 skui:flex skui:flex-col-reverse skui:gap-2 skui:rounded-b-xl skui:border-t skui:bg-muted/50 skui:p-4 skui:group-data-[size=sm]/alert-dialog-content:grid skui:group-data-[size=sm]/alert-dialog-content:grid-cols-2 skui:sm:flex-row skui:sm:justify-end",
        className
      )}
      {...props}
    />
  )

})

const AlertDialogMedia = React.forwardRef<
  React.ElementRef<"div">,
  React.PropsWithoutRef<React.ComponentProps<"div">>
>(function AlertDialogMedia({
  className,
  ...props
}, ref) {
  return (
    <div
      ref={ref}
      data-slot="alert-dialog-media"
      className={cn(
        "skui:mb-2 skui:inline-flex skui:size-10 skui:items-center skui:justify-center skui:rounded-md skui:bg-muted skui:sm:group-data-[size=default]/alert-dialog-content:row-span-2 skui:*:[svg:not([class*='size-'])]:size-6",
        className
      )}
      {...props}
    />
  )

})

const AlertDialogTitle = React.forwardRef<
  React.ElementRef<typeof AlertDialogPrimitive.Title>,
  React.PropsWithoutRef<React.ComponentProps<typeof AlertDialogPrimitive.Title>>
>(function AlertDialogTitle({
  className,
  ...props
}, ref) {
  return (
    <AlertDialogPrimitive.Title
      ref={ref}
      data-slot="alert-dialog-title"
      className={cn(
        "skui:font-heading skui:text-base skui:font-medium skui:sm:group-data-[size=default]/alert-dialog-content:group-has-data-[slot=alert-dialog-media]/alert-dialog-content:col-start-2",
        className
      )}
      {...props}
    />
  )

})

const AlertDialogDescription = React.forwardRef<
  React.ElementRef<typeof AlertDialogPrimitive.Description>,
  React.PropsWithoutRef<React.ComponentProps<typeof AlertDialogPrimitive.Description>>
>(function AlertDialogDescription({
  className,
  ...props
}, ref) {
  return (
    <AlertDialogPrimitive.Description
      ref={ref}
      data-slot="alert-dialog-description"
      className={cn(
        "skui:text-sm skui:text-balance skui:text-muted-foreground skui:md:text-pretty skui:*:[a]:underline skui:*:[a]:underline-offset-3 skui:*:[a]:hover:text-foreground",
        className
      )}
      {...props}
    />
  )

})

const AlertDialogAction = React.forwardRef<
  React.ElementRef<typeof Button>,
  React.PropsWithoutRef<React.ComponentProps<typeof Button>>
>(function AlertDialogAction({
  className,
  ...props
}, ref) {
  return (
    <Button
      ref={ref}
      data-slot="alert-dialog-action"
      className={cn(className)}
      {...props}
    />
  )

})

const AlertDialogCancel = React.forwardRef<
  HTMLButtonElement,
  React.PropsWithoutRef<AlertDialogPrimitive.Close.Props &
  Pick<React.ComponentProps<typeof Button>, "variant" | "size">>
>(function AlertDialogCancel({
  className,
  variant = "outline",
  size = "default",
  ...props
}, ref) {
  return (
    <AlertDialogPrimitive.Close
      ref={ref}
      data-slot="alert-dialog-cancel"
      className={cn(className)}
      render={<Button variant={variant} size={size} />}
      {...props}
    />
  )

})

export {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogOverlay,
  AlertDialogPortal,
  AlertDialogTitle,
  AlertDialogTrigger,
}

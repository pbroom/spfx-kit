"use client"

import { useSpfxUiOwnedPortalRender, useSpfxUiPortalHost, useSpfxUiPortalId } from "../../lib/ui-root"
import { CircleCheckIcon, InfoIcon, Loader2Icon, OctagonXIcon, TriangleAlertIcon, XIcon } from "lucide-react"
import * as React from "react"
import { Toast as ToastPrimitive } from "@base-ui/react/toast"

import { cn } from "../../lib/utils"
import { Button } from "./button"

function ToastProvider({ ...props }: ToastPrimitive.Provider.Props) {
  return <ToastPrimitive.Provider {...props} />
}

function ToastPortal({ ...props }: ToastPrimitive.Portal.Props & { id: string }) {
  const portalHost = useSpfxUiPortalHost()
  return (
    <ToastPrimitive.Portal
      data-slot="toast-portal"
      {...props}
      id={useSpfxUiPortalId(props.id)}
      container={portalHost}
      render={useSpfxUiOwnedPortalRender(props.render, props.id, "ToastPortal")}
    />
  )
}

const ToastViewport = React.forwardRef<
  React.ElementRef<typeof ToastPrimitive.Viewport>,
  React.PropsWithoutRef<ToastPrimitive.Viewport.Props>
>(function ToastViewport({ className, ...props }, ref) {
  return (
    <ToastPrimitive.Viewport
      ref={ref}
      data-slot="toast-viewport"
      className={cn(
        "skui:pointer-events-none skui:fixed skui:inset-x-4 skui:bottom-4 skui:z-50 skui:mx-auto skui:w-auto skui:max-w-sm skui:outline-none skui:sm:right-4 skui:sm:left-auto skui:sm:mx-0 skui:sm:w-full",
        className
      )}
      {...props}
    />
  )

})

const Toast = React.forwardRef<
  React.ElementRef<typeof ToastPrimitive.Root>,
  React.PropsWithoutRef<ToastPrimitive.Root.Props>
>(function Toast({ className, ...props }, ref) {
  return (
    <ToastPrimitive.Root
      ref={ref}
      data-slot="toast"
      className={cn(
        "skui:group/toast skui:pointer-events-auto skui:absolute skui:right-0 skui:bottom-0 skui:z-[calc(1000-var(--toast-index))] skui:w-full skui:origin-bottom skui:rounded-2xl skui:border skui:bg-popover skui:text-popover-foreground skui:shadow-lg skui:will-change-transform skui:outline-none skui:select-none skui:focus-visible:border-ring skui:focus-visible:ring-[3px] skui:focus-visible:ring-ring/50",
        "skui:[--gap:0.75rem] skui:[--height:var(--toast-frontmost-height,var(--toast-height))] skui:[--offset-y:calc(var(--toast-offset-y)*-1+calc(var(--toast-index)*var(--gap)*-1)+var(--toast-swipe-movement-y))] skui:[--peek:0.75rem] skui:[--scale:calc(max(0,1-(var(--toast-index)*0.1)))] skui:[--shrink:calc(1-var(--scale))]",
        "skui:h-(--height) skui:[transform:translateX(var(--toast-swipe-movement-x))_translateY(calc(var(--toast-swipe-movement-y)-(var(--toast-index)*var(--peek))-(var(--shrink)*var(--height))))_scale(var(--scale))] skui:[transition:transform_500ms_cubic-bezier(0.22,1,0.36,1),opacity_500ms,height_150ms]",
        "skui:after:absolute skui:after:top-full skui:after:left-0 skui:after:h-[calc(var(--gap)+1px)] skui:after:w-full skui:after:content-['']",
        "skui:data-expanded:h-(--toast-height) skui:data-expanded:[transform:translateX(var(--toast-swipe-movement-x))_translateY(var(--offset-y))]",
        "skui:data-limited:opacity-0 skui:data-starting-style:[transform:translateY(150%)]",
        "skui:[&[data-ending-style]:not([data-limited]):not([data-swipe-direction])]:[transform:translateY(150%)]",
        "skui:data-ending-style:data-[swipe-direction=down]:[transform:translateY(calc(var(--toast-swipe-movement-y)+150%))]",
        "skui:data-ending-style:data-[swipe-direction=left]:[transform:translateX(calc(var(--toast-swipe-movement-x)-150%))_translateY(var(--offset-y))]",
        "skui:data-ending-style:data-[swipe-direction=right]:[transform:translateX(calc(var(--toast-swipe-movement-x)+150%))_translateY(var(--offset-y))]",
        "skui:data-ending-style:data-[swipe-direction=up]:[transform:translateY(calc(var(--toast-swipe-movement-y)-150%))]",
        "skui:data-expanded:data-ending-style:data-[swipe-direction=down]:[transform:translateY(calc(var(--toast-swipe-movement-y)+150%))]",
        "skui:data-expanded:data-ending-style:data-[swipe-direction=left]:[transform:translateX(calc(var(--toast-swipe-movement-x)-150%))_translateY(var(--offset-y))]",
        "skui:data-expanded:data-ending-style:data-[swipe-direction=right]:[transform:translateX(calc(var(--toast-swipe-movement-x)+150%))_translateY(var(--offset-y))]",
        "skui:data-expanded:data-ending-style:data-[swipe-direction=up]:[transform:translateY(calc(var(--toast-swipe-movement-y)-150%))]",
        className
      )}
      {...props}
    />
  )

})

const ToastContent = React.forwardRef<
  React.ElementRef<typeof ToastPrimitive.Content>,
  React.PropsWithoutRef<ToastPrimitive.Content.Props>
>(function ToastContent({ className, ...props }, ref) {
  return (
    <ToastPrimitive.Content
      ref={ref}
      data-slot="toast-content"
      className={cn(
        "skui:flex skui:h-full skui:items-center skui:gap-3 skui:overflow-hidden skui:p-4 skui:transition-opacity skui:duration-250 skui:ease-[cubic-bezier(0.22,1,0.36,1)] skui:data-behind:opacity-0 skui:data-expanded:opacity-100",
        className
      )}
      {...props}
    />
  )

})

const ToastTitle = React.forwardRef<
  React.ElementRef<typeof ToastPrimitive.Title>,
  React.PropsWithoutRef<ToastPrimitive.Title.Props>
>(function ToastTitle({ className, ...props }, ref) {
  return (
    <ToastPrimitive.Title
      ref={ref}
      data-slot="toast-title"
      className={cn("skui:text-sm skui:font-medium", className)}
      {...props}
    />
  )

})

const ToastDescription = React.forwardRef<
  React.ElementRef<typeof ToastPrimitive.Description>,
  React.PropsWithoutRef<ToastPrimitive.Description.Props>
>(function ToastDescription({
  className,
  ...props
}, ref) {
  return (
    <ToastPrimitive.Description
      ref={ref}
      data-slot="toast-description"
      className={cn("skui:text-sm skui:text-muted-foreground", className)}
      {...props}
    />
  )

})

const ToastAction = React.forwardRef<
  React.ElementRef<typeof ToastPrimitive.Action>,
  React.PropsWithoutRef<ToastPrimitive.Action.Props>
>(function ToastAction({
  className,
  render = <Button variant="outline" size="sm" />,
  ...props
}, ref) {
  return (
    <ToastPrimitive.Action
      ref={ref}
      data-slot="toast-action"
      render={render}
      className={cn("skui:shrink-0", className)}
      {...props}
    />
  )

})

const ToastClose = React.forwardRef<
  HTMLButtonElement,
  React.PropsWithoutRef<ToastPrimitive.Close.Props>
>(function ToastClose({
  className,
  children,
  render = <Button variant="ghost" size="icon-sm" />,
  ...props
}, ref) {
  return (
    <ToastPrimitive.Close
      ref={ref}
      data-slot="toast-close"
      aria-label="Close toast"
      render={render}
      className={cn(
        "skui:relative skui:shrink-0 skui:text-muted-foreground skui:after:absolute skui:after:-inset-2 skui:after:content-[''] skui:hover:text-foreground",
        className
      )}
      {...props}
    >
      {children ?? (
        <XIcon
          aria-hidden="true"
        />
      )}
    </ToastPrimitive.Close>
  )

})

function ToastIcon({ type }: { type: string | undefined }) {
  let icon: React.ReactNode = null

  if (type === "success") {
    icon = (
      <CircleCheckIcon
        aria-hidden="true"
      />
    )
  }

  if (type === "info") {
    icon = (
      <InfoIcon
        aria-hidden="true"
      />
    )
  }

  if (type === "warning") {
    icon = (
      <TriangleAlertIcon
        aria-hidden="true"
      />
    )
  }

  if (type === "error") {
    icon = (
      <OctagonXIcon
        className="skui:text-destructive"
        aria-hidden="true"
      />
    )
  }

  if (type === "loading") {
    icon = (
      <Loader2Icon
        className="skui:animate-spin"
        aria-hidden="true"
      />
    )
  }

  if (!icon) {
    return null
  }

  return (
    <span
      data-slot="toast-icon"
      className="skui:shrink-0 skui:[&_svg]:pointer-events-none skui:[&_svg:not([class*='size-'])]:size-4"
    >
      {icon}
    </span>
  )
}

function ToastList() {
  const { toasts } = ToastPrimitive.useToastManager()

  return (
    <>
      {toasts.map((toastItem) => (
    <Toast key={toastItem.id} toast={toastItem}>
      <ToastContent>
        <ToastIcon type={toastItem.type} />
        <div className="skui:flex skui:min-w-0 skui:flex-1 skui:flex-col skui:gap-1">
          <ToastTitle />
          <ToastDescription />
        </div>
        <ToastAction />
        <ToastClose />
      </ToastContent>
    </Toast>
      ))}
    </>
  )
}

function Toaster({
  children,
  portalId,
  toastManager: toastManagerProp,
  ...props
}: ToastPrimitive.Provider.Props & { portalId: string }) {
  const defaultToastManager = React.useMemo(() => ToastPrimitive.createToastManager(), [])
  const toastManager = toastManagerProp ?? defaultToastManager

  return (
    <ToastProvider toastManager={toastManager} {...props}>
      {children}
      <ToastPortal id={portalId}>
        <ToastViewport>
          <ToastList />
        </ToastViewport>
      </ToastPortal>
    </ToastProvider>
  )
}

const createToastManager = ToastPrimitive.createToastManager
const useToastManager = ToastPrimitive.useToastManager

export {
  Toaster,
  Toast,
  ToastAction,
  ToastClose,
  ToastContent,
  ToastDescription,
  ToastPortal,
  ToastProvider,
  ToastTitle,
  ToastViewport,
  createToastManager,
  useToastManager,
}

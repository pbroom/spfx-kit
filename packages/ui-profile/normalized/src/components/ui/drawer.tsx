"use client"

import { useSpfxUiOwnedPortalRender, useSpfxUiOwnedRender, useSpfxUiPortalHost, useSpfxUiPortalId } from "../../lib/ui-root"
import * as React from "react"
import { Drawer as DrawerPrimitive } from "@base-ui/react/drawer"

import { cn } from "../../lib/utils"

type DrawerContextProps = {
  hasSnapPoints: boolean
  modal: DrawerPrimitive.Root.Props["modal"]
  showSwipeHandle: boolean
  swipeDirection: NonNullable<DrawerPrimitive.Root.Props["swipeDirection"]>
}

const DrawerContext = React.createContext<DrawerContextProps | null>(null)

function useDrawer() {
  const context = React.useContext(DrawerContext)

  if (!context) {
    throw new Error("useDrawer must be used within a Drawer.")
  }

  return context
}

function Drawer({
  modal = true,
  showSwipeHandle = false,
  snapPoints,
  swipeDirection = "down",
  ...props
}: DrawerPrimitive.Root.Props & {
  showSwipeHandle?: boolean
}) {
  const hasSnapPoints = snapPoints != null && snapPoints.length > 0
  const contextValue = React.useMemo(
    () => ({ hasSnapPoints, modal, showSwipeHandle, swipeDirection }),
    [hasSnapPoints, modal, showSwipeHandle, swipeDirection]
  )

  return (
    <DrawerContext.Provider value={contextValue}>
      <DrawerPrimitive.Root
        data-slot="drawer"
        modal={modal}
        snapPoints={snapPoints}
        swipeDirection={swipeDirection}
        {...props}
      />
    </DrawerContext.Provider>
  )
}

const DrawerTrigger = React.forwardRef<
  HTMLButtonElement,
  React.PropsWithoutRef<DrawerPrimitive.Trigger.Props>
>(function DrawerTrigger({ ...props }, ref) {
  return <DrawerPrimitive.Trigger
    ref={ref} data-slot="drawer-trigger" {...props} />

})

function DrawerPortal({ ...props }: DrawerPrimitive.Portal.Props) {
  return <DrawerPrimitive.Portal data-slot="drawer-portal" {...props} id={useSpfxUiPortalId(props.id)} container={useSpfxUiPortalHost()} render={useSpfxUiOwnedPortalRender(props.render, props.id, "DrawerPortal")} />
}

const DrawerClose = React.forwardRef<
  HTMLButtonElement,
  React.PropsWithoutRef<DrawerPrimitive.Close.Props>
>(function DrawerClose({ ...props }, ref) {
  return <DrawerPrimitive.Close
    ref={ref} data-slot="drawer-close" {...props} />

})

const DrawerOverlay = React.forwardRef<
  React.ElementRef<typeof DrawerPrimitive.Backdrop>,
  React.PropsWithoutRef<DrawerPrimitive.Backdrop.Props>
>(function DrawerOverlay({
  className,
  ...props
}, ref) {
  return (
    <DrawerPrimitive.Backdrop
      ref={ref}
      data-slot="drawer-overlay"
      className={cn(
        "skui:fixed skui:inset-0 skui:z-50 skui:min-h-dvh skui:bg-black/10 skui:opacity-[max(var(--drawer-overlay-min-opacity,0),calc(1-var(--drawer-swipe-progress)))] skui:transition-opacity skui:duration-450 skui:ease-[cubic-bezier(0.32,0.72,0,1)] skui:select-none skui:data-ending-style:pointer-events-none skui:data-ending-style:opacity-0 skui:data-ending-style:duration-[calc(var(--drawer-swipe-strength)*400ms)] skui:data-snap-points:[--drawer-overlay-min-opacity:0.5] skui:data-starting-style:opacity-0 skui:data-swiping:duration-0 skui:supports-backdrop-filter:backdrop-blur-xs skui:supports-[-webkit-touch-callout:none]:absolute",
        className
      )}
      {...props}
    />
  )

})

const DrawerSwipeHandle = React.forwardRef<
  React.ElementRef<"div">,
  React.PropsWithoutRef<React.ComponentProps<"div">>
>(function DrawerSwipeHandle({
  className,
  ...props
}, ref) {
  return (
    <div
      ref={ref}
      data-slot="drawer-swipe-handle"
      aria-hidden="true"
      className={cn(
        "skui:relative skui:z-10 skui:flex skui:shrink-0 skui:cursor-grab skui:transition-opacity skui:duration-200 skui:group-data-nested-drawer-open/drawer-popup:opacity-0 skui:group-data-nested-drawer-swiping/drawer-popup:opacity-100 skui:group-data-[swipe-axis=x]/drawer-popup:h-full skui:group-data-[swipe-axis=x]/drawer-popup:w-3 skui:group-data-[swipe-axis=x]/drawer-popup:items-center skui:group-data-[swipe-axis=y]/drawer-popup:h-3 skui:group-data-[swipe-axis=y]/drawer-popup:w-full skui:group-data-[swipe-axis=y]/drawer-popup:justify-center skui:group-data-[swipe-direction=down]/drawer-popup:items-end skui:group-data-[swipe-direction=left]/drawer-popup:order-last skui:group-data-[swipe-direction=left]/drawer-popup:justify-start skui:group-data-[swipe-direction=right]/drawer-popup:justify-end skui:group-data-[swipe-direction=up]/drawer-popup:order-last skui:group-data-[swipe-direction=up]/drawer-popup:items-start skui:after:block skui:after:shrink-0 skui:after:rounded-full skui:after:bg-muted skui:group-data-[swipe-axis=x]/drawer-popup:after:h-24 skui:group-data-[swipe-axis=x]/drawer-popup:after:w-1 skui:group-data-[swipe-axis=y]/drawer-popup:after:h-1 skui:group-data-[swipe-axis=y]/drawer-popup:after:w-24 skui:active:cursor-grabbing",
        className
      )}
      {...props}
    />
  )

})

const DrawerContent = React.forwardRef<
  React.ElementRef<typeof DrawerPrimitive.Popup>,
  React.PropsWithoutRef<DrawerPrimitive.Popup.Props>
>(function DrawerContent({
  className,
  children,
  ...props
}, ref) {
  const { hasSnapPoints, modal, showSwipeHandle, swipeDirection } = useDrawer()
  const swipeAxis =
    swipeDirection === "down" || swipeDirection === "up" ? "y" : "x"

  return (
    <DrawerPortal data-slot="drawer-portal" id={props.id}>
      {modal === true && (
        <DrawerOverlay data-snap-points={hasSnapPoints ? "" : undefined} />
      )}
      <DrawerPrimitive.Viewport
        data-slot="drawer-viewport"
        data-modal={modal}
        className="skui:pointer-events-none skui:fixed skui:inset-0 skui:z-50 skui:select-none skui:data-[modal=true]:pointer-events-auto"
      >
        <DrawerPrimitive.Popup
          ref={ref}
          data-slot="drawer-popup"
          data-swipe-axis={swipeAxis}
          data-snap-points={hasSnapPoints ? "" : undefined}
          className={cn(
            // Base.
            "skui:group/drawer-popup skui:pointer-events-auto skui:fixed skui:z-50 skui:m-(--drawer-inset,0px) skui:flex skui:h-(--drawer-content-height) skui:max-h-(--drawer-content-max-height,none) skui:min-h-0 skui:w-(--drawer-content-width,auto) skui:transform-[translate3d(var(--translate-x,0px),var(--translate-y,0px),0)_scale(var(--stack-scale))] skui:flex-col skui:bg-popover skui:text-sm skui:text-popover-foreground skui:transition-[transform,height,opacity,filter] skui:duration-450 skui:ease-[cubic-bezier(0.22,1,0.36,1)] skui:will-change-transform skui:outline-none skui:select-none skui:[interpolate-size:allow-keywords] skui:data-[swipe-direction=down]:rounded-t-xl skui:data-[swipe-direction=down]:border-t skui:data-[swipe-direction=left]:rounded-r-xl skui:data-[swipe-direction=left]:border-r skui:data-[swipe-direction=right]:rounded-l-xl skui:data-[swipe-direction=right]:border-l skui:data-[swipe-direction=up]:rounded-b-xl skui:data-[swipe-direction=up]:border-b",
            // Nested.
            "skui:data-nested-drawer-open:overflow-hidden skui:data-nested-drawer-open:brightness-95",
            // Bleed.
            "skui:after:pointer-events-none skui:after:absolute skui:after:bg-(--drawer-bleed-background,var(--color-popover)) skui:data-[swipe-axis=x]:after:inset-y-0 skui:data-[swipe-axis=x]:after:w-(--bleed) skui:data-[swipe-axis=y]:after:inset-x-0 skui:data-[swipe-axis=y]:after:h-(--bleed) skui:data-[swipe-direction=down]:after:top-full skui:data-[swipe-direction=left]:after:right-full skui:data-[swipe-direction=right]:after:left-full skui:data-[swipe-direction=up]:after:bottom-full",
            // Sizing.
            "skui:[--drawer-content-height:var(--drawer-height,auto)] skui:data-[swipe-axis=x]:[--drawer-content-width:75%] skui:data-[swipe-axis=y]:[--drawer-content-max-height:calc(100dvh-6rem)] skui:data-[swipe-axis=y]:data-snap-points:[--drawer-content-height:100dvh] skui:data-[swipe-axis=x]:sm:[--drawer-content-width:24rem]",
            // Stack.
            "skui:[--bleed:3rem] skui:[--peek:1rem] skui:[--stack-height:var(--drawer-frontmost-height,var(--drawer-height,0px))] skui:[--stack-peek-offset:max(0px,calc((var(--nested-drawers)-var(--stack-progress))*var(--peek)))] skui:[--stack-progress:clamp(0,var(--drawer-swipe-progress),1)] skui:[--stack-scale-base:max(0,calc(1-(var(--nested-drawers)*var(--stack-step))))] skui:[--stack-scale:clamp(0,calc(var(--stack-scale-base)+(var(--stack-step)*var(--stack-progress))),1)] skui:[--stack-shrink:calc(1-var(--stack-scale))] skui:[--stack-step:0.05]",
            // Transitions.
            "skui:data-ending-style:transform-(--closed-transform) skui:data-ending-style:opacity-[0.9999] skui:data-ending-style:duration-[calc(var(--drawer-swipe-strength)*400ms)] skui:data-nested-drawer-swiping:duration-0 skui:data-ending-style:data-nested-drawer-swiping:duration-[calc(var(--drawer-swipe-strength)*400ms)] skui:data-starting-style:transform-(--closed-transform) skui:data-swiping:duration-0 skui:data-ending-style:data-swiping:duration-[calc(var(--drawer-swipe-strength)*400ms)]",
            // Axis: y.
            "skui:data-[swipe-axis=y]:inset-x-0 skui:data-[swipe-axis=y]:data-nested-drawer-open:h-(--stack-height)",
            // Axis: x.
            "skui:data-[swipe-axis=x]:inset-y-0 skui:data-[swipe-axis=x]:flex-row",
            // Direction: down.
            "skui:data-[swipe-direction=down]:bottom-0 skui:data-[swipe-direction=down]:origin-bottom skui:data-[swipe-direction=down]:[--closed-transform:translate3d(0,calc(100%+var(--drawer-inset,0px)+2px),0)] skui:data-[swipe-direction=down]:[--translate-y:calc(var(--drawer-snap-point-offset,0px)+var(--drawer-swipe-movement-y)-var(--stack-peek-offset)-(var(--stack-shrink)*var(--stack-height)))]",
            // Direction: up.
            "skui:data-[swipe-direction=up]:top-0 skui:data-[swipe-direction=up]:origin-top skui:data-[swipe-direction=up]:[--closed-transform:translate3d(0,calc(-100%-var(--drawer-inset,0px)-2px),0)] skui:data-[swipe-direction=up]:[--translate-y:calc(var(--drawer-snap-point-offset,0px)+var(--drawer-swipe-movement-y)+var(--stack-peek-offset)+(var(--stack-shrink)*var(--stack-height)))]",
            // Direction: left.
            "skui:data-[swipe-direction=left]:left-0 skui:data-[swipe-direction=left]:origin-left skui:data-[swipe-direction=left]:[--closed-transform:translate3d(calc(-100%-var(--drawer-inset,0px)-2px),0,0)] skui:data-[swipe-direction=left]:[--translate-x:calc(var(--drawer-swipe-movement-x)+var(--stack-peek-offset)+(var(--stack-shrink)*100%))]",
            // Direction: right.
            "skui:data-[swipe-direction=right]:right-0 skui:data-[swipe-direction=right]:origin-right skui:data-[swipe-direction=right]:[--closed-transform:translate3d(calc(100%+var(--drawer-inset,0px)+2px),0,0)] skui:data-[swipe-direction=right]:[--translate-x:calc(var(--drawer-swipe-movement-x)-var(--stack-peek-offset)-(var(--stack-shrink)*100%))]",
            className
          )}
          {...props} id={props.id} render={useSpfxUiOwnedRender(props.render, props.id, "DrawerContent")}
        >
          {showSwipeHandle && <DrawerSwipeHandle />}
          <DrawerPrimitive.Content
            data-slot="drawer-content"
            className={cn(
              "skui:flex skui:min-h-0 skui:flex-1 skui:flex-col skui:overflow-hidden skui:overscroll-contain skui:rounded-[inherit] skui:transition-opacity skui:duration-300 skui:ease-[cubic-bezier(0.45,1.005,0,1.005)] skui:select-text skui:group-data-nested-drawer-open/drawer-popup:opacity-0 skui:group-data-nested-drawer-swiping/drawer-popup:opacity-100 skui:group-data-swiping/drawer-popup:select-none"
            )}
          >
            {children}
          </DrawerPrimitive.Content>
        </DrawerPrimitive.Popup>
      </DrawerPrimitive.Viewport>
    </DrawerPortal>
  )

})

const DrawerHeader = React.forwardRef<
  React.ElementRef<"div">,
  React.PropsWithoutRef<React.ComponentProps<"div">>
>(function DrawerHeader({ className, ...props }, ref) {
  return (
    <div
      ref={ref}
      data-slot="drawer-header"
      className={cn(
        "skui:flex skui:shrink-0 skui:flex-col skui:gap-0.5 skui:p-4 skui:pb-0 skui:group-data-[swipe-axis=y]/drawer-popup:text-center skui:md:gap-0.5 skui:md:text-left",
        className
      )}
      {...props}
    />
  )

})

const DrawerFooter = React.forwardRef<
  React.ElementRef<"div">,
  React.PropsWithoutRef<React.ComponentProps<"div">>
>(function DrawerFooter({ className, ...props }, ref) {
  return (
    <div
      ref={ref}
      data-slot="drawer-footer"
      className={cn("skui:mt-auto skui:flex skui:shrink-0 skui:flex-col skui:gap-2 skui:p-4 skui:pt-0", className)}
      {...props}
    />
  )

})

const DrawerTitle = React.forwardRef<
  React.ElementRef<typeof DrawerPrimitive.Title>,
  React.PropsWithoutRef<DrawerPrimitive.Title.Props>
>(function DrawerTitle({ className, ...props }, ref) {
  return (
    <DrawerPrimitive.Title
      ref={ref}
      data-slot="drawer-title"
      className={cn(
        "skui:font-heading skui:text-base skui:font-medium skui:text-foreground",
        className
      )}
      {...props}
    />
  )

})

const DrawerDescription = React.forwardRef<
  React.ElementRef<typeof DrawerPrimitive.Description>,
  React.PropsWithoutRef<DrawerPrimitive.Description.Props>
>(function DrawerDescription({
  className,
  ...props
}, ref) {
  return (
    <DrawerPrimitive.Description
      ref={ref}
      data-slot="drawer-description"
      className={cn("skui:text-sm skui:text-balance skui:text-muted-foreground", className)}
      {...props}
    />
  )

})

export {
  Drawer,
  DrawerPortal,
  DrawerOverlay,
  DrawerSwipeHandle,
  DrawerTrigger,
  DrawerClose,
  DrawerContent,
  DrawerHeader,
  DrawerFooter,
  DrawerTitle,
  DrawerDescription,
}

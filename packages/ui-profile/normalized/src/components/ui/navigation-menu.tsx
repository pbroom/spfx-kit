import * as React from "react"
import { useSpfxUiOwnedRender, useSpfxUiPortalHost, useSpfxUiPortalId } from "../../lib/ui-root"
import { useSpfxUiDerivedId, useSpfxUiRequiredId } from "../../lib/ui-root"
import { ChevronDownIcon } from "lucide-react"
import { NavigationMenu as NavigationMenuPrimitive } from "@base-ui/react/navigation-menu"
import { cva } from "class-variance-authority"

import { cn } from "../../lib/utils"

const NavigationMenu = React.forwardRef<
  React.ElementRef<typeof NavigationMenuPrimitive.Root>,
  React.PropsWithoutRef<NavigationMenuPrimitive.Root.Props &
  Pick<NavigationMenuPrimitive.Positioner.Props, "align">>
>(function NavigationMenu({
  id,
  align = "start",
  className,
  children,
  ...props
}, ref) {
  const rootId = useSpfxUiRequiredId(id, "NavigationMenu.Root")
  const positionerId = useSpfxUiDerivedId(rootId, "positioner")

  return (
    <NavigationMenuPrimitive.Root
      ref={ref}
      id={rootId}
      data-slot="navigation-menu"
      className={cn(
        "skui:group/navigation-menu skui:relative skui:flex skui:max-w-max skui:flex-1 skui:items-center skui:justify-center",
        className
      )}
      {...props}
    >
      {children}
      <NavigationMenuPositioner id={positionerId} align={align} />
    </NavigationMenuPrimitive.Root>
  )

})

const NavigationMenuList = React.forwardRef<
  React.ElementRef<typeof NavigationMenuPrimitive.List>,
  React.PropsWithoutRef<React.ComponentPropsWithRef<typeof NavigationMenuPrimitive.List>>
>(function NavigationMenuList({
  className,
  ...props
}, ref) {
  return (
    <NavigationMenuPrimitive.List
      ref={ref}
      data-slot="navigation-menu-list"
      className={cn(
        "skui:group skui:flex skui:flex-1 skui:list-none skui:items-center skui:justify-center skui:gap-0",
        className
      )}
      {...props}
    />
  )

})

const NavigationMenuItem = React.forwardRef<
  React.ElementRef<typeof NavigationMenuPrimitive.Item>,
  React.PropsWithoutRef<React.ComponentPropsWithRef<typeof NavigationMenuPrimitive.Item>>
>(function NavigationMenuItem({
  className,
  ...props
}, ref) {
  return (
    <NavigationMenuPrimitive.Item
      ref={ref}
      data-slot="navigation-menu-item"
      className={cn("skui:relative", className)}
      {...props}
    />
  )

})

const navigationMenuTriggerStyle = cva(
  "skui:group/navigation-menu-trigger skui:inline-flex skui:h-9 skui:w-max skui:items-center skui:justify-center skui:rounded-lg skui:px-2.5 skui:py-1.5 skui:text-sm skui:font-medium skui:transition-all skui:outline-none skui:hover:bg-muted skui:focus:bg-muted skui:focus-visible:ring-3 skui:focus-visible:ring-ring/50 skui:focus-visible:outline-1 skui:disabled:pointer-events-none skui:disabled:opacity-50 skui:data-popup-open:bg-muted/50 skui:data-popup-open:hover:bg-muted skui:data-open:bg-muted/50 skui:data-open:hover:bg-muted skui:data-open:focus:bg-muted"
)

const NavigationMenuTrigger = React.forwardRef<
  HTMLButtonElement,
  React.PropsWithoutRef<NavigationMenuPrimitive.Trigger.Props>
>(function NavigationMenuTrigger({
  className,
  children,
  ...props
}, ref) {
  return (
    <NavigationMenuPrimitive.Trigger
      ref={ref}
      data-slot="navigation-menu-trigger"
      className={cn(navigationMenuTriggerStyle(), "skui:group", className)}
      {...props}
    >
      {children}{" "}
      <ChevronDownIcon
        className="skui:relative skui:top-px skui:ml-1 skui:size-3 skui:transition skui:duration-300 skui:group-data-popup-open/navigation-menu-trigger:rotate-180 skui:group-data-open/navigation-menu-trigger:rotate-180"
        aria-hidden="true"
      />
    </NavigationMenuPrimitive.Trigger>
  )

})

const NavigationMenuContent = React.forwardRef<
  React.ElementRef<typeof NavigationMenuPrimitive.Content>,
  React.PropsWithoutRef<NavigationMenuPrimitive.Content.Props>
>(function NavigationMenuContent({
  className,
  ...props
}, ref) {
  return (
    <NavigationMenuPrimitive.Content
      ref={ref}
      data-slot="navigation-menu-content"
      className={cn(
        "skui:data-ending-style:data-activation-direction=left:translate-x-[50%] skui:data-ending-style:data-activation-direction=right:translate-x-[-50%] skui:data-starting-style:data-activation-direction=left:translate-x-[-50%] skui:data-starting-style:data-activation-direction=right:translate-x-[50%] skui:h-full skui:w-auto skui:p-1 skui:transition-[opacity,transform,translate] skui:duration-[0.35s] skui:ease-[cubic-bezier(0.22,1,0.36,1)] skui:group-data-[viewport=false]/navigation-menu:rounded-lg skui:group-data-[viewport=false]/navigation-menu:bg-popover skui:group-data-[viewport=false]/navigation-menu:text-popover-foreground skui:group-data-[viewport=false]/navigation-menu:shadow skui:group-data-[viewport=false]/navigation-menu:ring-1 skui:group-data-[viewport=false]/navigation-menu:ring-foreground/10 skui:group-data-[viewport=false]/navigation-menu:duration-300 skui:data-ending-style:opacity-0 skui:data-starting-style:opacity-0 skui:data-[motion=from-end]:slide-in-from-right-52 skui:data-[motion=from-start]:slide-in-from-left-52 skui:data-[motion=to-end]:slide-out-to-right-52 skui:data-[motion=to-start]:slide-out-to-left-52 skui:data-[motion^=from-]:animate-in skui:data-[motion^=from-]:fade-in skui:data-[motion^=to-]:animate-out skui:data-[motion^=to-]:fade-out skui:**:data-[slot=navigation-menu-link]:focus:ring-0 skui:**:data-[slot=navigation-menu-link]:focus:outline-none skui:group-data-[viewport=false]/navigation-menu:data-open:animate-in skui:group-data-[viewport=false]/navigation-menu:data-open:fade-in-0 skui:group-data-[viewport=false]/navigation-menu:data-open:zoom-in-95 skui:group-data-[viewport=false]/navigation-menu:data-closed:animate-out skui:group-data-[viewport=false]/navigation-menu:data-closed:fade-out-0 skui:group-data-[viewport=false]/navigation-menu:data-closed:zoom-out-95",
        className
      )}
      {...props}
    />
  )

})

const NavigationMenuPositioner = React.forwardRef<
  React.ElementRef<typeof NavigationMenuPrimitive.Positioner>,
  React.PropsWithoutRef<NavigationMenuPrimitive.Positioner.Props>
>(function NavigationMenuPositioner({
  id,
  className,
  side = "bottom",
  sideOffset = 8,
  align = "start",
  alignOffset = 0,
  ...props
}, ref) {
  return (
    <NavigationMenuPrimitive.Portal id={useSpfxUiPortalId(id)} container={useSpfxUiPortalHost()}>
      <NavigationMenuPrimitive.Positioner
        ref={ref}
        side={side}
        sideOffset={sideOffset}
        align={align}
        alignOffset={alignOffset}
        className={cn(
          "skui:isolate skui:z-50 skui:h-(--positioner-height) skui:w-(--positioner-width) skui:max-w-(--available-width) skui:transition-[top,left,right,bottom] skui:duration-[0.35s] skui:ease-[cubic-bezier(0.22,1,0.36,1)] skui:data-instant:transition-none skui:data-[side=bottom]:before:top-[-10px] skui:data-[side=bottom]:before:right-0 skui:data-[side=bottom]:before:left-0",
          className
        )}
        {...props}
      >
        <NavigationMenuPrimitive.Popup className="skui:data-[ending-style]:easing-[ease] skui:xs:w-(--popup-width) skui:relative skui:h-(--popup-height) skui:w-(--popup-width) skui:origin-(--transform-origin) skui:rounded-lg skui:bg-popover skui:text-popover-foreground skui:shadow skui:ring-1 skui:ring-foreground/10 skui:transition-[opacity,transform,width,height,scale,translate] skui:duration-[0.35s] skui:ease-[cubic-bezier(0.22,1,0.36,1)] skui:outline-none skui:data-ending-style:scale-90 skui:data-ending-style:opacity-0 skui:data-ending-style:duration-150 skui:data-starting-style:scale-90 skui:data-starting-style:opacity-0" id={id} render={useSpfxUiOwnedRender(undefined, id, "NavigationMenuPositioner")}>
          <NavigationMenuPrimitive.Viewport className="skui:relative skui:size-full skui:overflow-hidden" />
        </NavigationMenuPrimitive.Popup>
      </NavigationMenuPrimitive.Positioner>
    </NavigationMenuPrimitive.Portal>
  )

})

const NavigationMenuLink = React.forwardRef<
  React.ElementRef<typeof NavigationMenuPrimitive.Link>,
  React.PropsWithoutRef<NavigationMenuPrimitive.Link.Props>
>(function NavigationMenuLink({
  className,
  ...props
}, ref) {
  return (
    <NavigationMenuPrimitive.Link
      ref={ref}
      data-slot="navigation-menu-link"
      className={cn(
        "skui:flex skui:items-center skui:gap-2 skui:rounded-lg skui:p-2 skui:text-sm skui:transition-all skui:outline-none skui:hover:bg-muted skui:focus:bg-muted skui:focus-visible:ring-3 skui:focus-visible:ring-ring/50 skui:focus-visible:outline-1 skui:in-data-[slot=navigation-menu-content]:rounded-md skui:data-active:bg-muted/50 skui:data-active:hover:bg-muted skui:data-active:focus:bg-muted skui:[&_svg:not([class*='size-'])]:size-4",
        className
      )}
      {...props}
    />
  )

})

const NavigationMenuIndicator = React.forwardRef<
  React.ElementRef<typeof NavigationMenuPrimitive.Icon>,
  React.PropsWithoutRef<React.ComponentPropsWithRef<typeof NavigationMenuPrimitive.Icon>>
>(function NavigationMenuIndicator({
  className,
  ...props
}, ref) {
  return (
    <NavigationMenuPrimitive.Icon
      ref={ref}
      data-slot="navigation-menu-indicator"
      className={cn(
        "skui:top-full skui:z-1 skui:flex skui:h-1.5 skui:items-end skui:justify-center skui:overflow-hidden skui:data-[state=hidden]:animate-out skui:data-[state=hidden]:fade-out skui:data-[state=visible]:animate-in skui:data-[state=visible]:fade-in",
        className
      )}
      {...props}
    >
      <div className="skui:relative skui:top-[60%] skui:h-2 skui:w-2 skui:rotate-45 skui:rounded-tl-sm skui:bg-border skui:shadow-md" />
    </NavigationMenuPrimitive.Icon>
  )

})

export {
  NavigationMenu,
  NavigationMenuContent,
  NavigationMenuIndicator,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
  NavigationMenuTrigger,
  navigationMenuTriggerStyle,
  NavigationMenuPositioner,
}

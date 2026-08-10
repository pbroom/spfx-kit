"use client"

import { useSpfxUiHost } from "../../lib/ui-root"
import { PanelLeftIcon } from "lucide-react"
import * as React from "react"
import { mergeProps } from "@base-ui/react/merge-props"
import { useRender } from "@base-ui/react/use-render"
import { cva, type VariantProps } from "class-variance-authority"

import { useIsMobile } from "../../hooks/use-mobile"
import { cn } from "../../lib/utils"
import { Button } from "./button"
import { Input } from "./input"
import { Separator } from "./separator"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "./sheet"
import { Skeleton } from "./skeleton"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "./tooltip"

const SIDEBAR_COOKIE_NAME = "sidebar_state"
const SIDEBAR_COOKIE_MAX_AGE = 60 * 60 * 24 * 7
const SIDEBAR_WIDTH = "16rem"
const SIDEBAR_WIDTH_MOBILE = "18rem"
const SIDEBAR_WIDTH_ICON = "3rem"
const SIDEBAR_KEYBOARD_SHORTCUT = "b"

type SidebarContextProps = {
  state: "expanded" | "collapsed"
  open: boolean
  setOpen: (open: boolean) => void
  openMobile: boolean
  setOpenMobile: (open: boolean) => void
  isMobile: boolean
  toggleSidebar: () => void
}

const SidebarContext = React.createContext<SidebarContextProps | null>(null)

function useSidebar() {
  const context = React.useContext(SidebarContext)
  if (!context) {
    throw new Error("useSidebar must be used within a SidebarProvider.")
  }

  return context
}

const SidebarProvider = React.forwardRef<
  React.ElementRef<"div">,
  React.PropsWithoutRef<React.ComponentProps<"div"> & {
  defaultOpen?: boolean
  open?: boolean
  onOpenChange?: (open: boolean) => void
}>
>(function SidebarProvider({
  defaultOpen = true,
  open: openProp,
  onOpenChange: setOpenProp,
  className,
  style,
  children,
  ...props
}, ref) {
  const { appRoot, instanceId, portalHost, targetDocument, targetWindow } = useSpfxUiHost()
  const isMobile = useIsMobile()
  const [openMobile, setOpenMobile] = React.useState(false)

  // This is the internal state of the sidebar.
  // We use openProp and setOpenProp for control from outside the component.
  const [_open, _setOpen] = React.useState(defaultOpen)
  const open = openProp ?? _open
  const setOpen = React.useCallback(
    (value: boolean | ((value: boolean) => boolean)) => {
      const openState = typeof value === "function" ? value(open) : value
      if (setOpenProp) {
        setOpenProp(openState)
      } else {
        _setOpen(openState)
      }

      // This sets the cookie to keep the sidebar state.
      targetDocument.cookie = `${SIDEBAR_COOKIE_NAME}_${encodeURIComponent(instanceId)}=${openState}; path=/; max-age=${SIDEBAR_COOKIE_MAX_AGE}`
    },
    [setOpenProp, open]
  )

  // Helper to toggle the sidebar.
  const toggleSidebar = React.useCallback(() => {
    return isMobile ? setOpenMobile((open) => !open) : setOpen((open) => !open)
  }, [isMobile, setOpen, setOpenMobile])

  // Adds a keyboard shortcut to toggle the sidebar.
  React.useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (
        event.key === SIDEBAR_KEYBOARD_SHORTCUT &&
        (event.metaKey || event.ctrlKey)
      ) {
        const activeElement = targetDocument.activeElement
        if (!activeElement || (!appRoot.contains(activeElement) && !portalHost.contains(activeElement))) return
        event.preventDefault()
        toggleSidebar()
      }
    }

    targetWindow.addEventListener("keydown", handleKeyDown)
    return () => targetWindow.removeEventListener("keydown", handleKeyDown)
  }, [appRoot, portalHost, targetDocument, targetWindow, toggleSidebar])

  // We add a state so that we can do data-state="expanded" or "collapsed".
  // This makes it easier to style the sidebar with Tailwind classes.
  const state = open ? "expanded" : "collapsed"

  const contextValue = React.useMemo<SidebarContextProps>(
    () => ({
      state,
      open,
      setOpen,
      isMobile,
      openMobile,
      setOpenMobile,
      toggleSidebar,
    }),
    [state, open, setOpen, isMobile, openMobile, setOpenMobile, toggleSidebar]
  )

  return (
    <SidebarContext.Provider value={contextValue}>
      <div
        ref={ref}
        data-slot="sidebar-wrapper"
        style={
          {
            "--sidebar-width": SIDEBAR_WIDTH,
            "--sidebar-width-icon": SIDEBAR_WIDTH_ICON,
            ...style,
          } as React.CSSProperties
        }
        className={cn(
          "skui:group/sidebar-wrapper skui:flex skui:min-h-svh skui:w-full skui:has-data-[variant=inset]:bg-sidebar",
          className
        )}
        {...props}
      >
        {children}
      </div>
    </SidebarContext.Provider>
  )

})

const Sidebar = React.forwardRef(function Sidebar({
  side = "left",
  variant = "sidebar",
  collapsible = "offcanvas",
  className,
  children,
  dir,
  ...props
}: React.ComponentProps<"div"> & {
  side?: "left" | "right"
  variant?: "sidebar" | "floating" | "inset"
  collapsible?: "offcanvas" | "icon" | "none"
}, ref: React.ForwardedRef<HTMLDivElement>) {
  const { isMobile, state, openMobile, setOpenMobile } = useSidebar()

  if (collapsible === "none") {
    return (
      <div
        ref={ref}
        data-slot="sidebar"
        className={cn(
          "skui:flex skui:h-full skui:w-(--sidebar-width) skui:flex-col skui:bg-sidebar skui:text-sidebar-foreground",
          className
        )}
        {...props}
      >
        {children}
      </div>
    )
  }

  if (isMobile) {
    return (
      <Sheet open={openMobile} onOpenChange={setOpenMobile} {...props}>
        <SheetContent
          ref={ref}
          id={props.id}
          dir={dir}
          data-sidebar="sidebar"
          data-slot="sidebar"
          data-mobile="true"
          className="skui:w-(--sidebar-width) skui:bg-sidebar skui:p-0 skui:text-sidebar-foreground skui:[&>button]:hidden"
          style={
            {
              "--sidebar-width": SIDEBAR_WIDTH_MOBILE,
            } as React.CSSProperties
          }
          side={side}
        >
          <SheetHeader className="skui:sr-only">
            <SheetTitle>Sidebar</SheetTitle>
            <SheetDescription>Displays the mobile sidebar.</SheetDescription>
          </SheetHeader>
          <div className="skui:flex skui:h-full skui:w-full skui:flex-col">{children}</div>
        </SheetContent>
      </Sheet>
    )
  }

  return (
    <div
      className="skui:group skui:peer skui:hidden skui:text-sidebar-foreground skui:md:block"
      data-state={state}
      data-collapsible={state === "collapsed" ? collapsible : ""}
      data-variant={variant}
      data-side={side}
      data-slot="sidebar"
    >
      {/* This is what handles the sidebar gap on desktop */}
      <div
        data-slot="sidebar-gap"
        className={cn(
          "skui:relative skui:w-(--sidebar-width) skui:bg-transparent skui:transition-[width] skui:duration-200 skui:ease-linear",
          "skui:group-data-[collapsible=offcanvas]:w-0",
          "skui:group-data-[side=right]:rotate-180",
          variant === "floating" || variant === "inset"
            ? "skui:group-data-[collapsible=icon]:w-[calc(var(--sidebar-width-icon)+(--spacing(4)))]"
            : "skui:group-data-[collapsible=icon]:w-(--sidebar-width-icon)"
        )}
      />
      <div
        ref={ref}
        data-slot="sidebar-container"
        data-side={side}
        className={cn(
          "skui:fixed skui:inset-y-0 skui:z-10 skui:hidden skui:h-svh skui:w-(--sidebar-width) skui:transition-[left,right,width] skui:duration-200 skui:ease-linear skui:data-[side=left]:left-0 skui:data-[side=left]:group-data-[collapsible=offcanvas]:left-[calc(var(--sidebar-width)*-1)] skui:data-[side=right]:right-0 skui:data-[side=right]:group-data-[collapsible=offcanvas]:right-[calc(var(--sidebar-width)*-1)] skui:md:flex",
          // Adjust the padding for floating and inset variants.
          variant === "floating" || variant === "inset"
            ? "skui:p-2 skui:group-data-[collapsible=icon]:w-[calc(var(--sidebar-width-icon)+(--spacing(4))+2px)]"
            : "skui:group-data-[collapsible=icon]:w-(--sidebar-width-icon) skui:group-data-[side=left]:border-r skui:group-data-[side=right]:border-l",
          className
        )}
        {...props}
      >
        <div
          data-sidebar="sidebar"
          data-slot="sidebar-inner"
          className="skui:flex skui:size-full skui:flex-col skui:bg-sidebar skui:group-data-[variant=floating]:rounded-lg skui:group-data-[variant=floating]:shadow-sm skui:group-data-[variant=floating]:ring-1 skui:group-data-[variant=floating]:ring-sidebar-border"
        >
          {children}
        </div>
      </div>
    </div>
  )
})

const SidebarTrigger = React.forwardRef<
  React.ElementRef<typeof Button>,
  React.PropsWithoutRef<React.ComponentProps<typeof Button>>
>(function SidebarTrigger({
  className,
  onClick,
  ...props
}, ref) {
  const { toggleSidebar } = useSidebar()

  return (
    <Button
      ref={ref}
      data-sidebar="trigger"
      data-slot="sidebar-trigger"
      variant="ghost"
      size="icon-sm"
      className={cn(className)}
      onClick={(event) => {
        onClick?.(event)
        toggleSidebar()
      }}
      {...props}
    >
      <PanelLeftIcon
        className=""
      />
      <span className="skui:sr-only">Toggle Sidebar</span>
    </Button>
  )

})

const SidebarRail = React.forwardRef<
  React.ElementRef<"button">,
  React.PropsWithoutRef<React.ComponentProps<"button">>
>(function SidebarRail({ className, ...props }, ref) {
  const { toggleSidebar } = useSidebar()

  return (
    <button
      ref={ref}
      data-sidebar="rail"
      data-slot="sidebar-rail"
      aria-label="Toggle Sidebar"
      tabIndex={-1}
      onClick={toggleSidebar}
      title="Toggle Sidebar"
      className={cn(
        "skui:absolute skui:inset-y-0 skui:z-20 skui:hidden skui:w-4 skui:transition-all skui:ease-linear skui:group-data-[side=left]:-right-4 skui:group-data-[side=right]:left-0 skui:after:absolute skui:after:inset-y-0 skui:after:start-1/2 skui:after:w-[2px] skui:hover:after:bg-sidebar-border skui:sm:flex skui:ltr:-translate-x-1/2 skui:rtl:-translate-x-1/2",
        "skui:in-data-[side=left]:cursor-w-resize skui:in-data-[side=right]:cursor-e-resize",
        "skui:[[data-side=left][data-state=collapsed]_&]:cursor-e-resize skui:[[data-side=right][data-state=collapsed]_&]:cursor-w-resize",
        "skui:group-data-[collapsible=offcanvas]:translate-x-0 skui:group-data-[collapsible=offcanvas]:after:left-full skui:hover:group-data-[collapsible=offcanvas]:bg-sidebar",
        "skui:[[data-side=left][data-collapsible=offcanvas]_&]:-right-2",
        "skui:[[data-side=right][data-collapsible=offcanvas]_&]:-left-2",
        className
      )}
      {...props}
    />
  )

})

const SidebarInset = React.forwardRef<
  React.ElementRef<"main">,
  React.PropsWithoutRef<React.ComponentProps<"main">>
>(function SidebarInset({ className, ...props }, ref) {
  return (
    <main
      ref={ref}
      data-slot="sidebar-inset"
      className={cn(
        "skui:relative skui:flex skui:w-full skui:flex-1 skui:flex-col skui:bg-background skui:md:peer-data-[variant=inset]:m-2 skui:md:peer-data-[variant=inset]:ml-0 skui:md:peer-data-[variant=inset]:rounded-xl skui:md:peer-data-[variant=inset]:shadow-sm skui:md:peer-data-[variant=inset]:peer-data-[state=collapsed]:ml-2",
        className
      )}
      {...props}
    />
  )

})

const SidebarInput = React.forwardRef<
  React.ElementRef<typeof Input>,
  React.PropsWithoutRef<React.ComponentProps<typeof Input>>
>(function SidebarInput({
  className,
  ...props
}, ref) {
  return (
    <Input
      ref={ref}
      data-slot="sidebar-input"
      data-sidebar="input"
      className={cn("skui:h-8 skui:w-full skui:bg-background skui:shadow-none", className)}
      {...props}
    />
  )

})

const SidebarHeader = React.forwardRef<
  React.ElementRef<"div">,
  React.PropsWithoutRef<React.ComponentProps<"div">>
>(function SidebarHeader({ className, ...props }, ref) {
  return (
    <div
      ref={ref}
      data-slot="sidebar-header"
      data-sidebar="header"
      className={cn("skui:flex skui:flex-col skui:gap-2 skui:p-2", className)}
      {...props}
    />
  )

})

const SidebarFooter = React.forwardRef<
  React.ElementRef<"div">,
  React.PropsWithoutRef<React.ComponentProps<"div">>
>(function SidebarFooter({ className, ...props }, ref) {
  return (
    <div
      ref={ref}
      data-slot="sidebar-footer"
      data-sidebar="footer"
      className={cn("skui:flex skui:flex-col skui:gap-2 skui:p-2", className)}
      {...props}
    />
  )

})

const SidebarSeparator = React.forwardRef<
  React.ElementRef<typeof Separator>,
  React.PropsWithoutRef<React.ComponentProps<typeof Separator>>
>(function SidebarSeparator({
  className,
  ...props
}, ref) {
  return (
    <Separator
      ref={ref}
      data-slot="sidebar-separator"
      data-sidebar="separator"
      className={cn("skui:mx-2 skui:w-auto skui:bg-sidebar-border", className)}
      {...props}
    />
  )

})

const SidebarContent = React.forwardRef<
  React.ElementRef<"div">,
  React.PropsWithoutRef<React.ComponentProps<"div">>
>(function SidebarContent({ className, ...props }, ref) {
  return (
    <div
      ref={ref}
      data-slot="sidebar-content"
      data-sidebar="content"
      className={cn(
        "skui:no-scrollbar skui:flex skui:min-h-0 skui:flex-1 skui:flex-col skui:gap-0 skui:overflow-auto skui:group-data-[collapsible=icon]:overflow-hidden",
        className
      )}
      {...props}
    />
  )

})

const SidebarGroup = React.forwardRef<
  React.ElementRef<"div">,
  React.PropsWithoutRef<React.ComponentProps<"div">>
>(function SidebarGroup({ className, ...props }, ref) {
  return (
    <div
      ref={ref}
      data-slot="sidebar-group"
      data-sidebar="group"
      className={cn("skui:relative skui:flex skui:w-full skui:min-w-0 skui:flex-col skui:p-2", className)}
      {...props}
    />
  )

})

const SidebarGroupLabel = React.forwardRef<
  React.ElementRef<"div">,
  React.PropsWithoutRef<useRender.ComponentProps<"div"> & React.ComponentProps<"div">>
>(function SidebarGroupLabel({
  className,
  render,
  ...props
}, ref) {
  return useRender({
    ref,
    defaultTagName: "div",
    props: mergeProps<"div">(
      {
        className: cn(
          "skui:flex skui:h-8 skui:shrink-0 skui:items-center skui:rounded-md skui:px-2 skui:text-xs skui:font-medium skui:text-sidebar-foreground/70 skui:ring-sidebar-ring skui:outline-hidden skui:transition-[margin,opacity] skui:duration-200 skui:ease-linear skui:group-data-[collapsible=icon]:-mt-8 skui:group-data-[collapsible=icon]:opacity-0 skui:focus-visible:ring-2 skui:[&>svg]:size-4 skui:[&>svg]:shrink-0",
          className
        ),
      },
      props
    ),
    render,
    state: {
      slot: "sidebar-group-label",
      sidebar: "group-label",
    },
  })

})

const SidebarGroupAction = React.forwardRef<
  React.ElementRef<"button">,
  React.PropsWithoutRef<useRender.ComponentProps<"button"> & React.ComponentProps<"button">>
>(function SidebarGroupAction({
  className,
  render,
  ...props
}, ref) {
  return useRender({
    ref,
    defaultTagName: "button",
    props: mergeProps<"button">(
      {
        className: cn(
          "skui:absolute skui:top-3.5 skui:right-3 skui:flex skui:aspect-square skui:w-5 skui:items-center skui:justify-center skui:rounded-md skui:p-0 skui:text-sidebar-foreground skui:ring-sidebar-ring skui:outline-hidden skui:transition-transform skui:group-data-[collapsible=icon]:hidden skui:after:absolute skui:after:-inset-2 skui:hover:bg-sidebar-accent skui:hover:text-sidebar-accent-foreground skui:focus-visible:ring-2 skui:md:after:hidden skui:[&>svg]:size-4 skui:[&>svg]:shrink-0",
          className
        ),
      },
      props
    ),
    render,
    state: {
      slot: "sidebar-group-action",
      sidebar: "group-action",
    },
  })

})

const SidebarGroupContent = React.forwardRef<
  React.ElementRef<"div">,
  React.PropsWithoutRef<React.ComponentProps<"div">>
>(function SidebarGroupContent({
  className,
  ...props
}, ref) {
  return (
    <div
      ref={ref}
      data-slot="sidebar-group-content"
      data-sidebar="group-content"
      className={cn("skui:w-full skui:text-sm", className)}
      {...props}
    />
  )

})

const SidebarMenu = React.forwardRef<
  React.ElementRef<"ul">,
  React.PropsWithoutRef<React.ComponentProps<"ul">>
>(function SidebarMenu({ className, ...props }, ref) {
  return (
    <ul
      ref={ref}
      data-slot="sidebar-menu"
      data-sidebar="menu"
      className={cn("skui:flex skui:w-full skui:min-w-0 skui:flex-col skui:gap-0", className)}
      {...props}
    />
  )

})

const SidebarMenuItem = React.forwardRef<
  React.ElementRef<"li">,
  React.PropsWithoutRef<React.ComponentProps<"li">>
>(function SidebarMenuItem({ className, ...props }, ref) {
  return (
    <li
      ref={ref}
      data-slot="sidebar-menu-item"
      data-sidebar="menu-item"
      className={cn("skui:group/menu-item skui:relative", className)}
      {...props}
    />
  )

})

const sidebarMenuButtonVariants = cva(
  "skui:peer/menu-button skui:group/menu-button skui:flex skui:w-full skui:items-center skui:gap-2 skui:overflow-hidden skui:rounded-md skui:p-2 skui:text-left skui:text-sm skui:ring-sidebar-ring skui:outline-hidden skui:transition-[width,height,padding] skui:group-has-data-[sidebar=menu-action]/menu-item:pr-8 skui:group-data-[collapsible=icon]:size-8! skui:group-data-[collapsible=icon]:p-2! skui:hover:bg-sidebar-accent skui:hover:text-sidebar-accent-foreground skui:focus-visible:ring-2 skui:active:bg-sidebar-accent skui:active:text-sidebar-accent-foreground skui:disabled:pointer-events-none skui:disabled:opacity-50 skui:aria-disabled:pointer-events-none skui:aria-disabled:opacity-50 skui:data-open:hover:bg-sidebar-accent skui:data-open:hover:text-sidebar-accent-foreground skui:data-active:bg-sidebar-accent skui:data-active:font-medium skui:data-active:text-sidebar-accent-foreground skui:[&_svg]:size-4 skui:[&_svg]:shrink-0 skui:[&>span:last-child]:truncate",
  {
    variants: {
      variant: {
        default: "skui:hover:bg-sidebar-accent skui:hover:text-sidebar-accent-foreground",
        outline:
          "skui:bg-background skui:shadow-[0_0_0_1px_var(--sidebar-border)] skui:hover:bg-sidebar-accent skui:hover:text-sidebar-accent-foreground skui:hover:shadow-[0_0_0_1px_var(--sidebar-accent)]",
      },
      size: {
        default: "skui:h-8 skui:text-sm",
        sm: "skui:h-7 skui:text-xs",
        lg: "skui:h-12 skui:text-sm skui:group-data-[collapsible=icon]:p-0!",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function SidebarMenuButton({
  render,
  isActive = false,
  variant = "default",
  size = "default",
  tooltip,
  className,
  id,
  ...props
}: useRender.ComponentProps<"button"> &
  React.ComponentProps<"button"> & {
    isActive?: boolean
    tooltip?: string | React.ComponentProps<typeof TooltipContent>
  } & VariantProps<typeof sidebarMenuButtonVariants>) {
  const { isMobile, state } = useSidebar()
  const { deriveElementId } = useSpfxUiHost()
  const comp = useRender({
    defaultTagName: "button",
    props: mergeProps<"button">(
      {
        id,
        className: cn(sidebarMenuButtonVariants({ variant, size }), className),
      },
      props
    ),
    render: !tooltip ? render : <TooltipTrigger render={render} />,
    state: {
      slot: "sidebar-menu-button",
      sidebar: "menu-button",
      size,
      active: isActive,
    },
  })

  if (!tooltip) {
    return comp
  }

  if (typeof tooltip === "string") {
    const tooltipId = deriveElementId(id ?? "", "tooltip")
    tooltip = {
      children: tooltip,
      id: tooltipId,
    }
  }

  return (
    <Tooltip>
      {comp}
      <TooltipContent
        side="right"
        align="center"
        hidden={state !== "collapsed" || isMobile}
        {...tooltip}
      />
    </Tooltip>
  )
}

const SidebarMenuAction = React.forwardRef<
  React.ElementRef<"button">,
  React.PropsWithoutRef<useRender.ComponentProps<"button"> &
  React.ComponentProps<"button"> & {
    showOnHover?: boolean
  }>
>(function SidebarMenuAction({
  className,
  render,
  showOnHover = false,
  ...props
}, ref) {
  return useRender({
    ref,
    defaultTagName: "button",
    props: mergeProps<"button">(
      {
        className: cn(
          "skui:absolute skui:top-1.5 skui:right-1 skui:flex skui:aspect-square skui:w-5 skui:items-center skui:justify-center skui:rounded-md skui:p-0 skui:text-sidebar-foreground skui:ring-sidebar-ring skui:outline-hidden skui:transition-transform skui:group-data-[collapsible=icon]:hidden skui:peer-hover/menu-button:text-sidebar-accent-foreground skui:peer-data-[size=default]/menu-button:top-1.5 skui:peer-data-[size=lg]/menu-button:top-2.5 skui:peer-data-[size=sm]/menu-button:top-1 skui:after:absolute skui:after:-inset-2 skui:hover:bg-sidebar-accent skui:hover:text-sidebar-accent-foreground skui:focus-visible:ring-2 skui:md:after:hidden skui:[&>svg]:size-4 skui:[&>svg]:shrink-0",
          showOnHover &&
            "skui:group-focus-within/menu-item:opacity-100 skui:group-hover/menu-item:opacity-100 skui:peer-data-active/menu-button:text-sidebar-accent-foreground skui:aria-expanded:opacity-100 skui:md:opacity-0",
          className
        ),
      },
      props
    ),
    render,
    state: {
      slot: "sidebar-menu-action",
      sidebar: "menu-action",
    },
  })

})

const SidebarMenuBadge = React.forwardRef<
  React.ElementRef<"div">,
  React.PropsWithoutRef<React.ComponentProps<"div">>
>(function SidebarMenuBadge({
  className,
  ...props
}, ref) {
  return (
    <div
      ref={ref}
      data-slot="sidebar-menu-badge"
      data-sidebar="menu-badge"
      className={cn(
        "skui:pointer-events-none skui:absolute skui:right-1 skui:flex skui:h-5 skui:min-w-5 skui:items-center skui:justify-center skui:rounded-md skui:px-1 skui:text-xs skui:font-medium skui:text-sidebar-foreground skui:tabular-nums skui:select-none skui:group-data-[collapsible=icon]:hidden skui:peer-hover/menu-button:text-sidebar-accent-foreground skui:peer-data-[size=default]/menu-button:top-1.5 skui:peer-data-[size=lg]/menu-button:top-2.5 skui:peer-data-[size=sm]/menu-button:top-1 skui:peer-data-active/menu-button:text-sidebar-accent-foreground",
        className
      )}
      {...props}
    />
  )

})

const SidebarMenuSkeleton = React.forwardRef<
  React.ElementRef<"div">,
  React.PropsWithoutRef<React.ComponentProps<"div"> & {
  showIcon?: boolean
}>
>(function SidebarMenuSkeleton({
  className,
  showIcon = false,
  ...props
}, ref) {
  // Random width between 50 to 90%.
  const [width] = React.useState(() => {
    return `${Math.floor(Math.random() * 40) + 50}%`
  })

  return (
    <div
      ref={ref}
      data-slot="sidebar-menu-skeleton"
      data-sidebar="menu-skeleton"
      className={cn("skui:flex skui:h-8 skui:items-center skui:gap-2 skui:rounded-md skui:px-2", className)}
      {...props}
    >
      {showIcon && (
        <Skeleton
          className="skui:size-4 skui:rounded-md"
          data-sidebar="menu-skeleton-icon"
        />
      )}
      <Skeleton
        className="skui:h-4 skui:max-w-(--skeleton-width) skui:flex-1"
        data-sidebar="menu-skeleton-text"
        style={
          {
            "--skeleton-width": width,
          } as React.CSSProperties
        }
      />
    </div>
  )

})

const SidebarMenuSub = React.forwardRef<
  React.ElementRef<"ul">,
  React.PropsWithoutRef<React.ComponentProps<"ul">>
>(function SidebarMenuSub({ className, ...props }, ref) {
  return (
    <ul
      ref={ref}
      data-slot="sidebar-menu-sub"
      data-sidebar="menu-sub"
      className={cn(
        "skui:mx-3.5 skui:flex skui:min-w-0 skui:translate-x-px skui:flex-col skui:gap-1 skui:border-l skui:border-sidebar-border skui:px-2.5 skui:py-0.5 skui:group-data-[collapsible=icon]:hidden",
        className
      )}
      {...props}
    />
  )

})

const SidebarMenuSubItem = React.forwardRef<
  React.ElementRef<"li">,
  React.PropsWithoutRef<React.ComponentProps<"li">>
>(function SidebarMenuSubItem({
  className,
  ...props
}, ref) {
  return (
    <li
      ref={ref}
      data-slot="sidebar-menu-sub-item"
      data-sidebar="menu-sub-item"
      className={cn("skui:group/menu-sub-item skui:relative", className)}
      {...props}
    />
  )

})

const SidebarMenuSubButton = React.forwardRef<
  React.ElementRef<"a">,
  React.PropsWithoutRef<useRender.ComponentProps<"a"> &
  React.ComponentProps<"a"> & {
    size?: "sm" | "md"
    isActive?: boolean
  }>
>(function SidebarMenuSubButton({
  render,
  size = "md",
  isActive = false,
  className,
  ...props
}, ref) {
  return useRender({
    ref,
    defaultTagName: "a",
    props: mergeProps<"a">(
      {
        className: cn(
          "skui:flex skui:h-7 skui:min-w-0 skui:-translate-x-px skui:items-center skui:gap-2 skui:overflow-hidden skui:rounded-md skui:px-2 skui:text-sidebar-foreground skui:ring-sidebar-ring skui:outline-hidden skui:group-data-[collapsible=icon]:hidden skui:hover:bg-sidebar-accent skui:hover:text-sidebar-accent-foreground skui:focus-visible:ring-2 skui:active:bg-sidebar-accent skui:active:text-sidebar-accent-foreground skui:disabled:pointer-events-none skui:disabled:opacity-50 skui:aria-disabled:pointer-events-none skui:aria-disabled:opacity-50 skui:data-[size=md]:text-sm skui:data-[size=sm]:text-xs skui:data-active:bg-sidebar-accent skui:data-active:text-sidebar-accent-foreground skui:[&>span:last-child]:truncate skui:[&>svg]:size-4 skui:[&>svg]:shrink-0 skui:[&>svg]:text-sidebar-accent-foreground",
          className
        ),
      },
      props
    ),
    render,
    state: {
      slot: "sidebar-menu-sub-button",
      sidebar: "menu-sub-button",
      size,
      active: isActive,
    },
  })

})

export {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupAction,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInput,
  SidebarInset,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSkeleton,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarProvider,
  SidebarRail,
  SidebarSeparator,
  SidebarTrigger,
  useSidebar,
}

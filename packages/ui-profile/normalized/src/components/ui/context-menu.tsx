"use client"

import { useSpfxUiOwnedPortalRender, useSpfxUiOwnedRender, useSpfxUiPortalHost, useSpfxUiPortalId } from "../../lib/ui-root"
import { CheckIcon, ChevronRightIcon } from "lucide-react"
import * as React from "react"
import { ContextMenu as ContextMenuPrimitive } from "@base-ui/react/context-menu"

import { cn } from "../../lib/utils"

function ContextMenu({ ...props }: ContextMenuPrimitive.Root.Props) {
  return <ContextMenuPrimitive.Root data-slot="context-menu" {...props} />
}

function ContextMenuPortal({ ...props }: ContextMenuPrimitive.Portal.Props) {
  return (
    <ContextMenuPrimitive.Portal data-slot="context-menu-portal" {...props} id={useSpfxUiPortalId(props.id)} container={useSpfxUiPortalHost()} render={useSpfxUiOwnedPortalRender(props.render, props.id, "ContextMenuPortal")} />
  )
}

const ContextMenuTrigger = React.forwardRef<
  HTMLDivElement,
  React.PropsWithoutRef<ContextMenuPrimitive.Trigger.Props>
>(function ContextMenuTrigger({
  className,
  ...props
}, ref) {
  return (
    <ContextMenuPrimitive.Trigger
      ref={ref}
      data-slot="context-menu-trigger"
      className={cn("skui:select-none", className)}
      {...props}
    />
  )

})

const ContextMenuContent = React.forwardRef<
  React.ElementRef<typeof ContextMenuPrimitive.Popup>,
  React.PropsWithoutRef<ContextMenuPrimitive.Popup.Props &
  Pick<
    ContextMenuPrimitive.Positioner.Props,
    "align" | "alignOffset" | "side" | "sideOffset"
  >>
>(function ContextMenuContent({
  className,
  align = "start",
  alignOffset = 4,
  side = "right",
  sideOffset = 0,
  ...props
}, ref) {
  return (
    <ContextMenuPrimitive.Portal id={useSpfxUiPortalId(props.id)} container={useSpfxUiPortalHost()}>
      <ContextMenuPrimitive.Positioner
        className="skui:isolate skui:z-50 skui:outline-none"
        align={align}
        alignOffset={alignOffset}
        side={side}
        sideOffset={sideOffset}
      >
        <ContextMenuPrimitive.Popup
          ref={ref}
          data-slot="context-menu-content"
          className={cn(
            "skui:z-50 skui:max-h-(--available-height) skui:min-w-36 skui:origin-(--transform-origin) skui:overflow-x-hidden skui:overflow-y-auto skui:rounded-lg skui:bg-popover skui:p-1 skui:text-popover-foreground skui:shadow-md skui:ring-1 skui:ring-foreground/10 skui:duration-100 skui:outline-none skui:data-[side=bottom]:slide-in-from-top-2 skui:data-[side=inline-end]:slide-in-from-left-2 skui:data-[side=inline-start]:slide-in-from-right-2 skui:data-[side=left]:slide-in-from-right-2 skui:data-[side=right]:slide-in-from-left-2 skui:data-[side=top]:slide-in-from-bottom-2 skui:data-open:animate-in skui:data-open:fade-in-0 skui:data-open:zoom-in-95 skui:data-closed:animate-out skui:data-closed:fade-out-0 skui:data-closed:zoom-out-95",
            className
          )}
          {...props} id={props.id} render={useSpfxUiOwnedRender(props.render, props.id, "ContextMenuContent")}
        />
      </ContextMenuPrimitive.Positioner>
    </ContextMenuPrimitive.Portal>
  )

})

const ContextMenuGroup = React.forwardRef<
  React.ElementRef<typeof ContextMenuPrimitive.Group>,
  React.PropsWithoutRef<ContextMenuPrimitive.Group.Props>
>(function ContextMenuGroup({ ...props }, ref) {
  return (
    <ContextMenuPrimitive.Group
      ref={ref} data-slot="context-menu-group" {...props} />
  )

})

const ContextMenuLabel = React.forwardRef<
  React.ElementRef<typeof ContextMenuPrimitive.GroupLabel>,
  React.PropsWithoutRef<ContextMenuPrimitive.GroupLabel.Props & {
  inset?: boolean
}>
>(function ContextMenuLabel({
  className,
  inset,
  ...props
}, ref) {
  return (
    <ContextMenuPrimitive.GroupLabel
      ref={ref}
      data-slot="context-menu-label"
      data-inset={inset}
      className={cn(
        "skui:px-1.5 skui:py-1 skui:text-xs skui:font-medium skui:text-muted-foreground skui:data-inset:pl-7",
        className
      )}
      {...props}
    />
  )

})

const ContextMenuItem = React.forwardRef<
  React.ElementRef<typeof ContextMenuPrimitive.Item>,
  React.PropsWithoutRef<ContextMenuPrimitive.Item.Props & {
  inset?: boolean
  variant?: "default" | "destructive"
}>
>(function ContextMenuItem({
  className,
  inset,
  variant = "default",
  ...props
}, ref) {
  return (
    <ContextMenuPrimitive.Item
      ref={ref}
      data-slot="context-menu-item"
      data-inset={inset}
      data-variant={variant}
      className={cn(
        "skui:group/context-menu-item skui:relative skui:flex skui:cursor-default skui:items-center skui:gap-1.5 skui:rounded-md skui:px-1.5 skui:py-1 skui:text-sm skui:outline-hidden skui:select-none skui:focus:bg-accent skui:focus:text-accent-foreground skui:data-inset:pl-7 skui:data-[variant=destructive]:text-destructive skui:data-[variant=destructive]:focus:bg-destructive/10 skui:data-[variant=destructive]:focus:text-destructive skui:dark:data-[variant=destructive]:focus:bg-destructive/20 skui:data-disabled:pointer-events-none skui:data-disabled:opacity-50 skui:[&_svg]:pointer-events-none skui:[&_svg]:shrink-0 skui:[&_svg:not([class*='size-'])]:size-4 skui:focus:*:[svg]:text-accent-foreground skui:data-[variant=destructive]:*:[svg]:text-destructive",
        className
      )}
      {...props}
    />
  )

})

function ContextMenuSub({ ...props }: ContextMenuPrimitive.SubmenuRoot.Props) {
  return (
    <ContextMenuPrimitive.SubmenuRoot data-slot="context-menu-sub" {...props} />
  )
}

const ContextMenuSubTrigger = React.forwardRef<
  React.ElementRef<typeof ContextMenuPrimitive.SubmenuTrigger>,
  React.PropsWithoutRef<ContextMenuPrimitive.SubmenuTrigger.Props & {
  inset?: boolean
}>
>(function ContextMenuSubTrigger({
  className,
  inset,
  children,
  ...props
}, ref) {
  return (
    <ContextMenuPrimitive.SubmenuTrigger
      ref={ref}
      data-slot="context-menu-sub-trigger"
      data-inset={inset}
      className={cn(
        "skui:flex skui:cursor-default skui:items-center skui:gap-1.5 skui:rounded-md skui:px-1.5 skui:py-1 skui:text-sm skui:outline-hidden skui:select-none skui:focus:bg-accent skui:focus:text-accent-foreground skui:data-inset:pl-7 skui:data-open:bg-accent skui:data-open:text-accent-foreground skui:[&_svg]:pointer-events-none skui:[&_svg]:shrink-0 skui:[&_svg:not([class*='size-'])]:size-4",
        className
      )}
      {...props}
    >
      {children}
      <ChevronRightIcon
        className="skui:ml-auto"
      />
    </ContextMenuPrimitive.SubmenuTrigger>
  )

})

const ContextMenuSubContent = React.forwardRef<
  React.ElementRef<typeof ContextMenuContent>,
  React.PropsWithoutRef<React.ComponentProps<typeof ContextMenuContent>>
>(function ContextMenuSubContent({
  ...props
}, ref) {
  return (
    <ContextMenuContent
      ref={ref}
      data-slot="context-menu-sub-content"
      className="skui:shadow-lg"
      side="right"
      {...props}
    />
  )

})

const ContextMenuCheckboxItem = React.forwardRef<
  React.ElementRef<typeof ContextMenuPrimitive.CheckboxItem>,
  React.PropsWithoutRef<ContextMenuPrimitive.CheckboxItem.Props & {
  inset?: boolean
}>
>(function ContextMenuCheckboxItem({
  className,
  children,
  checked,
  inset,
  ...props
}, ref) {
  return (
    <ContextMenuPrimitive.CheckboxItem
      ref={ref}
      data-slot="context-menu-checkbox-item"
      data-inset={inset}
      className={cn(
        "skui:relative skui:flex skui:cursor-default skui:items-center skui:gap-1.5 skui:rounded-md skui:py-1 skui:pr-8 skui:pl-1.5 skui:text-sm skui:outline-hidden skui:select-none skui:focus:bg-accent skui:focus:text-accent-foreground skui:data-inset:pl-7 skui:data-disabled:pointer-events-none skui:data-disabled:opacity-50 skui:[&_svg]:pointer-events-none skui:[&_svg]:shrink-0 skui:[&_svg:not([class*='size-'])]:size-4",
        className
      )}
      checked={checked}
      {...props}
    >
      <span className="skui:pointer-events-none skui:absolute skui:right-2">
        <ContextMenuPrimitive.CheckboxItemIndicator>
          <CheckIcon />
        </ContextMenuPrimitive.CheckboxItemIndicator>
      </span>
      {children}
    </ContextMenuPrimitive.CheckboxItem>
  )

})

const ContextMenuRadioGroup = React.forwardRef<
  React.ElementRef<typeof ContextMenuPrimitive.RadioGroup>,
  React.PropsWithoutRef<ContextMenuPrimitive.RadioGroup.Props>
>(function ContextMenuRadioGroup({
  ...props
}, ref) {
  return (
    <ContextMenuPrimitive.RadioGroup
      ref={ref}
      data-slot="context-menu-radio-group"
      {...props}
    />
  )

})

const ContextMenuRadioItem = React.forwardRef<
  React.ElementRef<typeof ContextMenuPrimitive.RadioItem>,
  React.PropsWithoutRef<ContextMenuPrimitive.RadioItem.Props & {
  inset?: boolean
}>
>(function ContextMenuRadioItem({
  className,
  children,
  inset,
  ...props
}, ref) {
  return (
    <ContextMenuPrimitive.RadioItem
      ref={ref}
      data-slot="context-menu-radio-item"
      data-inset={inset}
      className={cn(
        "skui:relative skui:flex skui:cursor-default skui:items-center skui:gap-1.5 skui:rounded-md skui:py-1 skui:pr-8 skui:pl-1.5 skui:text-sm skui:outline-hidden skui:select-none skui:focus:bg-accent skui:focus:text-accent-foreground skui:data-inset:pl-7 skui:data-disabled:pointer-events-none skui:data-disabled:opacity-50 skui:[&_svg]:pointer-events-none skui:[&_svg]:shrink-0 skui:[&_svg:not([class*='size-'])]:size-4",
        className
      )}
      {...props}
    >
      <span className="skui:pointer-events-none skui:absolute skui:right-2">
        <ContextMenuPrimitive.RadioItemIndicator>
          <CheckIcon />
        </ContextMenuPrimitive.RadioItemIndicator>
      </span>
      {children}
    </ContextMenuPrimitive.RadioItem>
  )

})

const ContextMenuSeparator = React.forwardRef<
  React.ElementRef<typeof ContextMenuPrimitive.Separator>,
  React.PropsWithoutRef<ContextMenuPrimitive.Separator.Props>
>(function ContextMenuSeparator({
  className,
  ...props
}, ref) {
  return (
    <ContextMenuPrimitive.Separator
      ref={ref}
      data-slot="context-menu-separator"
      className={cn("skui:-mx-1 skui:my-1 skui:h-px skui:bg-border", className)}
      {...props}
    />
  )

})

const ContextMenuShortcut = React.forwardRef<
  React.ElementRef<"span">,
  React.PropsWithoutRef<React.ComponentProps<"span">>
>(function ContextMenuShortcut({
  className,
  ...props
}, ref) {
  return (
    <span
      ref={ref}
      data-slot="context-menu-shortcut"
      className={cn(
        "skui:ml-auto skui:text-xs skui:tracking-widest skui:text-muted-foreground skui:group-focus/context-menu-item:text-accent-foreground",
        className
      )}
      {...props}
    />
  )

})

export {
  ContextMenu,
  ContextMenuTrigger,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuCheckboxItem,
  ContextMenuRadioItem,
  ContextMenuLabel,
  ContextMenuSeparator,
  ContextMenuShortcut,
  ContextMenuGroup,
  ContextMenuPortal,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuRadioGroup,
}

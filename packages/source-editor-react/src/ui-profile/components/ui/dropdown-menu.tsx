"use client"

import { useSpfxUiOwnedPortalRender, useSpfxUiOwnedRender, useSpfxUiPortalHost, useSpfxUiPortalId } from "../../lib/ui-root"
import { CheckIcon, ChevronRightIcon } from "lucide-react"
import * as React from "react"
import { Menu as MenuPrimitive } from "@base-ui/react/menu"

import { cn } from "../../lib/utils"

function DropdownMenu({ ...props }: MenuPrimitive.Root.Props) {
  return <MenuPrimitive.Root data-slot="dropdown-menu" {...props} />
}

function DropdownMenuPortal({ ...props }: MenuPrimitive.Portal.Props) {
  return <MenuPrimitive.Portal data-slot="dropdown-menu-portal" {...props} id={useSpfxUiPortalId(props.id)} container={useSpfxUiPortalHost()} render={useSpfxUiOwnedPortalRender(props.render, props.id, "DropdownMenuPortal")} />
}

const DropdownMenuTrigger = React.forwardRef<
  HTMLButtonElement,
  React.PropsWithoutRef<MenuPrimitive.Trigger.Props>
>(function DropdownMenuTrigger({ ...props }, ref) {
  return <MenuPrimitive.Trigger
    ref={ref} data-slot="dropdown-menu-trigger" {...props} />

})

const DropdownMenuContent = React.forwardRef<
  React.ElementRef<typeof MenuPrimitive.Popup>,
  React.PropsWithoutRef<MenuPrimitive.Popup.Props &
  Pick<
    MenuPrimitive.Positioner.Props,
    "align" | "alignOffset" | "side" | "sideOffset"
  >>
>(function DropdownMenuContent({
  align = "start",
  alignOffset = 0,
  side = "bottom",
  sideOffset = 4,
  className,
  ...props
}, ref) {
  return (
    <MenuPrimitive.Portal id={useSpfxUiPortalId(props.id)} container={useSpfxUiPortalHost()}>
      <MenuPrimitive.Positioner
        className="skui:isolate skui:z-50 skui:outline-none"
        align={align}
        alignOffset={alignOffset}
        side={side}
        sideOffset={sideOffset}
      >
        <MenuPrimitive.Popup
          ref={ref}
          data-slot="dropdown-menu-content"
          className={cn(
            "skui:z-50 skui:max-h-(--available-height) skui:w-(--anchor-width) skui:min-w-32 skui:origin-(--transform-origin) skui:overflow-x-hidden skui:overflow-y-auto skui:rounded-lg skui:bg-popover skui:p-1 skui:text-popover-foreground skui:shadow-md skui:ring-1 skui:ring-foreground/10 skui:duration-100 skui:outline-none skui:data-[side=bottom]:slide-in-from-top-2 skui:data-[side=inline-end]:slide-in-from-left-2 skui:data-[side=inline-start]:slide-in-from-right-2 skui:data-[side=left]:slide-in-from-right-2 skui:data-[side=right]:slide-in-from-left-2 skui:data-[side=top]:slide-in-from-bottom-2 skui:data-open:animate-in skui:data-open:fade-in-0 skui:data-open:zoom-in-95 skui:data-closed:animate-out skui:data-closed:overflow-hidden skui:data-closed:fade-out-0 skui:data-closed:zoom-out-95",
            className
          )}
          {...props} id={props.id} render={useSpfxUiOwnedRender(props.render, props.id, "DropdownMenuContent")}
        />
      </MenuPrimitive.Positioner>
    </MenuPrimitive.Portal>
  )

})

const DropdownMenuGroup = React.forwardRef<
  React.ElementRef<typeof MenuPrimitive.Group>,
  React.PropsWithoutRef<MenuPrimitive.Group.Props>
>(function DropdownMenuGroup({ ...props }, ref) {
  return <MenuPrimitive.Group
    ref={ref} data-slot="dropdown-menu-group" {...props} />

})

const DropdownMenuLabel = React.forwardRef<
  React.ElementRef<typeof MenuPrimitive.GroupLabel>,
  React.PropsWithoutRef<MenuPrimitive.GroupLabel.Props & {
  inset?: boolean
}>
>(function DropdownMenuLabel({
  className,
  inset,
  ...props
}, ref) {
  return (
    <MenuPrimitive.GroupLabel
      ref={ref}
      data-slot="dropdown-menu-label"
      data-inset={inset}
      className={cn(
        "skui:px-1.5 skui:py-1 skui:text-xs skui:font-medium skui:text-muted-foreground skui:data-inset:pl-7",
        className
      )}
      {...props}
    />
  )

})

const DropdownMenuItem = React.forwardRef<
  React.ElementRef<typeof MenuPrimitive.Item>,
  React.PropsWithoutRef<MenuPrimitive.Item.Props & {
  inset?: boolean
  variant?: "default" | "destructive"
}>
>(function DropdownMenuItem({
  className,
  inset,
  variant = "default",
  ...props
}, ref) {
  return (
    <MenuPrimitive.Item
      ref={ref}
      data-slot="dropdown-menu-item"
      data-inset={inset}
      data-variant={variant}
      className={cn(
        "skui:group/dropdown-menu-item skui:relative skui:flex skui:cursor-default skui:items-center skui:gap-1.5 skui:rounded-md skui:px-1.5 skui:py-1 skui:text-sm skui:outline-hidden skui:select-none skui:focus:bg-accent skui:focus:text-accent-foreground skui:not-data-[variant=destructive]:focus:**:text-accent-foreground skui:data-inset:pl-7 skui:data-[variant=destructive]:text-destructive skui:data-[variant=destructive]:focus:bg-destructive/10 skui:data-[variant=destructive]:focus:text-destructive skui:dark:data-[variant=destructive]:focus:bg-destructive/20 skui:data-disabled:pointer-events-none skui:data-disabled:opacity-50 skui:[&_svg]:pointer-events-none skui:[&_svg]:shrink-0 skui:[&_svg:not([class*='size-'])]:size-4 skui:data-[variant=destructive]:*:[svg]:text-destructive",
        className
      )}
      {...props}
    />
  )

})

function DropdownMenuSub({ ...props }: MenuPrimitive.SubmenuRoot.Props) {
  return <MenuPrimitive.SubmenuRoot data-slot="dropdown-menu-sub" {...props} />
}

const DropdownMenuSubTrigger = React.forwardRef<
  React.ElementRef<typeof MenuPrimitive.SubmenuTrigger>,
  React.PropsWithoutRef<MenuPrimitive.SubmenuTrigger.Props & {
  inset?: boolean
}>
>(function DropdownMenuSubTrigger({
  className,
  inset,
  children,
  ...props
}, ref) {
  return (
    <MenuPrimitive.SubmenuTrigger
      ref={ref}
      data-slot="dropdown-menu-sub-trigger"
      data-inset={inset}
      className={cn(
        "skui:flex skui:cursor-default skui:items-center skui:gap-1.5 skui:rounded-md skui:px-1.5 skui:py-1 skui:text-sm skui:outline-hidden skui:select-none skui:focus:bg-accent skui:focus:text-accent-foreground skui:not-data-[variant=destructive]:focus:**:text-accent-foreground skui:data-inset:pl-7 skui:data-popup-open:bg-accent skui:data-popup-open:text-accent-foreground skui:data-open:bg-accent skui:data-open:text-accent-foreground skui:[&_svg]:pointer-events-none skui:[&_svg]:shrink-0 skui:[&_svg:not([class*='size-'])]:size-4",
        className
      )}
      {...props}
    >
      {children}
      <ChevronRightIcon
        className="skui:ml-auto"
      />
    </MenuPrimitive.SubmenuTrigger>
  )

})

const DropdownMenuSubContent = React.forwardRef<
  React.ElementRef<typeof DropdownMenuContent>,
  React.PropsWithoutRef<React.ComponentProps<typeof DropdownMenuContent>>
>(function DropdownMenuSubContent({
  align = "start",
  alignOffset = -3,
  side = "right",
  sideOffset = 0,
  className,
  ...props
}, ref) {
  return (
    <DropdownMenuContent
      ref={ref}
      data-slot="dropdown-menu-sub-content"
      className={cn(
        "skui:w-auto skui:min-w-[96px] skui:rounded-lg skui:bg-popover skui:p-1 skui:text-popover-foreground skui:shadow-lg skui:ring-1 skui:ring-foreground/10 skui:duration-100 skui:data-[side=bottom]:slide-in-from-top-2 skui:data-[side=left]:slide-in-from-right-2 skui:data-[side=right]:slide-in-from-left-2 skui:data-[side=top]:slide-in-from-bottom-2 skui:data-open:animate-in skui:data-open:fade-in-0 skui:data-open:zoom-in-95 skui:data-closed:animate-out skui:data-closed:fade-out-0 skui:data-closed:zoom-out-95",
        className
      )}
      align={align}
      alignOffset={alignOffset}
      side={side}
      sideOffset={sideOffset}
      {...props}
    />
  )

})

const DropdownMenuCheckboxItem = React.forwardRef<
  React.ElementRef<typeof MenuPrimitive.CheckboxItem>,
  React.PropsWithoutRef<MenuPrimitive.CheckboxItem.Props & {
  inset?: boolean
}>
>(function DropdownMenuCheckboxItem({
  className,
  children,
  checked,
  inset,
  ...props
}, ref) {
  return (
    <MenuPrimitive.CheckboxItem
      ref={ref}
      data-slot="dropdown-menu-checkbox-item"
      data-inset={inset}
      className={cn(
        "skui:relative skui:flex skui:cursor-default skui:items-center skui:gap-1.5 skui:rounded-md skui:py-1 skui:pr-8 skui:pl-1.5 skui:text-sm skui:outline-hidden skui:select-none skui:focus:bg-accent skui:focus:text-accent-foreground skui:focus:**:text-accent-foreground skui:data-inset:pl-7 skui:data-disabled:pointer-events-none skui:data-disabled:opacity-50 skui:[&_svg]:pointer-events-none skui:[&_svg]:shrink-0 skui:[&_svg:not([class*='size-'])]:size-4",
        className
      )}
      checked={checked}
      {...props}
    >
      <span
        className="skui:pointer-events-none skui:absolute skui:right-2 skui:flex skui:items-center skui:justify-center"
        data-slot="dropdown-menu-checkbox-item-indicator"
      >
        <MenuPrimitive.CheckboxItemIndicator>
          <CheckIcon />
        </MenuPrimitive.CheckboxItemIndicator>
      </span>
      {children}
    </MenuPrimitive.CheckboxItem>
  )

})

const DropdownMenuRadioGroup = React.forwardRef<
  React.ElementRef<typeof MenuPrimitive.RadioGroup>,
  React.PropsWithoutRef<MenuPrimitive.RadioGroup.Props>
>(function DropdownMenuRadioGroup({ ...props }, ref) {
  return (
    <MenuPrimitive.RadioGroup
      ref={ref}
      data-slot="dropdown-menu-radio-group"
      {...props}
    />
  )

})

const DropdownMenuRadioItem = React.forwardRef<
  React.ElementRef<typeof MenuPrimitive.RadioItem>,
  React.PropsWithoutRef<MenuPrimitive.RadioItem.Props & {
  inset?: boolean
}>
>(function DropdownMenuRadioItem({
  className,
  children,
  inset,
  ...props
}, ref) {
  return (
    <MenuPrimitive.RadioItem
      ref={ref}
      data-slot="dropdown-menu-radio-item"
      data-inset={inset}
      className={cn(
        "skui:relative skui:flex skui:cursor-default skui:items-center skui:gap-1.5 skui:rounded-md skui:py-1 skui:pr-8 skui:pl-1.5 skui:text-sm skui:outline-hidden skui:select-none skui:focus:bg-accent skui:focus:text-accent-foreground skui:focus:**:text-accent-foreground skui:data-inset:pl-7 skui:data-disabled:pointer-events-none skui:data-disabled:opacity-50 skui:[&_svg]:pointer-events-none skui:[&_svg]:shrink-0 skui:[&_svg:not([class*='size-'])]:size-4",
        className
      )}
      {...props}
    >
      <span
        className="skui:pointer-events-none skui:absolute skui:right-2 skui:flex skui:items-center skui:justify-center"
        data-slot="dropdown-menu-radio-item-indicator"
      >
        <MenuPrimitive.RadioItemIndicator>
          <CheckIcon />
        </MenuPrimitive.RadioItemIndicator>
      </span>
      {children}
    </MenuPrimitive.RadioItem>
  )

})

const DropdownMenuSeparator = React.forwardRef<
  React.ElementRef<typeof MenuPrimitive.Separator>,
  React.PropsWithoutRef<MenuPrimitive.Separator.Props>
>(function DropdownMenuSeparator({
  className,
  ...props
}, ref) {
  return (
    <MenuPrimitive.Separator
      ref={ref}
      data-slot="dropdown-menu-separator"
      className={cn("skui:-mx-1 skui:my-1 skui:h-px skui:bg-border", className)}
      {...props}
    />
  )

})

const DropdownMenuShortcut = React.forwardRef<
  React.ElementRef<"span">,
  React.PropsWithoutRef<React.ComponentProps<"span">>
>(function DropdownMenuShortcut({
  className,
  ...props
}, ref) {
  return (
    <span
      ref={ref}
      data-slot="dropdown-menu-shortcut"
      className={cn(
        "skui:ml-auto skui:text-xs skui:tracking-widest skui:text-muted-foreground skui:group-focus/dropdown-menu-item:text-accent-foreground",
        className
      )}
      {...props}
    />
  )

})

export {
  DropdownMenu,
  DropdownMenuPortal,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuItem,
  DropdownMenuCheckboxItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
}

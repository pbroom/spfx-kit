"use client"

import { CheckIcon } from "lucide-react"
import * as React from "react"
import { Menu as MenuPrimitive } from "@base-ui/react/menu"
import { Menubar as MenubarPrimitive } from "@base-ui/react/menubar"

import { cn } from "../../lib/utils"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuPortal,
  DropdownMenuRadioGroup,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "./dropdown-menu"

const Menubar = React.forwardRef<
  React.ElementRef<typeof MenubarPrimitive>,
  React.PropsWithoutRef<MenubarPrimitive.Props>
>(function Menubar({ className, ...props }, ref) {
  return (
    <MenubarPrimitive
      ref={ref}
      data-slot="menubar"
      className={cn(
        "skui:flex skui:h-8 skui:items-center skui:gap-0.5 skui:rounded-lg skui:border skui:p-[3px]",
        className
      )}
      {...props}
    />
  )

})

function MenubarMenu({ ...props }: React.ComponentProps<typeof DropdownMenu>) {
  return <DropdownMenu data-slot="menubar-menu" {...props} />
}

const MenubarGroup = React.forwardRef<
  React.ElementRef<typeof DropdownMenuGroup>,
  React.PropsWithoutRef<React.ComponentProps<typeof DropdownMenuGroup>>
>(function MenubarGroup({
  ...props
}, ref) {
  return <DropdownMenuGroup
    ref={ref} data-slot="menubar-group" {...props} />

})

const MenubarPortal = React.forwardRef<
  React.ElementRef<typeof DropdownMenuPortal>,
  React.PropsWithoutRef<React.ComponentProps<typeof DropdownMenuPortal>>
>(function MenubarPortal({
  ...props
}, ref) {
  return <DropdownMenuPortal
    ref={ref} data-slot="menubar-portal" {...props} />

})

const MenubarTrigger = React.forwardRef<
  React.ElementRef<typeof DropdownMenuTrigger>,
  React.PropsWithoutRef<React.ComponentProps<typeof DropdownMenuTrigger>>
>(function MenubarTrigger({
  className,
  ...props
}, ref) {
  return (
    <DropdownMenuTrigger
      ref={ref}
      data-slot="menubar-trigger"
      className={cn(
        "skui:flex skui:items-center skui:rounded-sm skui:px-1.5 skui:py-[2px] skui:text-sm skui:font-medium skui:outline-hidden skui:select-none skui:hover:bg-muted skui:aria-expanded:bg-muted",
        className
      )}
      {...props}
    />
  )

})

const MenubarContent = React.forwardRef<
  React.ElementRef<typeof DropdownMenuContent>,
  React.PropsWithoutRef<React.ComponentProps<typeof DropdownMenuContent>>
>(function MenubarContent({
  className,
  align = "start",
  alignOffset = -4,
  sideOffset = 8,
  ...props
}, ref) {
  return (
    <DropdownMenuContent
      ref={ref}
      data-slot="menubar-content"
      align={align}
      alignOffset={alignOffset}
      sideOffset={sideOffset}
      className={cn(
        "skui:min-w-36 skui:rounded-lg skui:bg-popover skui:p-1 skui:text-popover-foreground skui:shadow-md skui:ring-1 skui:ring-foreground/10 skui:duration-100 skui:data-[side=bottom]:slide-in-from-top-2 skui:data-[side=inline-end]:slide-in-from-left-2 skui:data-[side=inline-start]:slide-in-from-right-2 skui:data-[side=left]:slide-in-from-right-2 skui:data-[side=right]:slide-in-from-left-2 skui:data-[side=top]:slide-in-from-bottom-2 skui:data-open:animate-in skui:data-open:fade-in-0 skui:data-open:zoom-in-95",
        className
      )}
      {...props}
    />
  )

})

const MenubarItem = React.forwardRef<
  React.ElementRef<typeof DropdownMenuItem>,
  React.PropsWithoutRef<React.ComponentProps<typeof DropdownMenuItem>>
>(function MenubarItem({
  className,
  inset,
  variant = "default",
  ...props
}, ref) {
  return (
    <DropdownMenuItem
      ref={ref}
      data-slot="menubar-item"
      data-inset={inset}
      data-variant={variant}
      className={cn(
        "skui:group/menubar-item skui:gap-1.5 skui:rounded-md skui:px-1.5 skui:py-1 skui:text-sm skui:focus:bg-accent skui:focus:text-accent-foreground skui:not-data-[variant=destructive]:focus:**:text-accent-foreground skui:data-inset:pl-7 skui:data-[variant=destructive]:text-destructive skui:data-[variant=destructive]:focus:bg-destructive/10 skui:data-[variant=destructive]:focus:text-destructive skui:dark:data-[variant=destructive]:focus:bg-destructive/20 skui:data-disabled:opacity-50 skui:[&_svg:not([class*='size-'])]:size-4 skui:data-[variant=destructive]:*:[svg]:text-destructive!",
        className
      )}
      {...props}
    />
  )

})

const MenubarCheckboxItem = React.forwardRef<
  React.ElementRef<typeof MenuPrimitive.CheckboxItem>,
  React.PropsWithoutRef<MenuPrimitive.CheckboxItem.Props & {
  inset?: boolean
}>
>(function MenubarCheckboxItem({
  className,
  children,
  checked,
  inset,
  ...props
}, ref) {
  return (
    <MenuPrimitive.CheckboxItem
      ref={ref}
      data-slot="menubar-checkbox-item"
      data-inset={inset}
      className={cn(
        "skui:relative skui:flex skui:cursor-default skui:items-center skui:gap-1.5 skui:rounded-md skui:py-1 skui:pr-1.5 skui:pl-7 skui:text-sm skui:outline-hidden skui:select-none skui:focus:bg-accent skui:focus:text-accent-foreground skui:focus:**:text-accent-foreground skui:data-inset:pl-7 skui:data-disabled:pointer-events-none skui:data-disabled:opacity-50 skui:[&_svg]:pointer-events-none skui:[&_svg]:shrink-0",
        className
      )}
      checked={checked}
      {...props}
    >
      <span className="skui:pointer-events-none skui:absolute skui:left-1.5 skui:flex skui:size-4 skui:items-center skui:justify-center skui:[&_svg:not([class*='size-'])]:size-4">
        <MenuPrimitive.CheckboxItemIndicator>
          <CheckIcon />
        </MenuPrimitive.CheckboxItemIndicator>
      </span>
      {children}
    </MenuPrimitive.CheckboxItem>
  )

})

const MenubarRadioGroup = React.forwardRef<
  React.ElementRef<typeof DropdownMenuRadioGroup>,
  React.PropsWithoutRef<React.ComponentProps<typeof DropdownMenuRadioGroup>>
>(function MenubarRadioGroup({
  ...props
}, ref) {
  return <DropdownMenuRadioGroup
    ref={ref} data-slot="menubar-radio-group" {...props} />

})

const MenubarRadioItem = React.forwardRef<
  React.ElementRef<typeof MenuPrimitive.RadioItem>,
  React.PropsWithoutRef<MenuPrimitive.RadioItem.Props & {
  inset?: boolean
}>
>(function MenubarRadioItem({
  className,
  children,
  inset,
  ...props
}, ref) {
  return (
    <MenuPrimitive.RadioItem
      ref={ref}
      data-slot="menubar-radio-item"
      data-inset={inset}
      className={cn(
        "skui:relative skui:flex skui:cursor-default skui:items-center skui:gap-1.5 skui:rounded-md skui:py-1 skui:pr-1.5 skui:pl-7 skui:text-sm skui:outline-hidden skui:select-none skui:focus:bg-accent skui:focus:text-accent-foreground skui:focus:**:text-accent-foreground skui:data-inset:pl-7 skui:data-disabled:pointer-events-none skui:data-disabled:opacity-50 skui:[&_svg]:pointer-events-none skui:[&_svg]:shrink-0 skui:[&_svg:not([class*='size-'])]:size-4",
        className
      )}
      {...props}
    >
      <span className="skui:pointer-events-none skui:absolute skui:left-1.5 skui:flex skui:size-4 skui:items-center skui:justify-center skui:[&_svg:not([class*='size-'])]:size-4">
        <MenuPrimitive.RadioItemIndicator>
          <CheckIcon />
        </MenuPrimitive.RadioItemIndicator>
      </span>
      {children}
    </MenuPrimitive.RadioItem>
  )

})

const MenubarLabel = React.forwardRef<
  React.ElementRef<typeof DropdownMenuLabel>,
  React.PropsWithoutRef<React.ComponentProps<typeof DropdownMenuLabel> & {
  inset?: boolean
}>
>(function MenubarLabel({
  className,
  inset,
  ...props
}, ref) {
  return (
    <DropdownMenuLabel
      ref={ref}
      data-slot="menubar-label"
      data-inset={inset}
      className={cn(
        "skui:px-1.5 skui:py-1 skui:text-sm skui:font-medium skui:data-inset:pl-7",
        className
      )}
      {...props}
    />
  )

})

const MenubarSeparator = React.forwardRef<
  React.ElementRef<typeof DropdownMenuSeparator>,
  React.PropsWithoutRef<React.ComponentProps<typeof DropdownMenuSeparator>>
>(function MenubarSeparator({
  className,
  ...props
}, ref) {
  return (
    <DropdownMenuSeparator
      ref={ref}
      data-slot="menubar-separator"
      className={cn("skui:-mx-1 skui:my-1 skui:h-px skui:bg-border", className)}
      {...props}
    />
  )

})

const MenubarShortcut = React.forwardRef<
  React.ElementRef<typeof DropdownMenuShortcut>,
  React.PropsWithoutRef<React.ComponentProps<typeof DropdownMenuShortcut>>
>(function MenubarShortcut({
  className,
  ...props
}, ref) {
  return (
    <DropdownMenuShortcut
      ref={ref}
      data-slot="menubar-shortcut"
      className={cn(
        "skui:ml-auto skui:text-xs skui:tracking-widest skui:text-muted-foreground skui:group-focus/menubar-item:text-accent-foreground",
        className
      )}
      {...props}
    />
  )

})

function MenubarSub({
  ...props
}: React.ComponentProps<typeof DropdownMenuSub>) {
  return <DropdownMenuSub data-slot="menubar-sub" {...props} />
}

const MenubarSubTrigger = React.forwardRef<
  React.ElementRef<typeof DropdownMenuSubTrigger>,
  React.PropsWithoutRef<React.ComponentProps<typeof DropdownMenuSubTrigger> & {
  inset?: boolean
}>
>(function MenubarSubTrigger({
  className,
  inset,
  ...props
}, ref) {
  return (
    <DropdownMenuSubTrigger
      ref={ref}
      data-slot="menubar-sub-trigger"
      data-inset={inset}
      className={cn(
        "skui:gap-1.5 skui:rounded-md skui:px-1.5 skui:py-1 skui:text-sm skui:focus:bg-accent skui:focus:text-accent-foreground skui:data-inset:pl-7 skui:data-open:bg-accent skui:data-open:text-accent-foreground skui:[&_svg:not([class*='size-'])]:size-4",
        className
      )}
      {...props}
    />
  )

})

const MenubarSubContent = React.forwardRef<
  React.ElementRef<typeof DropdownMenuSubContent>,
  React.PropsWithoutRef<React.ComponentProps<typeof DropdownMenuSubContent>>
>(function MenubarSubContent({
  className,
  ...props
}, ref) {
  return (
    <DropdownMenuSubContent
      ref={ref}
      data-slot="menubar-sub-content"
      className={cn(
        "skui:min-w-32 skui:rounded-lg skui:bg-popover skui:p-1 skui:text-popover-foreground skui:shadow-lg skui:ring-1 skui:ring-foreground/10 skui:duration-100 skui:data-[side=bottom]:slide-in-from-top-2 skui:data-[side=left]:slide-in-from-right-2 skui:data-[side=right]:slide-in-from-left-2 skui:data-[side=top]:slide-in-from-bottom-2 skui:data-open:animate-in skui:data-open:fade-in-0 skui:data-open:zoom-in-95 skui:data-closed:animate-out skui:data-closed:fade-out-0 skui:data-closed:zoom-out-95",
        className
      )}
      {...props}
    />
  )

})

export {
  Menubar,
  MenubarPortal,
  MenubarMenu,
  MenubarTrigger,
  MenubarContent,
  MenubarGroup,
  MenubarSeparator,
  MenubarLabel,
  MenubarItem,
  MenubarShortcut,
  MenubarCheckboxItem,
  MenubarRadioGroup,
  MenubarRadioItem,
  MenubarSub,
  MenubarSubTrigger,
  MenubarSubContent,
}

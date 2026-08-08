"use client"

import { useSpfxUiRequiredId } from "../../lib/ui-root"
import { useSpfxUiOwnedRender, useSpfxUiPortalHost, useSpfxUiPortalId } from "../../lib/ui-root"
import { CheckIcon, ChevronDownIcon, ChevronUpIcon } from "lucide-react"
import * as React from "react"
import { Select as SelectPrimitive } from "@base-ui/react/select"

import { cn } from "../../lib/utils"

function Select<Value, Multiple extends boolean | undefined = false>({
  id,
  ...props
}: SelectPrimitive.Root.Props<Value, Multiple>) {
  return <SelectPrimitive.Root id={useSpfxUiRequiredId(id, "Select.Root")} {...props} />
}

const SelectGroup = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Group>,
  React.PropsWithoutRef<SelectPrimitive.Group.Props>
>(function SelectGroup({ className, ...props }, ref) {
  return (
    <SelectPrimitive.Group
      ref={ref}
      data-slot="select-group"
      className={cn("skui:scroll-my-1 skui:p-1", className)}
      {...props}
    />
  )

})

const SelectValue = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Value>,
  React.PropsWithoutRef<SelectPrimitive.Value.Props>
>(function SelectValue({ className, ...props }, ref) {
  return (
    <SelectPrimitive.Value
      ref={ref}
      data-slot="select-value"
      className={cn("skui:flex skui:flex-1 skui:text-left", className)}
      {...props}
    />
  )

})

const SelectTrigger = React.forwardRef<
  HTMLButtonElement,
  React.PropsWithoutRef<SelectPrimitive.Trigger.Props & {
  size?: "sm" | "default"
}>
>(function SelectTrigger({
  className,
  size = "default",
  children,
  ...props
}, ref) {
  return (
    <SelectPrimitive.Trigger
      ref={ref}
      data-slot="select-trigger"
      data-size={size}
      className={cn(
        "skui:flex skui:w-fit skui:items-center skui:justify-between skui:gap-1.5 skui:rounded-lg skui:border skui:border-input skui:bg-transparent skui:py-2 skui:pr-2 skui:pl-2.5 skui:text-sm skui:whitespace-nowrap skui:transition-colors skui:outline-none skui:select-none skui:focus-visible:border-ring skui:focus-visible:ring-3 skui:focus-visible:ring-ring/50 skui:disabled:cursor-not-allowed skui:disabled:opacity-50 skui:aria-invalid:border-destructive skui:aria-invalid:ring-3 skui:aria-invalid:ring-destructive/20 skui:data-placeholder:text-muted-foreground skui:data-[size=default]:h-8 skui:data-[size=sm]:h-7 skui:data-[size=sm]:rounded-[min(var(--radius-md),10px)] skui:*:data-[slot=select-value]:line-clamp-1 skui:*:data-[slot=select-value]:flex skui:*:data-[slot=select-value]:items-center skui:*:data-[slot=select-value]:gap-1.5 skui:dark:bg-input/30 skui:dark:hover:bg-input/50 skui:dark:aria-invalid:border-destructive/50 skui:dark:aria-invalid:ring-destructive/40 skui:[&_svg]:pointer-events-none skui:[&_svg]:shrink-0 skui:[&_svg:not([class*='size-'])]:size-4",
        className
      )}
      {...props}
    >
      {children}
      <SelectPrimitive.Icon
        render={
          <ChevronDownIcon
            className="skui:pointer-events-none skui:size-4 skui:text-muted-foreground"
          />
        }
      />
    </SelectPrimitive.Trigger>
  )

})

const SelectContent = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Popup>,
  React.PropsWithoutRef<SelectPrimitive.Popup.Props &
  Pick<
    SelectPrimitive.Positioner.Props,
    "align" | "alignOffset" | "side" | "sideOffset" | "alignItemWithTrigger"
  >>
>(function SelectContent({
  className,
  children,
  side = "bottom",
  sideOffset = 4,
  align = "center",
  alignOffset = 0,
  alignItemWithTrigger = true,
  ...props
}, ref) {
  return (
    <SelectPrimitive.Portal id={useSpfxUiPortalId(props.id)} container={useSpfxUiPortalHost()}>
      <SelectPrimitive.Positioner
        side={side}
        sideOffset={sideOffset}
        align={align}
        alignOffset={alignOffset}
        alignItemWithTrigger={alignItemWithTrigger}
        className="skui:isolate skui:z-50"
      >
        <SelectPrimitive.Popup
          ref={ref}
          data-slot="select-content"
          data-align-trigger={alignItemWithTrigger}
          className={cn(
            "skui:relative skui:isolate skui:z-50 skui:max-h-(--available-height) skui:w-(--anchor-width) skui:min-w-36 skui:origin-(--transform-origin) skui:overflow-x-hidden skui:overflow-y-auto skui:rounded-lg skui:bg-popover skui:text-popover-foreground skui:shadow-md skui:ring-1 skui:ring-foreground/10 skui:duration-100 skui:data-[align-trigger=true]:animate-none skui:data-[side=bottom]:slide-in-from-top-2 skui:data-[side=inline-end]:slide-in-from-left-2 skui:data-[side=inline-start]:slide-in-from-right-2 skui:data-[side=left]:slide-in-from-right-2 skui:data-[side=right]:slide-in-from-left-2 skui:data-[side=top]:slide-in-from-bottom-2 skui:data-open:animate-in skui:data-open:fade-in-0 skui:data-open:zoom-in-95 skui:data-closed:animate-out skui:data-closed:fade-out-0 skui:data-closed:zoom-out-95",
            className
          )}
          {...props} id={props.id} render={useSpfxUiOwnedRender(props.render, props.id, "SelectContent")}
        >
          <SelectScrollUpButton />
          <SelectPrimitive.List>{children}</SelectPrimitive.List>
          <SelectScrollDownButton />
        </SelectPrimitive.Popup>
      </SelectPrimitive.Positioner>
    </SelectPrimitive.Portal>
  )

})

const SelectLabel = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.GroupLabel>,
  React.PropsWithoutRef<SelectPrimitive.GroupLabel.Props>
>(function SelectLabel({
  className,
  ...props
}, ref) {
  return (
    <SelectPrimitive.GroupLabel
      ref={ref}
      data-slot="select-label"
      className={cn("skui:px-1.5 skui:py-1 skui:text-xs skui:text-muted-foreground", className)}
      {...props}
    />
  )

})

const SelectItem = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Item>,
  React.PropsWithoutRef<SelectPrimitive.Item.Props>
>(function SelectItem({
  className,
  children,
  ...props
}, ref) {
  return (
    <SelectPrimitive.Item
      ref={ref}
      data-slot="select-item"
      className={cn(
        "skui:relative skui:flex skui:w-full skui:cursor-default skui:items-center skui:gap-1.5 skui:rounded-md skui:py-1 skui:pr-8 skui:pl-1.5 skui:text-sm skui:outline-hidden skui:select-none skui:focus:bg-accent skui:focus:text-accent-foreground skui:not-data-[variant=destructive]:focus:**:text-accent-foreground skui:data-disabled:pointer-events-none skui:data-disabled:opacity-50 skui:[&_svg]:pointer-events-none skui:[&_svg]:shrink-0 skui:[&_svg:not([class*='size-'])]:size-4 skui:*:[span]:last:flex skui:*:[span]:last:items-center skui:*:[span]:last:gap-2",
        className
      )}
      {...props}
    >
      <SelectPrimitive.ItemText className="skui:flex skui:flex-1 skui:shrink-0 skui:gap-2 skui:whitespace-nowrap">
        {children}
      </SelectPrimitive.ItemText>
      <SelectPrimitive.ItemIndicator
        render={
          <span className="skui:pointer-events-none skui:absolute skui:right-2 skui:flex skui:size-4 skui:items-center skui:justify-center" />
        }
      >
        <CheckIcon
          className="skui:pointer-events-none"
        />
      </SelectPrimitive.ItemIndicator>
    </SelectPrimitive.Item>
  )

})

const SelectSeparator = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Separator>,
  React.PropsWithoutRef<SelectPrimitive.Separator.Props>
>(function SelectSeparator({
  className,
  ...props
}, ref) {
  return (
    <SelectPrimitive.Separator
      ref={ref}
      data-slot="select-separator"
      className={cn("skui:pointer-events-none skui:-mx-1 skui:my-1 skui:h-px skui:bg-border", className)}
      {...props}
    />
  )

})

const SelectScrollUpButton = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.ScrollUpArrow>,
  React.PropsWithoutRef<React.ComponentProps<typeof SelectPrimitive.ScrollUpArrow>>
>(function SelectScrollUpButton({
  className,
  ...props
}, ref) {
  return (
    <SelectPrimitive.ScrollUpArrow
      ref={ref}
      data-slot="select-scroll-up-button"
      className={cn(
        "skui:top-0 skui:z-10 skui:flex skui:w-full skui:cursor-default skui:items-center skui:justify-center skui:bg-popover skui:py-1 skui:[&_svg:not([class*='size-'])]:size-4",
        className
      )}
      {...props}
    >
      <ChevronUpIcon />
    </SelectPrimitive.ScrollUpArrow>
  )

})

const SelectScrollDownButton = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.ScrollDownArrow>,
  React.PropsWithoutRef<React.ComponentProps<typeof SelectPrimitive.ScrollDownArrow>>
>(function SelectScrollDownButton({
  className,
  ...props
}, ref) {
  return (
    <SelectPrimitive.ScrollDownArrow
      ref={ref}
      data-slot="select-scroll-down-button"
      className={cn(
        "skui:bottom-0 skui:z-10 skui:flex skui:w-full skui:cursor-default skui:items-center skui:justify-center skui:bg-popover skui:py-1 skui:[&_svg:not([class*='size-'])]:size-4",
        className
      )}
      {...props}
    >
      <ChevronDownIcon />
    </SelectPrimitive.ScrollDownArrow>
  )

})

export {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectScrollDownButton,
  SelectScrollUpButton,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
}

"use client"

import { CheckIcon, ChevronDownIcon, XIcon } from "lucide-react"
import * as React from "react"
import { Combobox as ComboboxPrimitive } from "@base-ui/react/combobox"

import { cn } from "../../lib/utils"
import { Button } from "./button"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "./input-group"

const Combobox = ComboboxPrimitive.Root

function ComboboxValue({ ...props }: ComboboxPrimitive.Value.Props) {
  return <ComboboxPrimitive.Value data-slot="combobox-value" {...props} />
}

const ComboboxTrigger = React.forwardRef<
  HTMLButtonElement,
  React.PropsWithoutRef<ComboboxPrimitive.Trigger.Props>
>(function ComboboxTrigger({
  className,
  children,
  ...props
}, ref) {
  return (
    <ComboboxPrimitive.Trigger
      ref={ref}
      data-slot="combobox-trigger"
      className={cn("skui:[&_svg:not([class*='size-'])]:size-4", className)}
      {...props}
    >
      {children}
      <ChevronDownIcon
        className="skui:pointer-events-none skui:size-4 skui:text-muted-foreground"
      />
    </ComboboxPrimitive.Trigger>
  )

})

const ComboboxClear = React.forwardRef<
  HTMLButtonElement,
  React.PropsWithoutRef<ComboboxPrimitive.Clear.Props>
>(function ComboboxClear({ className, ...props }, ref) {
  return (
    <ComboboxPrimitive.Clear
      ref={ref}
      data-slot="combobox-clear"
      render={<InputGroupButton variant="ghost" size="icon-xs" />}
      className={cn(className)}
      {...props}
    >
      <XIcon
        className="skui:pointer-events-none"
      />
    </ComboboxPrimitive.Clear>
  )

})

const ComboboxInput = React.forwardRef<
  HTMLInputElement,
  React.PropsWithoutRef<ComboboxPrimitive.Input.Props & {
  showTrigger?: boolean
  showClear?: boolean
}>
>(function ComboboxInput({
  className,
  children,
  disabled = false,
  showTrigger = true,
  showClear = false,
  ...props
}, ref) {
  return (
    <InputGroup className={cn("skui:w-auto", className)}>
      <ComboboxPrimitive.Input
        ref={ref}
        render={<InputGroupInput disabled={disabled} />}
        {...props}
      />
      <InputGroupAddon align="inline-end">
        {showTrigger && (
          <InputGroupButton
            size="icon-xs"
            variant="ghost"
            render={<ComboboxTrigger />}
            data-slot="input-group-button"
            className="skui:group-has-data-[slot=combobox-clear]/input-group:hidden skui:data-pressed:bg-transparent"
            disabled={disabled}
          />
        )}
        {showClear && <ComboboxClear disabled={disabled} />}
      </InputGroupAddon>
      {children}
    </InputGroup>
  )

})

const ComboboxContent = React.forwardRef<
  React.ElementRef<typeof ComboboxPrimitive.Popup>,
  React.PropsWithoutRef<ComboboxPrimitive.Popup.Props &
  Pick<
    ComboboxPrimitive.Positioner.Props,
    "side" | "align" | "sideOffset" | "alignOffset" | "anchor"
  >>
>(function ComboboxContent({
  className,
  side = "bottom",
  sideOffset = 6,
  align = "start",
  alignOffset = 0,
  anchor,
  ...props
}, ref) {
  return (
    <ComboboxPrimitive.Portal>
      <ComboboxPrimitive.Positioner
        side={side}
        sideOffset={sideOffset}
        align={align}
        alignOffset={alignOffset}
        anchor={anchor}
        className="skui:isolate skui:z-50"
      >
        <ComboboxPrimitive.Popup
          ref={ref}
          data-slot="combobox-content"
          data-chips={!!anchor}
          className={cn(
            "skui:group/combobox-content skui:relative skui:max-h-(--available-height) skui:w-(--anchor-width) skui:max-w-(--available-width) skui:min-w-[calc(var(--anchor-width)+--spacing(7))] skui:origin-(--transform-origin) skui:overflow-hidden skui:rounded-lg skui:bg-popover skui:text-popover-foreground skui:shadow-md skui:ring-1 skui:ring-foreground/10 skui:duration-100 skui:data-[chips=true]:min-w-(--anchor-width) skui:data-[side=bottom]:slide-in-from-top-2 skui:data-[side=inline-end]:slide-in-from-left-2 skui:data-[side=inline-start]:slide-in-from-right-2 skui:data-[side=left]:slide-in-from-right-2 skui:data-[side=right]:slide-in-from-left-2 skui:data-[side=top]:slide-in-from-bottom-2 skui:*:data-[slot=input-group]:m-1 skui:*:data-[slot=input-group]:mb-0 skui:*:data-[slot=input-group]:h-8 skui:*:data-[slot=input-group]:border-input/30 skui:*:data-[slot=input-group]:bg-input/30 skui:*:data-[slot=input-group]:shadow-none skui:data-open:animate-in skui:data-open:fade-in-0 skui:data-open:zoom-in-95 skui:data-closed:animate-out skui:data-closed:fade-out-0 skui:data-closed:zoom-out-95",
            className
          )}
          {...props}
        />
      </ComboboxPrimitive.Positioner>
    </ComboboxPrimitive.Portal>
  )

})

const ComboboxList = React.forwardRef<
  React.ElementRef<typeof ComboboxPrimitive.List>,
  React.PropsWithoutRef<ComboboxPrimitive.List.Props>
>(function ComboboxList({ className, ...props }, ref) {
  return (
    <ComboboxPrimitive.List
      ref={ref}
      data-slot="combobox-list"
      className={cn(
        "skui:no-scrollbar skui:max-h-[min(calc(--spacing(72)---spacing(9)),calc(var(--available-height)---spacing(9)))] skui:scroll-py-1 skui:overflow-y-auto skui:overscroll-contain skui:p-1 skui:data-empty:p-0",
        className
      )}
      {...props}
    />
  )

})

const ComboboxItem = React.forwardRef<
  React.ElementRef<typeof ComboboxPrimitive.Item>,
  React.PropsWithoutRef<ComboboxPrimitive.Item.Props>
>(function ComboboxItem({
  className,
  children,
  ...props
}, ref) {
  return (
    <ComboboxPrimitive.Item
      ref={ref}
      data-slot="combobox-item"
      className={cn(
        "skui:relative skui:flex skui:w-full skui:cursor-default skui:items-center skui:gap-2 skui:rounded-md skui:py-1 skui:pr-8 skui:pl-1.5 skui:text-sm skui:outline-hidden skui:select-none skui:data-highlighted:bg-accent skui:data-highlighted:text-accent-foreground skui:not-data-[variant=destructive]:data-highlighted:**:text-accent-foreground skui:data-disabled:pointer-events-none skui:data-disabled:opacity-50 skui:[&_svg]:pointer-events-none skui:[&_svg]:shrink-0 skui:[&_svg:not([class*='size-'])]:size-4",
        className
      )}
      {...props}
    >
      {children}
      <ComboboxPrimitive.ItemIndicator
        render={
          <span className="skui:pointer-events-none skui:absolute skui:right-2 skui:flex skui:size-4 skui:items-center skui:justify-center" />
        }
      >
        <CheckIcon
          className="skui:pointer-events-none"
        />
      </ComboboxPrimitive.ItemIndicator>
    </ComboboxPrimitive.Item>
  )

})

const ComboboxGroup = React.forwardRef<
  React.ElementRef<typeof ComboboxPrimitive.Group>,
  React.PropsWithoutRef<ComboboxPrimitive.Group.Props>
>(function ComboboxGroup({ className, ...props }, ref) {
  return (
    <ComboboxPrimitive.Group
      ref={ref}
      data-slot="combobox-group"
      className={cn(className)}
      {...props}
    />
  )

})

const ComboboxLabel = React.forwardRef<
  React.ElementRef<typeof ComboboxPrimitive.GroupLabel>,
  React.PropsWithoutRef<ComboboxPrimitive.GroupLabel.Props>
>(function ComboboxLabel({
  className,
  ...props
}, ref) {
  return (
    <ComboboxPrimitive.GroupLabel
      ref={ref}
      data-slot="combobox-label"
      className={cn("skui:px-2 skui:py-1.5 skui:text-xs skui:text-muted-foreground", className)}
      {...props}
    />
  )

})

function ComboboxCollection({ ...props }: ComboboxPrimitive.Collection.Props) {
  return (
    <ComboboxPrimitive.Collection data-slot="combobox-collection" {...props} />
  )
}

const ComboboxEmpty = React.forwardRef<
  React.ElementRef<typeof ComboboxPrimitive.Empty>,
  React.PropsWithoutRef<ComboboxPrimitive.Empty.Props>
>(function ComboboxEmpty({ className, ...props }, ref) {
  return (
    <ComboboxPrimitive.Empty
      ref={ref}
      data-slot="combobox-empty"
      className={cn(
        "skui:hidden skui:w-full skui:justify-center skui:py-2 skui:text-center skui:text-sm skui:text-muted-foreground skui:group-data-empty/combobox-content:flex",
        className
      )}
      {...props}
    />
  )

})

const ComboboxSeparator = React.forwardRef<
  React.ElementRef<typeof ComboboxPrimitive.Separator>,
  React.PropsWithoutRef<ComboboxPrimitive.Separator.Props>
>(function ComboboxSeparator({
  className,
  ...props
}, ref) {
  return (
    <ComboboxPrimitive.Separator
      ref={ref}
      data-slot="combobox-separator"
      className={cn("skui:-mx-1 skui:my-1 skui:h-px skui:bg-border", className)}
      {...props}
    />
  )

})

const ComboboxChips = React.forwardRef<
  React.ElementRef<typeof ComboboxPrimitive.Chips>,
  React.PropsWithoutRef<React.ComponentPropsWithRef<typeof ComboboxPrimitive.Chips> &
  ComboboxPrimitive.Chips.Props>
>(function ComboboxChips({
  className,
  ...props
}, ref) {
  return (
    <ComboboxPrimitive.Chips
      ref={ref}
      data-slot="combobox-chips"
      className={cn(
        "skui:flex skui:min-h-8 skui:flex-wrap skui:items-center skui:gap-1 skui:rounded-lg skui:border skui:border-input skui:bg-transparent skui:bg-clip-padding skui:px-2.5 skui:py-1 skui:text-sm skui:transition-colors skui:focus-within:border-ring skui:focus-within:ring-3 skui:focus-within:ring-ring/50 skui:has-aria-invalid:border-destructive skui:has-aria-invalid:ring-3 skui:has-aria-invalid:ring-destructive/20 skui:has-data-[slot=combobox-chip]:px-1 skui:dark:bg-input/30 skui:dark:has-aria-invalid:border-destructive/50 skui:dark:has-aria-invalid:ring-destructive/40",
        className
      )}
      {...props}
    />
  )

})

const ComboboxChip = React.forwardRef<
  React.ElementRef<typeof ComboboxPrimitive.Chip>,
  React.PropsWithoutRef<ComboboxPrimitive.Chip.Props & {
  showRemove?: boolean
}>
>(function ComboboxChip({
  className,
  children,
  showRemove = true,
  ...props
}, ref) {
  return (
    <ComboboxPrimitive.Chip
      ref={ref}
      data-slot="combobox-chip"
      className={cn(
        "skui:flex skui:h-[calc(--spacing(5.25))] skui:w-fit skui:items-center skui:justify-center skui:gap-1 skui:rounded-sm skui:bg-muted skui:px-1.5 skui:text-xs skui:font-medium skui:whitespace-nowrap skui:text-foreground skui:has-disabled:pointer-events-none skui:has-disabled:cursor-not-allowed skui:has-disabled:opacity-50 skui:has-data-[slot=combobox-chip-remove]:pr-0",
        className
      )}
      {...props}
    >
      {children}
      {showRemove && (
        <ComboboxPrimitive.ChipRemove
          render={<Button variant="ghost" size="icon-xs" />}
          className="skui:-ml-1 skui:opacity-50 skui:hover:opacity-100"
          data-slot="combobox-chip-remove"
        >
          <XIcon
            className="skui:pointer-events-none"
          />
        </ComboboxPrimitive.ChipRemove>
      )}
    </ComboboxPrimitive.Chip>
  )

})

const ComboboxChipsInput = React.forwardRef<
  HTMLInputElement,
  React.PropsWithoutRef<ComboboxPrimitive.Input.Props>
>(function ComboboxChipsInput({
  className,
  ...props
}, ref) {
  return (
    <ComboboxPrimitive.Input
      ref={ref}
      data-slot="combobox-chip-input"
      className={cn("skui:min-w-16 skui:flex-1 skui:outline-none", className)}
      {...props}
    />
  )

})

function useComboboxAnchor() {
  return React.useRef<HTMLDivElement | null>(null)
}

export {
  Combobox,
  ComboboxInput,
  ComboboxContent,
  ComboboxList,
  ComboboxItem,
  ComboboxGroup,
  ComboboxLabel,
  ComboboxCollection,
  ComboboxEmpty,
  ComboboxSeparator,
  ComboboxChips,
  ComboboxChip,
  ComboboxChipsInput,
  ComboboxTrigger,
  ComboboxValue,
  useComboboxAnchor,
}

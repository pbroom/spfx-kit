"use client"

import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "../../lib/utils"
import { Button } from "./button"
import { Input } from "./input"
import { Textarea } from "./textarea"

const InputGroup = React.forwardRef<
  React.ElementRef<"div">,
  React.PropsWithoutRef<React.ComponentProps<"div">>
>(function InputGroup({ className, ...props }, ref) {
  return (
    <div
      ref={ref}
      data-slot="input-group"
      role="group"
      className={cn(
        "skui:group/input-group skui:relative skui:flex skui:h-8 skui:w-full skui:min-w-0 skui:items-center skui:rounded-lg skui:border skui:border-input skui:transition-colors skui:outline-none skui:in-data-[slot=combobox-content]:focus-within:border-inherit skui:in-data-[slot=combobox-content]:focus-within:ring-0 skui:has-disabled:bg-input/50 skui:has-disabled:opacity-50 skui:has-[[data-slot=input-group-control]:focus-visible]:border-ring skui:has-[[data-slot=input-group-control]:focus-visible]:ring-3 skui:has-[[data-slot=input-group-control]:focus-visible]:ring-ring/50 skui:has-[[data-slot][aria-invalid=true]]:border-destructive skui:has-[[data-slot][aria-invalid=true]]:ring-3 skui:has-[[data-slot][aria-invalid=true]]:ring-destructive/20 skui:has-[>[data-align=block-end]]:h-auto skui:has-[>[data-align=block-end]]:flex-col skui:has-[>[data-align=block-start]]:h-auto skui:has-[>[data-align=block-start]]:flex-col skui:has-[>textarea]:h-auto skui:dark:bg-input/30 skui:dark:has-disabled:bg-input/80 skui:dark:has-[[data-slot][aria-invalid=true]]:ring-destructive/40 skui:has-[>[data-align=block-end]]:[&>input]:pt-3 skui:has-[>[data-align=block-start]]:[&>input]:pb-3 skui:has-[>[data-align=inline-end]]:[&>input]:pr-1.5 skui:has-[>[data-align=inline-start]]:[&>input]:pl-1.5",
        className
      )}
      {...props}
    />
  )

})

const inputGroupAddonVariants = cva(
  "skui:flex skui:h-auto skui:cursor-text skui:items-center skui:justify-center skui:gap-2 skui:py-1.5 skui:text-sm skui:font-medium skui:text-muted-foreground skui:select-none skui:group-data-[disabled=true]/input-group:opacity-50 skui:[&>kbd]:rounded-[calc(var(--radius)-5px)] skui:[&>svg:not([class*='size-'])]:size-4",
  {
    variants: {
      align: {
        "inline-start":
          "skui:order-first skui:pl-2 skui:has-[>button]:ml-[-0.3rem] skui:has-[>kbd]:ml-[-0.15rem]",
        "inline-end":
          "skui:order-last skui:pr-2 skui:has-[>button]:mr-[-0.3rem] skui:has-[>kbd]:mr-[-0.15rem]",
        "block-start":
          "skui:order-first skui:w-full skui:justify-start skui:px-2.5 skui:pt-2 skui:group-has-[>input]/input-group:pt-2 skui:[.skui\\:border-b]:pb-2",
        "block-end":
          "skui:order-last skui:w-full skui:justify-start skui:px-2.5 skui:pb-2 skui:group-has-[>input]/input-group:pb-2 skui:[.skui\\:border-t]:pt-2",
      },
    },
    defaultVariants: {
      align: "inline-start",
    },
  }
)

const InputGroupAddon = React.forwardRef<
  React.ElementRef<"div">,
  React.PropsWithoutRef<React.ComponentProps<"div"> & VariantProps<typeof inputGroupAddonVariants>>
>(function InputGroupAddon({
  className,
  align = "inline-start",
  ...props
}, ref) {
  return (
    <div
      ref={ref}
      role="group"
      data-slot="input-group-addon"
      data-align={align}
      className={cn(inputGroupAddonVariants({ align }), className)}
      onClick={(e) => {
        if ((e.target as HTMLElement).closest("button")) {
          return
        }
        e.currentTarget.parentElement?.querySelector("input")?.focus()
      }}
      {...props}
    />
  )

})

const inputGroupButtonVariants = cva(
  "skui:flex skui:items-center skui:gap-2 skui:text-sm skui:shadow-none",
  {
    variants: {
      size: {
        xs: "skui:h-6 skui:gap-1 skui:rounded-[calc(var(--radius)-3px)] skui:px-1.5 skui:[&>svg:not([class*='size-'])]:size-3.5",
        sm: "",
        "icon-xs":
          "skui:size-6 skui:rounded-[calc(var(--radius)-3px)] skui:p-0 skui:has-[>svg]:p-0",
        "icon-sm": "skui:size-8 skui:p-0 skui:has-[>svg]:p-0",
      },
    },
    defaultVariants: {
      size: "xs",
    },
  }
)

const InputGroupButton = React.forwardRef<
  React.ElementRef<typeof Button>,
  React.PropsWithoutRef<Omit<React.ComponentProps<typeof Button>, "size" | "type"> &
  VariantProps<typeof inputGroupButtonVariants> & {
    type?: "button" | "submit" | "reset"
  }>
>(function InputGroupButton({
  className,
  type = "button",
  variant = "ghost",
  size = "xs",
  ...props
}, ref) {
  return (
    <Button
      ref={ref}
      type={type}
      data-size={size}
      variant={variant}
      className={cn(inputGroupButtonVariants({ size }), className)}
      {...props}
    />
  )

})

const InputGroupText = React.forwardRef<
  React.ElementRef<"span">,
  React.PropsWithoutRef<React.ComponentProps<"span">>
>(function InputGroupText({ className, ...props }, ref) {
  return (
    <span
      ref={ref}
      className={cn(
        "skui:flex skui:items-center skui:gap-2 skui:text-sm skui:text-muted-foreground skui:[&_svg]:pointer-events-none skui:[&_svg:not([class*='size-'])]:size-4",
        className
      )}
      {...props}
    />
  )

})

const InputGroupInput = React.forwardRef<
  React.ElementRef<"input">,
  React.PropsWithoutRef<React.ComponentProps<"input">>
>(function InputGroupInput({
  className,
  ...props
}, ref) {
  return (
    <Input
      ref={ref}
      data-slot="input-group-control"
      className={cn(
        "skui:flex-1 skui:rounded-none skui:border-0 skui:bg-transparent skui:shadow-none skui:ring-0 skui:focus-visible:ring-0 skui:disabled:bg-transparent skui:aria-invalid:ring-0 skui:dark:bg-transparent skui:dark:disabled:bg-transparent",
        className
      )}
      {...props}
    />
  )

})

const InputGroupTextarea = React.forwardRef<
  React.ElementRef<"textarea">,
  React.PropsWithoutRef<React.ComponentProps<"textarea">>
>(function InputGroupTextarea({
  className,
  ...props
}, ref) {
  return (
    <Textarea
      ref={ref}
      data-slot="input-group-control"
      className={cn(
        "skui:flex-1 skui:resize-none skui:rounded-none skui:border-0 skui:bg-transparent skui:py-2 skui:shadow-none skui:ring-0 skui:focus-visible:ring-0 skui:disabled:bg-transparent skui:aria-invalid:ring-0 skui:dark:bg-transparent skui:dark:disabled:bg-transparent",
        className
      )}
      {...props}
    />
  )

})

export {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupText,
  InputGroupInput,
  InputGroupTextarea,
}

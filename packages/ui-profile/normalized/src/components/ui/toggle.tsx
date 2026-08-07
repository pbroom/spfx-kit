"use client"

import * as React from "react"
import { Toggle as TogglePrimitive } from "@base-ui/react/toggle"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "../../lib/utils"

const toggleVariants = cva(
  "skui:group/toggle skui:inline-flex skui:items-center skui:justify-center skui:gap-1 skui:rounded-lg skui:text-sm skui:font-medium skui:whitespace-nowrap skui:transition-all skui:outline-none skui:hover:bg-muted skui:hover:text-foreground skui:focus-visible:border-ring skui:focus-visible:ring-[3px] skui:focus-visible:ring-ring/50 skui:disabled:pointer-events-none skui:disabled:opacity-50 skui:aria-invalid:border-destructive skui:aria-invalid:ring-destructive/20 skui:aria-pressed:bg-muted skui:data-[state=on]:bg-muted skui:dark:aria-invalid:ring-destructive/40 skui:[&_svg]:pointer-events-none skui:[&_svg]:shrink-0 skui:[&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default: "skui:bg-transparent",
        outline: "skui:border skui:border-input skui:bg-transparent skui:hover:bg-muted",
      },
      size: {
        default:
          "skui:h-8 skui:min-w-8 skui:px-2.5 skui:has-data-[icon=inline-end]:pr-2 skui:has-data-[icon=inline-start]:pl-2",
        sm: "skui:h-7 skui:min-w-7 skui:rounded-[min(var(--radius-md),12px)] skui:px-2.5 skui:text-[0.8rem] skui:has-data-[icon=inline-end]:pr-1.5 skui:has-data-[icon=inline-start]:pl-1.5 skui:[&_svg:not([class*='size-'])]:size-3.5",
        lg: "skui:h-9 skui:min-w-9 skui:px-2.5 skui:has-data-[icon=inline-end]:pr-2 skui:has-data-[icon=inline-start]:pl-2",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

const Toggle = React.forwardRef<
  HTMLButtonElement,
  React.PropsWithoutRef<TogglePrimitive.Props & VariantProps<typeof toggleVariants>>
>(function Toggle({
  className,
  variant = "default",
  size = "default",
  ...props
}, ref) {
  return (
    <TogglePrimitive
      ref={ref}
      data-slot="toggle"
      className={cn(toggleVariants({ variant, size, className }))}
      {...props}
    />
  )

})

export { Toggle, toggleVariants }

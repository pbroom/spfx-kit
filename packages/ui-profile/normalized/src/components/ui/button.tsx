import * as React from "react"
import { Button as ButtonPrimitive } from "@base-ui/react/button"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "../../lib/utils"

const buttonVariants = cva(
  "skui:group/button skui:inline-flex skui:shrink-0 skui:items-center skui:justify-center skui:rounded-lg skui:border skui:border-transparent skui:bg-clip-padding skui:text-sm skui:font-medium skui:whitespace-nowrap skui:transition-all skui:outline-none skui:select-none skui:focus-visible:border-ring skui:focus-visible:ring-3 skui:focus-visible:ring-ring/50 skui:active:not-aria-[haspopup]:translate-y-px skui:disabled:pointer-events-none skui:disabled:opacity-50 skui:aria-invalid:border-destructive skui:aria-invalid:ring-3 skui:aria-invalid:ring-destructive/20 skui:dark:aria-invalid:border-destructive/50 skui:dark:aria-invalid:ring-destructive/40 skui:[&_svg]:pointer-events-none skui:[&_svg]:shrink-0 skui:[&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default: "skui:bg-primary skui:text-primary-foreground skui:hover:bg-primary/80",
        outline:
          "skui:border-border skui:bg-background skui:hover:bg-muted skui:hover:text-foreground skui:aria-expanded:bg-muted skui:aria-expanded:text-foreground skui:dark:border-input skui:dark:bg-input/30 skui:dark:hover:bg-input/50",
        secondary:
          "skui:bg-secondary skui:text-secondary-foreground skui:hover:bg-[color-mix(in_oklch,var(--secondary),var(--foreground)_5%)] skui:aria-expanded:bg-secondary skui:aria-expanded:text-secondary-foreground",
        ghost:
          "skui:hover:bg-muted skui:hover:text-foreground skui:aria-expanded:bg-muted skui:aria-expanded:text-foreground skui:dark:hover:bg-muted/50",
        destructive:
          "skui:bg-destructive/10 skui:text-destructive skui:hover:bg-destructive/20 skui:focus-visible:border-destructive/40 skui:focus-visible:ring-destructive/20 skui:dark:bg-destructive/20 skui:dark:hover:bg-destructive/30 skui:dark:focus-visible:ring-destructive/40",
        link: "skui:text-primary skui:underline-offset-4 skui:hover:underline",
      },
      size: {
        default:
          "skui:h-8 skui:gap-1.5 skui:px-2.5 skui:has-data-[icon=inline-end]:pr-2 skui:has-data-[icon=inline-start]:pl-2",
        xs: "skui:h-6 skui:gap-1 skui:rounded-[min(var(--radius-md),10px)] skui:px-2 skui:text-xs skui:in-data-[slot=button-group]:rounded-lg skui:has-data-[icon=inline-end]:pr-1.5 skui:has-data-[icon=inline-start]:pl-1.5 skui:[&_svg:not([class*='size-'])]:size-3",
        sm: "skui:h-7 skui:gap-1 skui:rounded-[min(var(--radius-md),12px)] skui:px-2.5 skui:text-[0.8rem] skui:in-data-[slot=button-group]:rounded-lg skui:has-data-[icon=inline-end]:pr-1.5 skui:has-data-[icon=inline-start]:pl-1.5 skui:[&_svg:not([class*='size-'])]:size-3.5",
        lg: "skui:h-9 skui:gap-1.5 skui:px-2.5 skui:has-data-[icon=inline-end]:pr-2 skui:has-data-[icon=inline-start]:pl-2",
        icon: "skui:size-8",
        "icon-xs":
          "skui:size-6 skui:rounded-[min(var(--radius-md),10px)] skui:in-data-[slot=button-group]:rounded-lg skui:[&_svg:not([class*='size-'])]:size-3",
        "icon-sm":
          "skui:size-7 skui:rounded-[min(var(--radius-md),12px)] skui:in-data-[slot=button-group]:rounded-lg",
        "icon-lg": "skui:size-9",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

const Button = React.forwardRef<
  HTMLButtonElement,
  React.PropsWithoutRef<ButtonPrimitive.Props & VariantProps<typeof buttonVariants>>
>(function Button({
  className,
  variant = "default",
  size = "default",
  ...props
}, ref) {
  return (
    <ButtonPrimitive
      ref={ref}
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )

})

export { Button, buttonVariants }

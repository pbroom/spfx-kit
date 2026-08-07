import * as React from "react"
import { mergeProps } from "@base-ui/react/merge-props"
import { useRender } from "@base-ui/react/use-render"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "../../lib/utils"

const badgeVariants = cva(
  "skui:group/badge skui:inline-flex skui:h-5 skui:w-fit skui:shrink-0 skui:items-center skui:justify-center skui:gap-1 skui:overflow-hidden skui:rounded-4xl skui:border skui:border-transparent skui:px-2 skui:py-0.5 skui:text-xs skui:font-medium skui:whitespace-nowrap skui:transition-all skui:focus-visible:border-ring skui:focus-visible:ring-[3px] skui:focus-visible:ring-ring/50 skui:has-data-[icon=inline-end]:pr-1.5 skui:has-data-[icon=inline-start]:pl-1.5 skui:aria-invalid:border-destructive skui:aria-invalid:ring-destructive/20 skui:dark:aria-invalid:ring-destructive/40 skui:[&>svg]:pointer-events-none skui:[&>svg]:size-3!",
  {
    variants: {
      variant: {
        default: "skui:bg-primary skui:text-primary-foreground skui:[a]:hover:bg-primary/80",
        secondary:
          "skui:bg-secondary skui:text-secondary-foreground skui:[a]:hover:bg-secondary/80",
        destructive:
          "skui:bg-destructive/10 skui:text-destructive skui:focus-visible:ring-destructive/20 skui:dark:bg-destructive/20 skui:dark:focus-visible:ring-destructive/40 skui:[a]:hover:bg-destructive/20",
        outline:
          "skui:border-border skui:text-foreground skui:[a]:hover:bg-muted skui:[a]:hover:text-muted-foreground",
        ghost:
          "skui:hover:bg-muted skui:hover:text-muted-foreground skui:dark:hover:bg-muted/50",
        link: "skui:text-primary skui:underline-offset-4 skui:hover:underline",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

const Badge = React.forwardRef<
  React.ElementRef<"span">,
  React.PropsWithoutRef<useRender.ComponentProps<"span"> & VariantProps<typeof badgeVariants>>
>(function Badge({
  className,
  variant = "default",
  render,
  ...props
}, ref) {
  return useRender({
    ref,
    defaultTagName: "span",
    props: mergeProps<"span">(
      {
        className: cn(badgeVariants({ variant }), className),
      },
      props
    ),
    render,
    state: {
      slot: "badge",
      variant,
    },
  })

})

export { Badge, badgeVariants }

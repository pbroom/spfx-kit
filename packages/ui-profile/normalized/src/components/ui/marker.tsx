import * as React from "react"
import { mergeProps } from "@base-ui/react/merge-props"
import { useRender } from "@base-ui/react/use-render"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "../../lib/utils"

const markerVariants = cva(
  "skui:group/marker skui:relative skui:flex skui:min-h-4 skui:w-full skui:items-center skui:gap-2 skui:text-left skui:text-sm skui:text-muted-foreground skui:[&_svg:not([class*='size-'])]:size-4 skui:[a]:underline skui:[a]:underline-offset-3 skui:[a]:hover:text-foreground",
  {
    variants: {
      variant: {
        default: "",
        separator:
          "skui:before:mr-1 skui:before:h-px skui:before:min-w-0 skui:before:flex-1 skui:before:bg-border skui:after:ml-1 skui:after:h-px skui:after:min-w-0 skui:after:flex-1 skui:after:bg-border",
        border: "skui:border-b skui:border-border skui:pb-2",
      },
    },
  }
)

const Marker = React.forwardRef<
  React.ElementRef<"div">,
  React.PropsWithoutRef<useRender.ComponentProps<"div"> & VariantProps<typeof markerVariants>>
>(function Marker({
  className,
  variant = "default",
  render,
  ...props
}, ref) {
  return useRender({
    ref,
    defaultTagName: "div",
    props: mergeProps<"div">(
      {
        className: cn(markerVariants({ variant, className })),
      },
      props
    ),
    render,
    state: {
      slot: "marker",
      variant,
    },
  })

})

const MarkerIcon = React.forwardRef<
  React.ElementRef<"span">,
  React.PropsWithoutRef<React.ComponentProps<"span">>
>(function MarkerIcon({ className, ...props }, ref) {
  return (
    <span
      ref={ref}
      data-slot="marker-icon"
      aria-hidden="true"
      className={cn(
        "skui:size-4 skui:shrink-0 skui:[&_svg:not([class*='size-'])]:size-4",
        className
      )}
      {...props}
    />
  )

})

const MarkerContent = React.forwardRef<
  React.ElementRef<"span">,
  React.PropsWithoutRef<React.ComponentProps<"span">>
>(function MarkerContent({ className, ...props }, ref) {
  return (
    <span
      ref={ref}
      data-slot="marker-content"
      className={cn(
        "skui:min-w-0 skui:wrap-break-word skui:group-data-[variant=separator]/marker:flex-none skui:group-data-[variant=separator]/marker:text-center skui:*:[a]:underline skui:*:[a]:underline-offset-3 skui:*:[a]:hover:text-foreground",
        className
      )}
      {...props}
    />
  )

})

export { Marker, MarkerIcon, MarkerContent, markerVariants }

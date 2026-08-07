import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "../../lib/utils"

const alertVariants = cva(
  "skui:group/alert skui:relative skui:grid skui:w-full skui:gap-0.5 skui:rounded-lg skui:border skui:px-2.5 skui:py-2 skui:text-left skui:text-sm skui:has-data-[slot=alert-action]:relative skui:has-data-[slot=alert-action]:pr-18 skui:has-[>svg]:grid-cols-[auto_1fr] skui:has-[>svg]:gap-x-2 skui:*:[svg]:row-span-2 skui:*:[svg]:translate-y-0.5 skui:*:[svg]:text-current skui:*:[svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default: "skui:bg-card skui:text-card-foreground",
        destructive:
          "skui:bg-card skui:text-destructive skui:*:data-[slot=alert-description]:text-destructive/90 skui:*:[svg]:text-current",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

const Alert = React.forwardRef<
  React.ElementRef<"div">,
  React.PropsWithoutRef<React.ComponentProps<"div"> & VariantProps<typeof alertVariants>>
>(function Alert({
  className,
  variant,
  ...props
}, ref) {
  return (
    <div
      ref={ref}
      data-slot="alert"
      role="alert"
      className={cn(alertVariants({ variant }), className)}
      {...props}
    />
  )

})

const AlertTitle = React.forwardRef<
  React.ElementRef<"div">,
  React.PropsWithoutRef<React.ComponentProps<"div">>
>(function AlertTitle({ className, ...props }, ref) {
  return (
    <div
      ref={ref}
      data-slot="alert-title"
      className={cn(
        "skui:font-medium skui:group-has-[>svg]/alert:col-start-2 skui:[&_a]:underline skui:[&_a]:underline-offset-3 skui:[&_a]:hover:text-foreground",
        className
      )}
      {...props}
    />
  )

})

const AlertDescription = React.forwardRef<
  React.ElementRef<"div">,
  React.PropsWithoutRef<React.ComponentProps<"div">>
>(function AlertDescription({
  className,
  ...props
}, ref) {
  return (
    <div
      ref={ref}
      data-slot="alert-description"
      className={cn(
        "skui:text-sm skui:text-balance skui:text-muted-foreground skui:md:text-pretty skui:[&_a]:underline skui:[&_a]:underline-offset-3 skui:[&_a]:hover:text-foreground skui:[&_p:not(:last-child)]:mb-4",
        className
      )}
      {...props}
    />
  )

})

const AlertAction = React.forwardRef<
  React.ElementRef<"div">,
  React.PropsWithoutRef<React.ComponentProps<"div">>
>(function AlertAction({ className, ...props }, ref) {
  return (
    <div
      ref={ref}
      data-slot="alert-action"
      className={cn("skui:absolute skui:top-2 skui:right-2", className)}
      {...props}
    />
  )

})

export { Alert, AlertTitle, AlertDescription, AlertAction }

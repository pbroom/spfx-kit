import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "../../lib/utils"

const Empty = React.forwardRef<
  React.ElementRef<"div">,
  React.PropsWithoutRef<React.ComponentProps<"div">>
>(function Empty({ className, ...props }, ref) {
  return (
    <div
      ref={ref}
      data-slot="empty"
      className={cn(
        "skui:flex skui:w-full skui:min-w-0 skui:flex-1 skui:flex-col skui:items-center skui:justify-center skui:gap-4 skui:rounded-xl skui:border-dashed skui:p-6 skui:text-center skui:text-balance",
        className
      )}
      {...props}
    />
  )

})

const EmptyHeader = React.forwardRef<
  React.ElementRef<"div">,
  React.PropsWithoutRef<React.ComponentProps<"div">>
>(function EmptyHeader({ className, ...props }, ref) {
  return (
    <div
      ref={ref}
      data-slot="empty-header"
      className={cn("skui:flex skui:max-w-sm skui:flex-col skui:items-center skui:gap-2", className)}
      {...props}
    />
  )

})

const emptyMediaVariants = cva(
  "skui:mb-2 skui:flex skui:shrink-0 skui:items-center skui:justify-center skui:[&_svg]:pointer-events-none skui:[&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "skui:bg-transparent",
        icon: "skui:flex skui:size-8 skui:shrink-0 skui:items-center skui:justify-center skui:rounded-lg skui:bg-muted skui:text-foreground skui:[&_svg:not([class*='size-'])]:size-4",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

const EmptyMedia = React.forwardRef<
  React.ElementRef<"div">,
  React.PropsWithoutRef<React.ComponentProps<"div"> & VariantProps<typeof emptyMediaVariants>>
>(function EmptyMedia({
  className,
  variant = "default",
  ...props
}, ref) {
  return (
    <div
      ref={ref}
      data-slot="empty-icon"
      data-variant={variant}
      className={cn(emptyMediaVariants({ variant, className }))}
      {...props}
    />
  )

})

const EmptyTitle = React.forwardRef<
  React.ElementRef<"div">,
  React.PropsWithoutRef<React.ComponentProps<"div">>
>(function EmptyTitle({ className, ...props }, ref) {
  return (
    <div
      ref={ref}
      data-slot="empty-title"
      className={cn(
        "skui:font-heading skui:text-sm skui:font-medium skui:tracking-tight",
        className
      )}
      {...props}
    />
  )

})

const EmptyDescription = React.forwardRef<
  React.ElementRef<"p">,
  React.PropsWithoutRef<React.ComponentProps<"p">>
>(function EmptyDescription({ className, ...props }, ref) {
  return (
    <div
      ref={ref}
      data-slot="empty-description"
      className={cn(
        "skui:text-sm/relaxed skui:text-muted-foreground skui:[&>a]:underline skui:[&>a]:underline-offset-4 skui:[&>a:hover]:text-primary",
        className
      )}
      {...props}
    />
  )

})

const EmptyContent = React.forwardRef<
  React.ElementRef<"div">,
  React.PropsWithoutRef<React.ComponentProps<"div">>
>(function EmptyContent({ className, ...props }, ref) {
  return (
    <div
      ref={ref}
      data-slot="empty-content"
      className={cn(
        "skui:flex skui:w-full skui:max-w-sm skui:min-w-0 skui:flex-col skui:items-center skui:gap-2.5 skui:text-sm skui:text-balance",
        className
      )}
      {...props}
    />
  )

})

export {
  Empty,
  EmptyHeader,
  EmptyTitle,
  EmptyDescription,
  EmptyContent,
  EmptyMedia,
}

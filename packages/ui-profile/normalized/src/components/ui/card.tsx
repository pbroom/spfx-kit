import * as React from "react"

import { cn } from "../../lib/utils"

const Card = React.forwardRef<
  React.ElementRef<"div">,
  React.PropsWithoutRef<React.ComponentProps<"div"> & { size?: "default" | "sm" }>
>(function Card({
  className,
  size = "default",
  ...props
}, ref) {
  return (
    <div
      ref={ref}
      data-slot="card"
      data-size={size}
      className={cn(
        "skui:group/card skui:flex skui:flex-col skui:gap-(--card-spacing) skui:overflow-hidden skui:rounded-xl skui:bg-card skui:py-(--card-spacing) skui:text-sm skui:text-card-foreground skui:ring-1 skui:ring-foreground/10 skui:[--card-spacing:--spacing(4)] skui:has-data-[slot=card-footer]:pb-0 skui:has-[>img:first-child]:pt-0 skui:data-[size=sm]:[--card-spacing:--spacing(3)] skui:data-[size=sm]:has-data-[slot=card-footer]:pb-0 skui:*:[img:first-child]:rounded-t-xl skui:*:[img:last-child]:rounded-b-xl",
        className
      )}
      {...props}
    />
  )

})

const CardHeader = React.forwardRef<
  React.ElementRef<"div">,
  React.PropsWithoutRef<React.ComponentProps<"div">>
>(function CardHeader({ className, ...props }, ref) {
  return (
    <div
      ref={ref}
      data-slot="card-header"
      className={cn(
        "skui:group/card-header skui:@container/card-header skui:grid skui:auto-rows-min skui:items-start skui:gap-1 skui:rounded-t-xl skui:px-(--card-spacing) skui:has-data-[slot=card-action]:grid-cols-[1fr_auto] skui:has-data-[slot=card-description]:grid-rows-[auto_auto] skui:[.skui\\:border-b]:pb-(--card-spacing)",
        className
      )}
      {...props}
    />
  )

})

const CardTitle = React.forwardRef<
  React.ElementRef<"div">,
  React.PropsWithoutRef<React.ComponentProps<"div">>
>(function CardTitle({ className, ...props }, ref) {
  return (
    <div
      ref={ref}
      data-slot="card-title"
      className={cn(
        "skui:font-heading skui:text-base skui:leading-snug skui:font-medium skui:group-data-[size=sm]/card:text-sm",
        className
      )}
      {...props}
    />
  )

})

const CardDescription = React.forwardRef<
  React.ElementRef<"div">,
  React.PropsWithoutRef<React.ComponentProps<"div">>
>(function CardDescription({ className, ...props }, ref) {
  return (
    <div
      ref={ref}
      data-slot="card-description"
      className={cn("skui:text-sm skui:text-muted-foreground", className)}
      {...props}
    />
  )

})

const CardAction = React.forwardRef<
  React.ElementRef<"div">,
  React.PropsWithoutRef<React.ComponentProps<"div">>
>(function CardAction({ className, ...props }, ref) {
  return (
    <div
      ref={ref}
      data-slot="card-action"
      className={cn(
        "skui:col-start-2 skui:row-span-2 skui:row-start-1 skui:self-start skui:justify-self-end",
        className
      )}
      {...props}
    />
  )

})

const CardContent = React.forwardRef<
  React.ElementRef<"div">,
  React.PropsWithoutRef<React.ComponentProps<"div">>
>(function CardContent({ className, ...props }, ref) {
  return (
    <div
      ref={ref}
      data-slot="card-content"
      className={cn("skui:px-(--card-spacing)", className)}
      {...props}
    />
  )

})

const CardFooter = React.forwardRef<
  React.ElementRef<"div">,
  React.PropsWithoutRef<React.ComponentProps<"div">>
>(function CardFooter({ className, ...props }, ref) {
  return (
    <div
      ref={ref}
      data-slot="card-footer"
      className={cn(
        "skui:flex skui:items-center skui:rounded-b-xl skui:border-t skui:bg-muted/50 skui:p-(--card-spacing)",
        className
      )}
      {...props}
    />
  )

})

export {
  Card,
  CardHeader,
  CardFooter,
  CardTitle,
  CardAction,
  CardDescription,
  CardContent,
}

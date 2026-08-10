"use client"

import * as React from "react"
import { Avatar as AvatarPrimitive } from "@base-ui/react/avatar"

import { cn } from "../../lib/utils"

const Avatar = React.forwardRef<
  React.ElementRef<typeof AvatarPrimitive.Root>,
  React.PropsWithoutRef<AvatarPrimitive.Root.Props & {
  size?: "default" | "sm" | "lg"
}>
>(function Avatar({
  className,
  size = "default",
  ...props
}, ref) {
  return (
    <AvatarPrimitive.Root
      ref={ref}
      data-slot="avatar"
      data-size={size}
      className={cn(
        "skui:group/avatar skui:relative skui:flex skui:size-8 skui:shrink-0 skui:rounded-full skui:select-none skui:after:absolute skui:after:inset-0 skui:after:rounded-full skui:after:border skui:after:border-border skui:after:mix-blend-darken skui:data-[size=lg]:size-10 skui:data-[size=sm]:size-6 skui:dark:after:mix-blend-lighten",
        className
      )}
      {...props}
    />
  )

})

const AvatarImage = React.forwardRef<
  React.ElementRef<typeof AvatarPrimitive.Image>,
  React.PropsWithoutRef<AvatarPrimitive.Image.Props>
>(function AvatarImage({ className, ...props }, ref) {
  return (
    <AvatarPrimitive.Image
      ref={ref}
      data-slot="avatar-image"
      className={cn(
        "skui:aspect-square skui:size-full skui:rounded-full skui:object-cover",
        className
      )}
      {...props}
    />
  )

})

const AvatarFallback = React.forwardRef<
  React.ElementRef<typeof AvatarPrimitive.Fallback>,
  React.PropsWithoutRef<AvatarPrimitive.Fallback.Props>
>(function AvatarFallback({
  className,
  ...props
}, ref) {
  return (
    <AvatarPrimitive.Fallback
      ref={ref}
      data-slot="avatar-fallback"
      className={cn(
        "skui:flex skui:size-full skui:items-center skui:justify-center skui:rounded-full skui:bg-muted skui:text-sm skui:text-muted-foreground skui:group-data-[size=sm]/avatar:text-xs",
        className
      )}
      {...props}
    />
  )

})

const AvatarBadge = React.forwardRef<
  React.ElementRef<"span">,
  React.PropsWithoutRef<React.ComponentProps<"span">>
>(function AvatarBadge({ className, ...props }, ref) {
  return (
    <span
      ref={ref}
      data-slot="avatar-badge"
      className={cn(
        "skui:absolute skui:right-0 skui:bottom-0 skui:z-10 skui:inline-flex skui:items-center skui:justify-center skui:rounded-full skui:bg-primary skui:text-primary-foreground skui:bg-blend-color skui:ring-2 skui:ring-background skui:select-none",
        "skui:group-data-[size=sm]/avatar:size-2 skui:group-data-[size=sm]/avatar:[&>svg]:hidden",
        "skui:group-data-[size=default]/avatar:size-2.5 skui:group-data-[size=default]/avatar:[&>svg]:size-2",
        "skui:group-data-[size=lg]/avatar:size-3 skui:group-data-[size=lg]/avatar:[&>svg]:size-2",
        className
      )}
      {...props}
    />
  )

})

const AvatarGroup = React.forwardRef<
  React.ElementRef<"div">,
  React.PropsWithoutRef<React.ComponentProps<"div">>
>(function AvatarGroup({ className, ...props }, ref) {
  return (
    <div
      ref={ref}
      data-slot="avatar-group"
      className={cn(
        "skui:group/avatar-group skui:flex skui:-space-x-2 skui:*:data-[slot=avatar]:ring-2 skui:*:data-[slot=avatar]:ring-background",
        className
      )}
      {...props}
    />
  )

})

const AvatarGroupCount = React.forwardRef<
  React.ElementRef<"div">,
  React.PropsWithoutRef<React.ComponentProps<"div">>
>(function AvatarGroupCount({
  className,
  ...props
}, ref) {
  return (
    <div
      ref={ref}
      data-slot="avatar-group-count"
      className={cn(
        "skui:relative skui:flex skui:size-8 skui:shrink-0 skui:items-center skui:justify-center skui:rounded-full skui:bg-muted skui:text-sm skui:text-muted-foreground skui:ring-2 skui:ring-background skui:group-has-data-[size=lg]/avatar-group:size-10 skui:group-has-data-[size=sm]/avatar-group:size-6 skui:[&>svg]:size-4 skui:group-has-data-[size=lg]/avatar-group:[&>svg]:size-5 skui:group-has-data-[size=sm]/avatar-group:[&>svg]:size-3",
        className
      )}
      {...props}
    />
  )

})

export {
  Avatar,
  AvatarImage,
  AvatarFallback,
  AvatarGroup,
  AvatarGroupCount,
  AvatarBadge,
}

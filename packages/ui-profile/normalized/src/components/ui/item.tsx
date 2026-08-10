import * as React from "react"
import { mergeProps } from "@base-ui/react/merge-props"
import { useRender } from "@base-ui/react/use-render"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "../../lib/utils"
import { Separator } from "./separator"

const ItemGroup = React.forwardRef<
  React.ElementRef<"div">,
  React.PropsWithoutRef<React.ComponentProps<"div">>
>(function ItemGroup({ className, ...props }, ref) {
  return (
    <div
      ref={ref}
      role="list"
      data-slot="item-group"
      className={cn(
        "skui:group/item-group skui:flex skui:w-full skui:flex-col skui:gap-4 skui:has-data-[size=sm]:gap-2.5 skui:has-data-[size=xs]:gap-2",
        className
      )}
      {...props}
    />
  )

})

const ItemSeparator = React.forwardRef<
  React.ElementRef<typeof Separator>,
  React.PropsWithoutRef<React.ComponentProps<typeof Separator>>
>(function ItemSeparator({
  className,
  ...props
}, ref) {
  return (
    <Separator
      ref={ref}
      data-slot="item-separator"
      orientation="horizontal"
      className={cn("skui:my-2", className)}
      {...props}
    />
  )

})

const itemVariants = cva(
  "skui:group/item skui:flex skui:w-full skui:flex-wrap skui:items-center skui:rounded-lg skui:border skui:text-sm skui:transition-colors skui:duration-100 skui:outline-none skui:focus-visible:border-ring skui:focus-visible:ring-[3px] skui:focus-visible:ring-ring/50 skui:[a]:transition-colors skui:[a]:hover:bg-muted",
  {
    variants: {
      variant: {
        default: "skui:border-transparent",
        outline: "skui:border-border",
        muted: "skui:border-transparent skui:bg-muted/50",
      },
      size: {
        default: "skui:gap-2.5 skui:px-3 skui:py-2.5",
        sm: "skui:gap-2.5 skui:px-3 skui:py-2.5",
        xs: "skui:gap-2 skui:px-2.5 skui:py-2 skui:in-data-[slot=dropdown-menu-content]:p-0",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

const Item = React.forwardRef<
  React.ElementRef<"div">,
  React.PropsWithoutRef<useRender.ComponentProps<"div"> & VariantProps<typeof itemVariants>>
>(function Item({
  className,
  variant = "default",
  size = "default",
  render,
  ...props
}, ref) {
  return useRender({
    ref,
    defaultTagName: "div",
    props: mergeProps<"div">(
      {
        className: cn(itemVariants({ variant, size, className })),
      },
      props
    ),
    render,
    state: {
      slot: "item",
      variant,
      size,
    },
  })

})

const itemMediaVariants = cva(
  "skui:flex skui:shrink-0 skui:items-center skui:justify-center skui:gap-2 skui:group-has-data-[slot=item-description]/item:translate-y-0.5 skui:group-has-data-[slot=item-description]/item:self-start skui:[&_svg]:pointer-events-none",
  {
    variants: {
      variant: {
        default: "skui:bg-transparent",
        icon: "skui:[&_svg:not([class*='size-'])]:size-4",
        image:
          "skui:size-10 skui:overflow-hidden skui:rounded-sm skui:group-data-[size=sm]/item:size-8 skui:group-data-[size=xs]/item:size-6 skui:[&_img]:size-full skui:[&_img]:object-cover",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

const ItemMedia = React.forwardRef<
  React.ElementRef<"div">,
  React.PropsWithoutRef<React.ComponentProps<"div"> & VariantProps<typeof itemMediaVariants>>
>(function ItemMedia({
  className,
  variant = "default",
  ...props
}, ref) {
  return (
    <div
      ref={ref}
      data-slot="item-media"
      data-variant={variant}
      className={cn(itemMediaVariants({ variant, className }))}
      {...props}
    />
  )

})

const ItemContent = React.forwardRef<
  React.ElementRef<"div">,
  React.PropsWithoutRef<React.ComponentProps<"div">>
>(function ItemContent({ className, ...props }, ref) {
  return (
    <div
      ref={ref}
      data-slot="item-content"
      className={cn(
        "skui:flex skui:flex-1 skui:flex-col skui:gap-1 skui:group-data-[size=xs]/item:gap-0 skui:[&+[data-slot=item-content]]:flex-none",
        className
      )}
      {...props}
    />
  )

})

const ItemTitle = React.forwardRef<
  React.ElementRef<"div">,
  React.PropsWithoutRef<React.ComponentProps<"div">>
>(function ItemTitle({ className, ...props }, ref) {
  return (
    <div
      ref={ref}
      data-slot="item-title"
      className={cn(
        "skui:line-clamp-1 skui:flex skui:w-fit skui:items-center skui:gap-2 skui:text-sm skui:leading-snug skui:font-medium skui:underline-offset-4",
        className
      )}
      {...props}
    />
  )

})

const ItemDescription = React.forwardRef<
  React.ElementRef<"p">,
  React.PropsWithoutRef<React.ComponentProps<"p">>
>(function ItemDescription({ className, ...props }, ref) {
  return (
    <p
      ref={ref}
      data-slot="item-description"
      className={cn(
        "skui:line-clamp-2 skui:text-left skui:text-sm skui:leading-normal skui:font-normal skui:text-muted-foreground skui:group-data-[size=xs]/item:text-xs skui:[&>a]:underline skui:[&>a]:underline-offset-4 skui:[&>a:hover]:text-primary",
        className
      )}
      {...props}
    />
  )

})

const ItemActions = React.forwardRef<
  React.ElementRef<"div">,
  React.PropsWithoutRef<React.ComponentProps<"div">>
>(function ItemActions({ className, ...props }, ref) {
  return (
    <div
      ref={ref}
      data-slot="item-actions"
      className={cn("skui:flex skui:items-center skui:gap-2", className)}
      {...props}
    />
  )

})

const ItemHeader = React.forwardRef<
  React.ElementRef<"div">,
  React.PropsWithoutRef<React.ComponentProps<"div">>
>(function ItemHeader({ className, ...props }, ref) {
  return (
    <div
      ref={ref}
      data-slot="item-header"
      className={cn(
        "skui:flex skui:basis-full skui:items-center skui:justify-between skui:gap-2",
        className
      )}
      {...props}
    />
  )

})

const ItemFooter = React.forwardRef<
  React.ElementRef<"div">,
  React.PropsWithoutRef<React.ComponentProps<"div">>
>(function ItemFooter({ className, ...props }, ref) {
  return (
    <div
      ref={ref}
      data-slot="item-footer"
      className={cn(
        "skui:flex skui:basis-full skui:items-center skui:justify-between skui:gap-2",
        className
      )}
      {...props}
    />
  )

})

export {
  Item,
  ItemMedia,
  ItemContent,
  ItemActions,
  ItemGroup,
  ItemSeparator,
  ItemTitle,
  ItemDescription,
  ItemHeader,
  ItemFooter,
}

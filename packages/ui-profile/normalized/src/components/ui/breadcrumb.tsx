import { ChevronRightIcon, MoreHorizontalIcon } from "lucide-react"
import * as React from "react"
import { mergeProps } from "@base-ui/react/merge-props"
import { useRender } from "@base-ui/react/use-render"

import { cn } from "../../lib/utils"

const Breadcrumb = React.forwardRef<
  React.ElementRef<"nav">,
  React.PropsWithoutRef<React.ComponentProps<"nav">>
>(function Breadcrumb({ className, ...props }, ref) {
  return (
    <nav
      ref={ref}
      aria-label="breadcrumb"
      data-slot="breadcrumb"
      className={cn(className)}
      {...props}
    />
  )

})

const BreadcrumbList = React.forwardRef<
  React.ElementRef<"ol">,
  React.PropsWithoutRef<React.ComponentProps<"ol">>
>(function BreadcrumbList({ className, ...props }, ref) {
  return (
    <ol
      ref={ref}
      data-slot="breadcrumb-list"
      className={cn(
        "skui:flex skui:flex-wrap skui:items-center skui:gap-1.5 skui:text-sm skui:wrap-break-word skui:text-muted-foreground",
        className
      )}
      {...props}
    />
  )

})

const BreadcrumbItem = React.forwardRef<
  React.ElementRef<"li">,
  React.PropsWithoutRef<React.ComponentProps<"li">>
>(function BreadcrumbItem({ className, ...props }, ref) {
  return (
    <li
      ref={ref}
      data-slot="breadcrumb-item"
      className={cn("skui:inline-flex skui:items-center skui:gap-1", className)}
      {...props}
    />
  )

})

const BreadcrumbLink = React.forwardRef<
  React.ElementRef<"a">,
  React.PropsWithoutRef<useRender.ComponentProps<"a">>
>(function BreadcrumbLink({
  className,
  render,
  ...props
}, ref) {
  return useRender({
    ref,
    defaultTagName: "a",
    props: mergeProps<"a">(
      {
        className: cn("skui:transition-colors skui:hover:text-foreground", className),
      },
      props
    ),
    render,
    state: {
      slot: "breadcrumb-link",
    },
  })

})

const BreadcrumbPage = React.forwardRef<
  React.ElementRef<"span">,
  React.PropsWithoutRef<React.ComponentProps<"span">>
>(function BreadcrumbPage({ className, ...props }, ref) {
  return (
    <span
      ref={ref}
      data-slot="breadcrumb-page"
      role="link"
      aria-disabled="true"
      aria-current="page"
      className={cn("skui:font-normal skui:text-foreground", className)}
      {...props}
    />
  )

})

const BreadcrumbSeparator = React.forwardRef<
  React.ElementRef<"li">,
  React.PropsWithoutRef<React.ComponentProps<"li">>
>(function BreadcrumbSeparator({
  children,
  className,
  ...props
}, ref) {
  return (
    <li
      ref={ref}
      data-slot="breadcrumb-separator"
      role="presentation"
      aria-hidden="true"
      className={cn("skui:[&>svg]:size-3.5", className)}
      {...props}
    >
      {children ?? (
        <ChevronRightIcon
          className=""
        />
      )}
    </li>
  )

})

const BreadcrumbEllipsis = React.forwardRef<
  React.ElementRef<"span">,
  React.PropsWithoutRef<React.ComponentProps<"span">>
>(function BreadcrumbEllipsis({
  className,
  ...props
}, ref) {
  return (
    <span
      ref={ref}
      data-slot="breadcrumb-ellipsis"
      role="presentation"
      aria-hidden="true"
      className={cn(
        "skui:flex skui:size-5 skui:items-center skui:justify-center skui:[&>svg]:size-4",
        className
      )}
      {...props}
    >
      <MoreHorizontalIcon />
      <span className="skui:sr-only">More</span>
    </span>
  )

})

export {
  Breadcrumb,
  BreadcrumbList,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbPage,
  BreadcrumbSeparator,
  BreadcrumbEllipsis,
}

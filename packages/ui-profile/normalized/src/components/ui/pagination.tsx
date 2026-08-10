import { ChevronLeftIcon, ChevronRightIcon, MoreHorizontalIcon } from "lucide-react"
import * as React from "react"

import { cn } from "../../lib/utils"
import { Button } from "./button"

const Pagination = React.forwardRef<
  React.ElementRef<"nav">,
  React.PropsWithoutRef<React.ComponentProps<"nav">>
>(function Pagination({ className, ...props }, ref) {
  return (
    <nav
      ref={ref}
      role="navigation"
      aria-label="pagination"
      data-slot="pagination"
      className={cn("skui:mx-auto skui:flex skui:w-full skui:justify-center", className)}
      {...props}
    />
  )

})

const PaginationContent = React.forwardRef<
  React.ElementRef<"ul">,
  React.PropsWithoutRef<React.ComponentProps<"ul">>
>(function PaginationContent({
  className,
  ...props
}, ref) {
  return (
    <ul
      ref={ref}
      data-slot="pagination-content"
      className={cn("skui:flex skui:items-center skui:gap-0.5", className)}
      {...props}
    />
  )

})

const PaginationItem = React.forwardRef<
  React.ElementRef<"li">,
  React.PropsWithoutRef<React.ComponentProps<"li">>
>(function PaginationItem({ ...props }, ref) {
  return <li
    ref={ref} data-slot="pagination-item" {...props} />

})

type PaginationLinkProps = {
  isActive?: boolean
} & Pick<React.ComponentProps<typeof Button>, "size"> &
  React.ComponentProps<"a">

const PaginationLink = React.forwardRef<
  React.ElementRef<"a">,
  React.PropsWithoutRef<PaginationLinkProps>
>(function PaginationLink({
  className,
  isActive,
  size = "icon",
  ...props
}, ref) {
  return (
    <Button
      variant={isActive ? "outline" : "ghost"}
      size={size}
      className={cn(className)}
      nativeButton={false}
      render={
        <a
          ref={ref}
          aria-current={isActive ? "page" : undefined}
          data-slot="pagination-link"
          data-active={isActive}
          {...props}
        />
      }
    />
  )

})

const PaginationPrevious = React.forwardRef<
  React.ElementRef<typeof PaginationLink>,
  React.PropsWithoutRef<React.ComponentProps<typeof PaginationLink> & { text?: string }>
>(function PaginationPrevious({
  className,
  text = "Previous",
  ...props
}, ref) {
  return (
    <PaginationLink
      ref={ref}
      aria-label="Go to previous page"
      size="default"
      className={cn("skui:pl-1.5!", className)}
      {...props}
    >
      <ChevronLeftIcon
        data-icon="inline-start"
        className=""
      />
      <span className="skui:hidden skui:sm:block">{text}</span>
    </PaginationLink>
  )

})

const PaginationNext = React.forwardRef<
  React.ElementRef<typeof PaginationLink>,
  React.PropsWithoutRef<React.ComponentProps<typeof PaginationLink> & { text?: string }>
>(function PaginationNext({
  className,
  text = "Next",
  ...props
}, ref) {
  return (
    <PaginationLink
      ref={ref}
      aria-label="Go to next page"
      size="default"
      className={cn("skui:pr-1.5!", className)}
      {...props}
    >
      <span className="skui:hidden skui:sm:block">{text}</span>
      <ChevronRightIcon
        data-icon="inline-end"
        className=""
      />
    </PaginationLink>
  )

})

const PaginationEllipsis = React.forwardRef<
  React.ElementRef<"span">,
  React.PropsWithoutRef<React.ComponentProps<"span">>
>(function PaginationEllipsis({
  className,
  ...props
}, ref) {
  return (
    <span
      ref={ref}
      aria-hidden
      data-slot="pagination-ellipsis"
      className={cn(
        "skui:flex skui:size-8 skui:items-center skui:justify-center skui:[&_svg:not([class*='size-'])]:size-4",
        className
      )}
      {...props}
    >
      <MoreHorizontalIcon />
      <span className="skui:sr-only">More pages</span>
    </span>
  )

})

export {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
}

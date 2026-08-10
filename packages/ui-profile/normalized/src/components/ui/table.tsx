"use client"

import * as React from "react"

import { cn } from "../../lib/utils"

const Table = React.forwardRef<
  React.ElementRef<"table">,
  React.PropsWithoutRef<React.ComponentProps<"table">>
>(function Table({ className, ...props }, ref) {
  return (
    <div
      data-slot="table-container"
      className="skui:relative skui:w-full skui:overflow-x-auto"
    >
      <table
        ref={ref}
        data-slot="table"
        className={cn("skui:w-full skui:caption-bottom skui:text-sm", className)}
        {...props}
      />
    </div>
  )

})

const TableHeader = React.forwardRef<
  React.ElementRef<"thead">,
  React.PropsWithoutRef<React.ComponentProps<"thead">>
>(function TableHeader({ className, ...props }, ref) {
  return (
    <thead
      ref={ref}
      data-slot="table-header"
      className={cn("skui:[&_tr]:border-b", className)}
      {...props}
    />
  )

})

const TableBody = React.forwardRef<
  React.ElementRef<"tbody">,
  React.PropsWithoutRef<React.ComponentProps<"tbody">>
>(function TableBody({ className, ...props }, ref) {
  return (
    <tbody
      ref={ref}
      data-slot="table-body"
      className={cn("skui:[&_tr:last-child]:border-0", className)}
      {...props}
    />
  )

})

const TableFooter = React.forwardRef<
  React.ElementRef<"tfoot">,
  React.PropsWithoutRef<React.ComponentProps<"tfoot">>
>(function TableFooter({ className, ...props }, ref) {
  return (
    <tfoot
      ref={ref}
      data-slot="table-footer"
      className={cn(
        "skui:border-t skui:bg-muted/50 skui:font-medium skui:[&>tr]:last:border-b-0",
        className
      )}
      {...props}
    />
  )

})

const TableRow = React.forwardRef<
  React.ElementRef<"tr">,
  React.PropsWithoutRef<React.ComponentProps<"tr">>
>(function TableRow({ className, ...props }, ref) {
  return (
    <tr
      ref={ref}
      data-slot="table-row"
      className={cn(
        "skui:border-b skui:transition-colors skui:hover:bg-muted/50 skui:has-aria-expanded:bg-muted/50 skui:data-[state=selected]:bg-muted",
        className
      )}
      {...props}
    />
  )

})

const TableHead = React.forwardRef<
  React.ElementRef<"th">,
  React.PropsWithoutRef<React.ComponentProps<"th">>
>(function TableHead({ className, ...props }, ref) {
  return (
    <th
      ref={ref}
      data-slot="table-head"
      className={cn(
        "skui:h-10 skui:px-2 skui:text-left skui:align-middle skui:font-medium skui:whitespace-nowrap skui:text-foreground skui:[&:has([role=checkbox])]:pr-0",
        className
      )}
      {...props}
    />
  )

})

const TableCell = React.forwardRef<
  React.ElementRef<"td">,
  React.PropsWithoutRef<React.ComponentProps<"td">>
>(function TableCell({ className, ...props }, ref) {
  return (
    <td
      ref={ref}
      data-slot="table-cell"
      className={cn(
        "skui:p-2 skui:align-middle skui:whitespace-nowrap skui:[&:has([role=checkbox])]:pr-0",
        className
      )}
      {...props}
    />
  )

})

const TableCaption = React.forwardRef<
  React.ElementRef<"caption">,
  React.PropsWithoutRef<React.ComponentProps<"caption">>
>(function TableCaption({
  className,
  ...props
}, ref) {
  return (
    <caption
      ref={ref}
      data-slot="table-caption"
      className={cn("skui:mt-4 skui:text-sm skui:text-muted-foreground", className)}
      {...props}
    />
  )

})

export {
  Table,
  TableHeader,
  TableBody,
  TableFooter,
  TableHead,
  TableRow,
  TableCell,
  TableCaption,
}

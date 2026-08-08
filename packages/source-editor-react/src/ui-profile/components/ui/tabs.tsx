"use client"

import * as React from "react"
import { Tabs as TabsPrimitive } from "@base-ui/react/tabs"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "../../lib/utils"

const Tabs = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Root>,
  React.PropsWithoutRef<TabsPrimitive.Root.Props>
>(function Tabs({
  className,
  orientation = "horizontal",
  ...props
}, ref) {
  return (
    <TabsPrimitive.Root
      ref={ref}
      data-slot="tabs"
      data-orientation={orientation}
      className={cn(
        "skui:group/tabs skui:flex skui:gap-2 skui:data-horizontal:flex-col",
        className
      )}
      {...props}
    />
  )

})

const tabsListVariants = cva(
  "skui:group/tabs-list skui:inline-flex skui:w-fit skui:items-center skui:justify-center skui:rounded-lg skui:p-[3px] skui:text-muted-foreground skui:group-data-horizontal/tabs:h-8 skui:group-data-vertical/tabs:h-fit skui:group-data-vertical/tabs:flex-col skui:data-[variant=line]:rounded-none",
  {
    variants: {
      variant: {
        default: "skui:bg-muted",
        line: "skui:gap-1 skui:bg-transparent",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

const TabsList = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.List>,
  React.PropsWithoutRef<TabsPrimitive.List.Props & VariantProps<typeof tabsListVariants>>
>(function TabsList({
  className,
  variant = "default",
  ...props
}, ref) {
  return (
    <TabsPrimitive.List
      ref={ref}
      data-slot="tabs-list"
      data-variant={variant}
      className={cn(tabsListVariants({ variant }), className)}
      {...props}
    />
  )

})

const TabsTrigger = React.forwardRef<
  HTMLButtonElement,
  React.PropsWithoutRef<TabsPrimitive.Tab.Props>
>(function TabsTrigger({ className, ...props }, ref) {
  return (
    <TabsPrimitive.Tab
      ref={ref}
      data-slot="tabs-trigger"
      className={cn(
        "skui:relative skui:inline-flex skui:h-[calc(100%-1px)] skui:flex-1 skui:items-center skui:justify-center skui:gap-1.5 skui:rounded-md skui:border skui:border-transparent skui:px-1.5 skui:py-0.5 skui:text-sm skui:font-medium skui:whitespace-nowrap skui:text-foreground/60 skui:transition-all skui:group-data-vertical/tabs:w-full skui:group-data-vertical/tabs:justify-start skui:hover:text-foreground skui:focus-visible:border-ring skui:focus-visible:ring-[3px] skui:focus-visible:ring-ring/50 skui:focus-visible:outline-1 skui:focus-visible:outline-ring skui:disabled:pointer-events-none skui:disabled:opacity-50 skui:has-data-[icon=inline-end]:pr-1 skui:has-data-[icon=inline-start]:pl-1 skui:aria-disabled:pointer-events-none skui:aria-disabled:opacity-50 skui:dark:text-muted-foreground skui:dark:hover:text-foreground skui:group-data-[variant=default]/tabs-list:data-active:shadow-sm skui:group-data-[variant=line]/tabs-list:data-active:shadow-none skui:[&_svg]:pointer-events-none skui:[&_svg]:shrink-0 skui:[&_svg:not([class*='size-'])]:size-4",
        "skui:group-data-[variant=line]/tabs-list:bg-transparent skui:group-data-[variant=line]/tabs-list:data-active:bg-transparent skui:dark:group-data-[variant=line]/tabs-list:data-active:border-transparent skui:dark:group-data-[variant=line]/tabs-list:data-active:bg-transparent",
        "skui:data-active:bg-background skui:data-active:text-foreground skui:dark:data-active:border-input skui:dark:data-active:bg-input/30 skui:dark:data-active:text-foreground",
        "skui:after:absolute skui:after:bg-foreground skui:after:opacity-0 skui:after:transition-opacity skui:group-data-horizontal/tabs:after:inset-x-0 skui:group-data-horizontal/tabs:after:bottom-[-5px] skui:group-data-horizontal/tabs:after:h-0.5 skui:group-data-vertical/tabs:after:inset-y-0 skui:group-data-vertical/tabs:after:-right-1 skui:group-data-vertical/tabs:after:w-0.5 skui:group-data-[variant=line]/tabs-list:data-active:after:opacity-100",
        className
      )}
      {...props}
    />
  )

})

const TabsContent = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Panel>,
  React.PropsWithoutRef<TabsPrimitive.Panel.Props>
>(function TabsContent({ className, ...props }, ref) {
  return (
    <TabsPrimitive.Panel
      ref={ref}
      data-slot="tabs-content"
      className={cn("skui:flex-1 skui:text-sm skui:outline-none", className)}
      {...props}
    />
  )

})

export { Tabs, TabsList, TabsTrigger, TabsContent, tabsListVariants }

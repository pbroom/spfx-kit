import * as React from "react"
import { ChevronDownIcon, ChevronUpIcon } from "lucide-react"
import { Accordion as AccordionPrimitive } from "@base-ui/react/accordion"

import { cn } from "../../lib/utils"

const Accordion = React.forwardRef<
  React.ElementRef<typeof AccordionPrimitive.Root>,
  React.PropsWithoutRef<AccordionPrimitive.Root.Props>
>(function Accordion({ className, ...props }, ref) {
  return (
    <AccordionPrimitive.Root
      ref={ref}
      data-slot="accordion"
      className={cn("skui:flex skui:w-full skui:flex-col", className)}
      {...props}
    />
  )

})

const AccordionItem = React.forwardRef<
  React.ElementRef<typeof AccordionPrimitive.Item>,
  React.PropsWithoutRef<AccordionPrimitive.Item.Props>
>(function AccordionItem({ className, ...props }, ref) {
  return (
    <AccordionPrimitive.Item
      ref={ref}
      data-slot="accordion-item"
      className={cn("skui:not-last:border-b", className)}
      {...props}
    />
  )

})

const AccordionTrigger = React.forwardRef<
  HTMLButtonElement,
  React.PropsWithoutRef<AccordionPrimitive.Trigger.Props>
>(function AccordionTrigger({
  className,
  children,
  ...props
}, ref) {
  return (
    <AccordionPrimitive.Header className="skui:flex">
      <AccordionPrimitive.Trigger
        ref={ref}
        data-slot="accordion-trigger"
        className={cn(
          "skui:group/accordion-trigger skui:relative skui:flex skui:flex-1 skui:items-start skui:justify-between skui:rounded-lg skui:border skui:border-transparent skui:py-2.5 skui:text-left skui:text-sm skui:font-medium skui:transition-all skui:outline-none skui:hover:underline skui:focus-visible:border-ring skui:focus-visible:ring-3 skui:focus-visible:ring-ring/50 skui:focus-visible:after:border-ring skui:aria-disabled:pointer-events-none skui:aria-disabled:opacity-50 skui:**:data-[slot=accordion-trigger-icon]:ml-auto skui:**:data-[slot=accordion-trigger-icon]:size-4 skui:**:data-[slot=accordion-trigger-icon]:text-muted-foreground",
          className
        )}
        {...props}
      >
        {children}
        <ChevronDownIcon
          data-slot="accordion-trigger-icon"
          className="skui:pointer-events-none skui:shrink-0 skui:group-aria-expanded/accordion-trigger:hidden"
        />
        <ChevronUpIcon
          data-slot="accordion-trigger-icon"
          className="skui:pointer-events-none skui:hidden skui:shrink-0 skui:group-aria-expanded/accordion-trigger:inline"
        />
      </AccordionPrimitive.Trigger>
    </AccordionPrimitive.Header>
  )

})

const AccordionContent = React.forwardRef<
  React.ElementRef<typeof AccordionPrimitive.Panel>,
  React.PropsWithoutRef<AccordionPrimitive.Panel.Props>
>(function AccordionContent({
  className,
  children,
  ...props
}, ref) {
  return (
    <AccordionPrimitive.Panel
      ref={ref}
      data-slot="accordion-content"
      className="skui:overflow-hidden skui:text-sm skui:data-open:animate-accordion-down skui:data-closed:animate-accordion-up"
      {...props}
    >
      <div
        className={cn(
          "skui:h-(--accordion-panel-height) skui:pt-0 skui:pb-2.5 skui:data-ending-style:h-0 skui:data-starting-style:h-0 skui:[&_a]:underline skui:[&_a]:underline-offset-3 skui:[&_a]:hover:text-foreground skui:[&_p:not(:last-child)]:mb-4",
          className
        )}
      >
        {children}
      </div>
    </AccordionPrimitive.Panel>
  )

})

export { Accordion, AccordionItem, AccordionTrigger, AccordionContent }

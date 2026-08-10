"use client"

import * as React from "react"
import { Radio as RadioPrimitive } from "@base-ui/react/radio"
import { RadioGroup as RadioGroupPrimitive } from "@base-ui/react/radio-group"

import { cn } from "../../lib/utils"

const RadioGroup = React.forwardRef<
  React.ElementRef<typeof RadioGroupPrimitive>,
  React.PropsWithoutRef<RadioGroupPrimitive.Props>
>(function RadioGroup({ className, ...props }, ref) {
  return (
    <RadioGroupPrimitive
      ref={ref}
      data-slot="radio-group"
      className={cn("skui:grid skui:w-full skui:gap-2", className)}
      {...props}
    />
  )

})

const RadioGroupItem = React.forwardRef<
  React.ElementRef<typeof RadioPrimitive.Root>,
  React.PropsWithoutRef<RadioPrimitive.Root.Props>
>(function RadioGroupItem({ className, ...props }, ref) {
  return (
    <RadioPrimitive.Root
      ref={ref}
      data-slot="radio-group-item"
      className={cn(
        "skui:group/radio-group-item skui:peer skui:relative skui:flex skui:aspect-square skui:size-4 skui:shrink-0 skui:rounded-full skui:border skui:border-input skui:outline-none skui:after:absolute skui:after:-inset-x-3 skui:after:-inset-y-2 skui:focus-visible:border-ring skui:focus-visible:ring-3 skui:focus-visible:ring-ring/50 skui:disabled:cursor-not-allowed skui:disabled:opacity-50 skui:aria-invalid:border-destructive skui:aria-invalid:ring-3 skui:aria-invalid:ring-destructive/20 skui:aria-invalid:aria-checked:border-primary skui:dark:bg-input/30 skui:dark:aria-invalid:border-destructive/50 skui:dark:aria-invalid:ring-destructive/40 skui:data-checked:border-primary skui:data-checked:bg-primary skui:data-checked:text-primary-foreground skui:dark:data-checked:bg-primary",
        className
      )}
      {...props}
    >
      <RadioPrimitive.Indicator
        data-slot="radio-group-indicator"
        className="skui:flex skui:size-4 skui:items-center skui:justify-center"
      >
        <span className="skui:absolute skui:top-1/2 skui:left-1/2 skui:size-2 skui:-translate-x-1/2 skui:-translate-y-1/2 skui:rounded-full skui:bg-primary-foreground" />
      </RadioPrimitive.Indicator>
    </RadioPrimitive.Root>
  )

})

export { RadioGroup, RadioGroupItem }

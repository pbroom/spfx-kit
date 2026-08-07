"use client"

import * as React from "react"
import { CheckIcon } from "lucide-react"
import { Checkbox as CheckboxPrimitive } from "@base-ui/react/checkbox"

import { cn } from "../../lib/utils"

const Checkbox = React.forwardRef<
  HTMLElement,
  React.PropsWithoutRef<CheckboxPrimitive.Root.Props>
>(function Checkbox({ className, ...props }, ref) {
  return (
    <CheckboxPrimitive.Root
      ref={ref}
      data-slot="checkbox"
      className={cn(
        "skui:peer skui:relative skui:flex skui:size-4 skui:shrink-0 skui:items-center skui:justify-center skui:rounded-[4px] skui:border skui:border-input skui:transition-colors skui:outline-none skui:group-has-disabled/field:opacity-50 skui:after:absolute skui:after:-inset-x-3 skui:after:-inset-y-2 skui:focus-visible:border-ring skui:focus-visible:ring-3 skui:focus-visible:ring-ring/50 skui:disabled:cursor-not-allowed skui:disabled:opacity-50 skui:aria-invalid:border-destructive skui:aria-invalid:ring-3 skui:aria-invalid:ring-destructive/20 skui:aria-invalid:aria-checked:border-primary skui:dark:bg-input/30 skui:dark:aria-invalid:border-destructive/50 skui:dark:aria-invalid:ring-destructive/40 skui:data-checked:border-primary skui:data-checked:bg-primary skui:data-checked:text-primary-foreground skui:dark:data-checked:bg-primary",
        className
      )}
      {...props}
    >
      <CheckboxPrimitive.Indicator
        data-slot="checkbox-indicator"
        className="skui:grid skui:place-content-center skui:text-current skui:transition-none skui:[&>svg]:size-3.5"
      >
        <CheckIcon />
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  )

})

export { Checkbox }

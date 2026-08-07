"use client"

import * as React from "react"
import { Switch as SwitchPrimitive } from "@base-ui/react/switch"

import { cn } from "../../lib/utils"

const Switch = React.forwardRef<
  HTMLElement,
  React.PropsWithoutRef<SwitchPrimitive.Root.Props & {
  size?: "sm" | "default"
}>
>(function Switch({
  className,
  size = "default",
  ...props
}, ref) {
  return (
    <SwitchPrimitive.Root
      ref={ref}
      data-slot="switch"
      data-size={size}
      className={cn(
        "skui:peer skui:group/switch skui:relative skui:inline-flex skui:shrink-0 skui:items-center skui:rounded-full skui:border skui:border-transparent skui:transition-all skui:outline-none skui:after:absolute skui:after:-inset-x-3 skui:after:-inset-y-2 skui:focus-visible:border-ring skui:focus-visible:ring-3 skui:focus-visible:ring-ring/50 skui:aria-invalid:border-destructive skui:aria-invalid:ring-3 skui:aria-invalid:ring-destructive/20 skui:data-[size=default]:h-[18.4px] skui:data-[size=default]:w-[32px] skui:data-[size=sm]:h-[14px] skui:data-[size=sm]:w-[24px] skui:dark:aria-invalid:border-destructive/50 skui:dark:aria-invalid:ring-destructive/40 skui:data-checked:bg-primary skui:data-unchecked:bg-input skui:dark:data-unchecked:bg-input/80 skui:data-disabled:cursor-not-allowed skui:data-disabled:opacity-50",
        className
      )}
      {...props}
    >
      <SwitchPrimitive.Thumb
        data-slot="switch-thumb"
        className="skui:pointer-events-none skui:block skui:rounded-full skui:bg-background skui:ring-0 skui:transition-transform skui:group-data-[size=default]/switch:size-4 skui:group-data-[size=sm]/switch:size-3 skui:group-data-[size=default]/switch:data-checked:translate-x-[calc(100%-2px)] skui:group-data-[size=sm]/switch:data-checked:translate-x-[calc(100%-2px)] skui:dark:data-checked:bg-primary-foreground skui:group-data-[size=default]/switch:data-unchecked:translate-x-0 skui:group-data-[size=sm]/switch:data-unchecked:translate-x-0 skui:dark:data-unchecked:bg-foreground"
      />
    </SwitchPrimitive.Root>
  )

})

export { Switch }

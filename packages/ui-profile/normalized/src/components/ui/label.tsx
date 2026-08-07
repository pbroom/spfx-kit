"use client"

import * as React from "react"

import { cn } from "../../lib/utils"

const Label = React.forwardRef<
  React.ElementRef<"label">,
  React.PropsWithoutRef<React.ComponentProps<"label">>
>(function Label({ className, ...props }, ref) {
  return (
    <label
      ref={ref}
      data-slot="label"
      className={cn(
        "skui:flex skui:items-center skui:gap-2 skui:text-sm skui:leading-none skui:font-medium skui:select-none skui:group-data-[disabled=true]:pointer-events-none skui:group-data-[disabled=true]:opacity-50 skui:peer-disabled:cursor-not-allowed skui:peer-disabled:opacity-50",
        className
      )}
      {...props}
    />
  )

})

export { Label }

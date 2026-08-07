import * as React from "react"
import { Input as InputPrimitive } from "@base-ui/react/input"

import { cn } from "../../lib/utils"

const Input = React.forwardRef<
  React.ElementRef<"input">,
  React.PropsWithoutRef<React.ComponentProps<"input">>
>(function Input({ className, type, ...props }, ref) {
  return (
    <InputPrimitive
      ref={ref}
      type={type}
      data-slot="input"
      className={cn(
        "skui:h-8 skui:w-full skui:min-w-0 skui:rounded-lg skui:border skui:border-input skui:bg-transparent skui:px-2.5 skui:py-1 skui:text-base skui:transition-colors skui:outline-none skui:file:inline-flex skui:file:h-6 skui:file:border-0 skui:file:bg-transparent skui:file:text-sm skui:file:font-medium skui:file:text-foreground skui:placeholder:text-muted-foreground skui:focus-visible:border-ring skui:focus-visible:ring-3 skui:focus-visible:ring-ring/50 skui:disabled:pointer-events-none skui:disabled:cursor-not-allowed skui:disabled:bg-input/50 skui:disabled:opacity-50 skui:aria-invalid:border-destructive skui:aria-invalid:ring-3 skui:aria-invalid:ring-destructive/20 skui:md:text-sm skui:dark:bg-input/30 skui:dark:disabled:bg-input/80 skui:dark:aria-invalid:border-destructive/50 skui:dark:aria-invalid:ring-destructive/40",
        className
      )}
      {...props}
    />
  )

})

export { Input }

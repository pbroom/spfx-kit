import * as React from "react"

import { cn } from "../../lib/utils"

const Textarea = React.forwardRef<
  React.ElementRef<"textarea">,
  React.PropsWithoutRef<React.ComponentProps<"textarea">>
>(function Textarea({ className, ...props }, ref) {
  return (
    <textarea
      ref={ref}
      data-slot="textarea"
      className={cn(
        "skui:flex skui:field-sizing-content skui:min-h-16 skui:w-full skui:rounded-lg skui:border skui:border-input skui:bg-transparent skui:px-2.5 skui:py-2 skui:text-base skui:transition-colors skui:outline-none skui:placeholder:text-muted-foreground skui:focus-visible:border-ring skui:focus-visible:ring-3 skui:focus-visible:ring-ring/50 skui:disabled:cursor-not-allowed skui:disabled:bg-input/50 skui:disabled:opacity-50 skui:aria-invalid:border-destructive skui:aria-invalid:ring-3 skui:aria-invalid:ring-destructive/20 skui:md:text-sm skui:dark:bg-input/30 skui:dark:disabled:bg-input/80 skui:dark:aria-invalid:border-destructive/50 skui:dark:aria-invalid:ring-destructive/40",
        className
      )}
      {...props}
    />
  )

})

export { Textarea }

import * as React from "react"
import { cn } from "../../lib/utils"

const Kbd = React.forwardRef<
  React.ElementRef<"kbd">,
  React.PropsWithoutRef<React.ComponentProps<"kbd">>
>(function Kbd({ className, ...props }, ref) {
  return (
    <kbd
      ref={ref}
      data-slot="kbd"
      className={cn(
        "skui:pointer-events-none skui:inline-flex skui:h-5 skui:w-fit skui:min-w-5 skui:items-center skui:justify-center skui:gap-1 skui:rounded-sm skui:bg-muted skui:px-1 skui:font-sans skui:text-xs skui:font-medium skui:text-muted-foreground skui:select-none skui:in-data-[slot=tooltip-content]:bg-background/20 skui:in-data-[slot=tooltip-content]:text-background skui:dark:in-data-[slot=tooltip-content]:bg-background/10 skui:[&_svg:not([class*='size-'])]:size-3",
        className
      )}
      {...props}
    />
  )

})

const KbdGroup = React.forwardRef<
  React.ElementRef<"div">,
  React.PropsWithoutRef<React.ComponentProps<"div">>
>(function KbdGroup({ className, ...props }, ref) {
  return (
    <kbd
      ref={ref}
      data-slot="kbd-group"
      className={cn("skui:inline-flex skui:items-center skui:gap-1", className)}
      {...props}
    />
  )

})

export { Kbd, KbdGroup }

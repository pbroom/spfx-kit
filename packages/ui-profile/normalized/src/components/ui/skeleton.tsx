import * as React from "react"
import { cn } from "../../lib/utils"

const Skeleton = React.forwardRef<
  React.ElementRef<"div">,
  React.PropsWithoutRef<React.ComponentProps<"div">>
>(function Skeleton({ className, ...props }, ref) {
  return (
    <div
      ref={ref}
      data-slot="skeleton"
      className={cn("skui:animate-pulse skui:rounded-md skui:bg-muted", className)}
      {...props}
    />
  )

})

export { Skeleton }

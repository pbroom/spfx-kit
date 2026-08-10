import * as React from "react"
import { cn } from "../../lib/utils"

const AspectRatio = React.forwardRef<
  React.ElementRef<"div">,
  React.PropsWithoutRef<React.ComponentProps<"div"> & { ratio: number }>
>(function AspectRatio({
  ratio,
  className,
  ...props
}, ref) {
  return (
    <div
      ref={ref}
      data-slot="aspect-ratio"
      style={
        {
          "--ratio": ratio,
        } as React.CSSProperties
      }
      className={cn("skui:relative skui:aspect-(--ratio)", className)}
      {...props}
    />
  )

})

export { AspectRatio }

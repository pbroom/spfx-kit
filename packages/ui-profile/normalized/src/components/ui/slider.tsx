import * as React from "react"
import { Slider as SliderPrimitive } from "@base-ui/react/slider"

import { cn } from "../../lib/utils"

const Slider = React.forwardRef<
  React.ElementRef<typeof SliderPrimitive.Root>,
  React.PropsWithoutRef<SliderPrimitive.Root.Props>
>(function Slider({
  className,
  defaultValue,
  value,
  min = 0,
  max = 100,
  ...props
}, ref) {
  const _values = Array.isArray(value)
    ? value
    : Array.isArray(defaultValue)
      ? defaultValue
      : [min, max]

  return (
    <SliderPrimitive.Root
      ref={ref}
      className={cn("skui:data-horizontal:w-full skui:data-vertical:h-full", className)}
      data-slot="slider"
      defaultValue={defaultValue}
      value={value}
      min={min}
      max={max}
      thumbAlignment="edge"
      {...props}
    >
      <SliderPrimitive.Control className="skui:relative skui:flex skui:w-full skui:touch-none skui:items-center skui:select-none skui:data-disabled:opacity-50 skui:data-vertical:h-full skui:data-vertical:min-h-40 skui:data-vertical:w-auto skui:data-vertical:flex-col">
        <SliderPrimitive.Track
          data-slot="slider-track"
          className="skui:relative skui:grow skui:overflow-hidden skui:rounded-full skui:bg-muted skui:select-none skui:data-horizontal:h-1 skui:data-horizontal:w-full skui:data-vertical:h-full skui:data-vertical:w-1"
        >
          <SliderPrimitive.Indicator
            data-slot="slider-range"
            className="skui:bg-primary skui:select-none skui:data-horizontal:h-full skui:data-vertical:w-full"
          />
        </SliderPrimitive.Track>
        {Array.from({ length: _values.length }, (_, index) => (
          <SliderPrimitive.Thumb
            data-slot="slider-thumb"
            key={index}
            className="skui:relative skui:block skui:size-3 skui:shrink-0 skui:rounded-full skui:border skui:border-ring skui:bg-white skui:ring-ring/50 skui:transition-[color,box-shadow] skui:select-none skui:after:absolute skui:after:-inset-2 skui:hover:ring-3 skui:focus-visible:ring-3 skui:focus-visible:outline-hidden skui:active:ring-3 skui:disabled:pointer-events-none skui:disabled:opacity-50"
          />
        ))}
      </SliderPrimitive.Control>
    </SliderPrimitive.Root>
  )

})

export { Slider }

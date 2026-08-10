"use client"

import * as React from "react"
import { Progress as ProgressPrimitive } from "@base-ui/react/progress"

import { cn } from "../../lib/utils"

const Progress = React.forwardRef<
  React.ElementRef<typeof ProgressPrimitive.Root>,
  React.PropsWithoutRef<ProgressPrimitive.Root.Props>
>(function Progress({
  className,
  children,
  value,
  ...props
}, ref) {
  return (
    <ProgressPrimitive.Root
      ref={ref}
      value={value}
      data-slot="progress"
      className={cn("skui:flex skui:flex-wrap skui:gap-3", className)}
      {...props}
    >
      {children}
      <ProgressTrack>
        <ProgressIndicator />
      </ProgressTrack>
    </ProgressPrimitive.Root>
  )

})

const ProgressTrack = React.forwardRef<
  React.ElementRef<typeof ProgressPrimitive.Track>,
  React.PropsWithoutRef<ProgressPrimitive.Track.Props>
>(function ProgressTrack({ className, ...props }, ref) {
  return (
    <ProgressPrimitive.Track
      ref={ref}
      className={cn(
        "skui:relative skui:flex skui:h-1 skui:w-full skui:items-center skui:overflow-x-hidden skui:rounded-full skui:bg-muted",
        className
      )}
      data-slot="progress-track"
      {...props}
    />
  )

})

const ProgressIndicator = React.forwardRef<
  React.ElementRef<typeof ProgressPrimitive.Indicator>,
  React.PropsWithoutRef<ProgressPrimitive.Indicator.Props>
>(function ProgressIndicator({
  className,
  ...props
}, ref) {
  return (
    <ProgressPrimitive.Indicator
      ref={ref}
      data-slot="progress-indicator"
      className={cn("skui:h-full skui:bg-primary skui:transition-all", className)}
      {...props}
    />
  )

})

const ProgressLabel = React.forwardRef<
  React.ElementRef<typeof ProgressPrimitive.Label>,
  React.PropsWithoutRef<ProgressPrimitive.Label.Props>
>(function ProgressLabel({ className, ...props }, ref) {
  return (
    <ProgressPrimitive.Label
      ref={ref}
      className={cn("skui:text-sm skui:font-medium", className)}
      data-slot="progress-label"
      {...props}
    />
  )

})

const ProgressValue = React.forwardRef<
  React.ElementRef<typeof ProgressPrimitive.Value>,
  React.PropsWithoutRef<ProgressPrimitive.Value.Props>
>(function ProgressValue({ className, ...props }, ref) {
  return (
    <ProgressPrimitive.Value
      ref={ref}
      className={cn(
        "skui:ml-auto skui:text-sm skui:text-muted-foreground skui:tabular-nums",
        className
      )}
      data-slot="progress-value"
      {...props}
    />
  )

})

export {
  Progress,
  ProgressTrack,
  ProgressIndicator,
  ProgressLabel,
  ProgressValue,
}

"use client"

import * as React from "react"
import { Toggle as TogglePrimitive } from "@base-ui/react/toggle"
import { ToggleGroup as ToggleGroupPrimitive } from "@base-ui/react/toggle-group"
import { type VariantProps } from "class-variance-authority"

import { cn } from "../../lib/utils"
import { toggleVariants } from "./toggle"

const ToggleGroupContext = React.createContext<
  VariantProps<typeof toggleVariants> & {
    spacing?: number
    orientation?: "horizontal" | "vertical"
  }
>({
  size: "default",
  variant: "default",
  spacing: 2,
  orientation: "horizontal",
})

const ToggleGroup = React.forwardRef<
  React.ElementRef<typeof ToggleGroupPrimitive>,
  React.PropsWithoutRef<ToggleGroupPrimitive.Props &
  VariantProps<typeof toggleVariants> & {
    spacing?: number
    orientation?: "horizontal" | "vertical"
  }>
>(function ToggleGroup({
  className,
  variant,
  size,
  spacing = 2,
  orientation = "horizontal",
  children,
  ...props
}, ref) {
  return (
    <ToggleGroupPrimitive
      ref={ref}
      data-slot="toggle-group"
      data-variant={variant}
      data-size={size}
      data-spacing={spacing}
      data-orientation={orientation}
      style={{ "--gap": spacing } as React.CSSProperties}
      className={cn(
        "skui:group/toggle-group skui:flex skui:w-fit skui:flex-row skui:items-center skui:gap-[--spacing(var(--gap))] skui:rounded-lg skui:data-[size=sm]:rounded-[min(var(--radius-md),10px)] skui:data-vertical:flex-col skui:data-vertical:items-stretch",
        className
      )}
      {...props}
    >
      <ToggleGroupContext.Provider
        value={{ variant, size, spacing, orientation }}
      >
        {children}
      </ToggleGroupContext.Provider>
    </ToggleGroupPrimitive>
  )

})

const ToggleGroupItem = React.forwardRef<
  HTMLButtonElement,
  React.PropsWithoutRef<TogglePrimitive.Props & VariantProps<typeof toggleVariants>>
>(function ToggleGroupItem({
  className,
  children,
  variant = "default",
  size = "default",
  ...props
}, ref) {
  const context = React.useContext(ToggleGroupContext)

  return (
    <TogglePrimitive
      ref={ref}
      data-slot="toggle-group-item"
      data-variant={context.variant || variant}
      data-size={context.size || size}
      data-spacing={context.spacing}
      className={cn(
        "skui:shrink-0 skui:group-data-[spacing=0]/toggle-group:rounded-none skui:group-data-[spacing=0]/toggle-group:px-2 skui:focus:z-10 skui:focus-visible:z-10 skui:group-data-[spacing=0]/toggle-group:has-data-[icon=inline-end]:pr-1.5 skui:group-data-[spacing=0]/toggle-group:has-data-[icon=inline-start]:pl-1.5 skui:group-data-horizontal/toggle-group:data-[spacing=0]:first:rounded-l-lg skui:group-data-vertical/toggle-group:data-[spacing=0]:first:rounded-t-lg skui:group-data-horizontal/toggle-group:data-[spacing=0]:last:rounded-r-lg skui:group-data-vertical/toggle-group:data-[spacing=0]:last:rounded-b-lg skui:group-data-horizontal/toggle-group:data-[spacing=0]:data-[variant=outline]:border-l-0 skui:group-data-vertical/toggle-group:data-[spacing=0]:data-[variant=outline]:border-t-0 skui:group-data-horizontal/toggle-group:data-[spacing=0]:data-[variant=outline]:first:border-l skui:group-data-vertical/toggle-group:data-[spacing=0]:data-[variant=outline]:first:border-t",
        toggleVariants({
          variant: context.variant || variant,
          size: context.size || size,
        }),
        className
      )}
      {...props}
    >
      {children}
    </TogglePrimitive>
  )

})

export { ToggleGroup, ToggleGroupItem }

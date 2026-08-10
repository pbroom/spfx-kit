import { ChevronDownIcon } from "lucide-react"
import * as React from "react"

import { cn } from "../../lib/utils"

type NativeSelectProps = Omit<React.ComponentProps<"select">, "size"> & {
  size?: "sm" | "default"
}

const NativeSelect = React.forwardRef<
  React.ElementRef<"select">,
  React.PropsWithoutRef<NativeSelectProps>
>(function NativeSelect({
  className,
  size = "default",
  ...props
}, ref) {
  return (
    <div
      className={cn(
        "skui:group/native-select skui:relative skui:w-fit skui:has-[select:disabled]:opacity-50",
        className
      )}
      data-slot="native-select-wrapper"
      data-size={size}
    >
      <select
        ref={ref}
        data-slot="native-select"
        data-size={size}
        className="skui:h-8 skui:w-full skui:min-w-0 skui:appearance-none skui:rounded-lg skui:border skui:border-input skui:bg-transparent skui:py-1 skui:pr-8 skui:pl-2.5 skui:text-sm skui:transition-colors skui:outline-none skui:select-none skui:selection:bg-primary skui:selection:text-primary-foreground skui:placeholder:text-muted-foreground skui:focus-visible:border-ring skui:focus-visible:ring-3 skui:focus-visible:ring-ring/50 skui:disabled:pointer-events-none skui:disabled:cursor-not-allowed skui:aria-invalid:border-destructive skui:aria-invalid:ring-3 skui:aria-invalid:ring-destructive/20 skui:data-[size=sm]:h-7 skui:data-[size=sm]:rounded-[min(var(--radius-md),10px)] skui:data-[size=sm]:py-0.5 skui:dark:bg-input/30 skui:dark:hover:bg-input/50 skui:dark:aria-invalid:border-destructive/50 skui:dark:aria-invalid:ring-destructive/40"
        {...props}
      />
      <ChevronDownIcon
        className="skui:pointer-events-none skui:absolute skui:top-1/2 skui:right-2.5 skui:size-4 skui:-translate-y-1/2 skui:text-muted-foreground skui:select-none"
        aria-hidden="true"
        data-slot="native-select-icon"
      />
    </div>
  )

})

const NativeSelectOption = React.forwardRef<
  React.ElementRef<"option">,
  React.PropsWithoutRef<React.ComponentProps<"option">>
>(function NativeSelectOption({
  className,
  ...props
}, ref) {
  return (
    <option
      ref={ref}
      data-slot="native-select-option"
      className={cn("skui:bg-[Canvas] skui:text-[CanvasText]", className)}
      {...props}
    />
  )

})

const NativeSelectOptGroup = React.forwardRef<
  React.ElementRef<"optgroup">,
  React.PropsWithoutRef<React.ComponentProps<"optgroup">>
>(function NativeSelectOptGroup({
  className,
  ...props
}, ref) {
  return (
    <optgroup
      ref={ref}
      data-slot="native-select-optgroup"
      className={cn("skui:bg-[Canvas] skui:text-[CanvasText]", className)}
      {...props}
    />
  )

})

export { NativeSelect, NativeSelectOptGroup, NativeSelectOption }

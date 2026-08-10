import * as React from "react"
import { mergeProps } from "@base-ui/react/merge-props"
import { useRender } from "@base-ui/react/use-render"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "../../lib/utils"
import { Separator } from "./separator"

const buttonGroupVariants = cva(
  "skui:flex skui:w-fit skui:items-stretch skui:*:focus-visible:relative skui:*:focus-visible:z-10 skui:has-[>[data-slot=button-group]]:gap-2 skui:has-[select[aria-hidden=true]:last-child]:[&>[data-slot=select-trigger]:last-of-type]:rounded-r-lg skui:[&>[data-slot=select-trigger]:not([class*='w-'])]:w-fit skui:[&>input]:flex-1",
  {
    variants: {
      orientation: {
        horizontal:
          "skui:*:data-slot:rounded-r-none skui:[&>[data-slot]:not(:has(~[data-slot]))]:rounded-r-lg! skui:[&>[data-slot]~[data-slot]]:rounded-l-none skui:[&>[data-slot]~[data-slot]]:border-l-0",
        vertical:
          "skui:flex-col skui:*:data-slot:rounded-b-none skui:[&>[data-slot]:not(:has(~[data-slot]))]:rounded-b-lg! skui:[&>[data-slot]~[data-slot]]:rounded-t-none skui:[&>[data-slot]~[data-slot]]:border-t-0",
      },
    },
    defaultVariants: {
      orientation: "horizontal",
    },
  }
)

const ButtonGroup = React.forwardRef<
  React.ElementRef<"div">,
  React.PropsWithoutRef<React.ComponentProps<"div"> & VariantProps<typeof buttonGroupVariants>>
>(function ButtonGroup({
  className,
  orientation,
  ...props
}, ref) {
  return (
    <div
      ref={ref}
      role="group"
      data-slot="button-group"
      data-orientation={orientation}
      className={cn(buttonGroupVariants({ orientation }), className)}
      {...props}
    />
  )

})

const ButtonGroupText = React.forwardRef<
  React.ElementRef<"div">,
  React.PropsWithoutRef<useRender.ComponentProps<"div">>
>(function ButtonGroupText({
  className,
  render,
  ...props
}, ref) {
  return useRender({
    ref,
    defaultTagName: "div",
    props: mergeProps<"div">(
      {
        className: cn(
          "skui:flex skui:items-center skui:gap-2 skui:rounded-lg skui:border skui:bg-muted skui:px-2.5 skui:text-sm skui:font-medium skui:[&_svg]:pointer-events-none skui:[&_svg:not([class*='size-'])]:size-4",
          className
        ),
      },
      props
    ),
    render,
    state: {
      slot: "button-group-text",
    },
  })

})

const ButtonGroupSeparator = React.forwardRef<
  React.ElementRef<typeof Separator>,
  React.PropsWithoutRef<React.ComponentProps<typeof Separator>>
>(function ButtonGroupSeparator({
  className,
  orientation = "vertical",
  ...props
}, ref) {
  return (
    <Separator
      ref={ref}
      data-slot="button-group-separator"
      orientation={orientation}
      className={cn(
        "skui:relative skui:self-stretch skui:bg-input skui:data-horizontal:mx-px skui:data-horizontal:w-auto skui:data-vertical:my-px skui:data-vertical:h-auto",
        className
      )}
      {...props}
    />
  )

})

export {
  ButtonGroup,
  ButtonGroupSeparator,
  ButtonGroupText,
  buttonGroupVariants,
}

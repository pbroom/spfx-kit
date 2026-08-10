import * as React from "react"
import { mergeProps } from "@base-ui/react/merge-props"
import { useRender } from "@base-ui/react/use-render"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "../../lib/utils"

const BubbleGroup = React.forwardRef<
  React.ElementRef<"div">,
  React.PropsWithoutRef<React.ComponentProps<"div">>
>(function BubbleGroup({ className, ...props }, ref) {
  return (
    <div
      ref={ref}
      data-slot="bubble-group"
      className={cn("skui:flex skui:min-w-0 skui:flex-col skui:gap-2", className)}
      {...props}
    />
  )

})

const bubbleVariants = cva(
  "skui:group/bubble skui:relative skui:flex skui:w-fit skui:max-w-[80%] skui:min-w-0 skui:flex-col skui:gap-1 skui:group-data-[align=end]/message:self-end skui:data-[align=end]:self-end skui:data-[variant=ghost]:max-w-full",
  {
    variants: {
      variant: {
        default:
          "skui:*:data-[slot=bubble-content]:bg-primary skui:*:data-[slot=bubble-content]:text-primary-foreground skui:[&>[data-slot=bubble-content]:is(button,a):hover]:bg-primary/80",
        secondary:
          "skui:*:data-[slot=bubble-content]:bg-secondary skui:*:data-[slot=bubble-content]:text-secondary-foreground skui:[&>[data-slot=bubble-content]:is(button,a):hover]:bg-[color-mix(in_oklch,var(--secondary),var(--foreground)_5%)]",
        muted:
          "skui:*:data-[slot=bubble-content]:bg-muted skui:[&>[data-slot=bubble-content]:is(button,a):hover]:bg-[color-mix(in_oklch,var(--muted),var(--foreground)_5%)]",
        tinted:
          "skui:*:data-[slot=bubble-content]:bg-[oklch(from_var(--primary)_0.93_calc(c*0.4)_h)] skui:*:data-[slot=bubble-content]:text-foreground skui:dark:*:data-[slot=bubble-content]:bg-[oklch(from_var(--primary)_0.3_calc(c*0.4)_h)] skui:[&>[data-slot=bubble-content]:is(button,a):hover]:bg-[oklch(from_var(--primary)_0.88_calc(c*0.5)_h)] skui:dark:[&>[data-slot=bubble-content]:is(button,a):hover]:bg-[oklch(from_var(--primary)_0.35_calc(c*0.5)_h)]",
        outline:
          "skui:*:data-[slot=bubble-content]:border-border skui:*:data-[slot=bubble-content]:bg-background skui:[&>[data-slot=bubble-content]:is(button,a):hover]:bg-muted skui:[&>[data-slot=bubble-content]:is(button,a):hover]:text-foreground skui:dark:[&>[data-slot=bubble-content]:is(button,a):hover]:bg-input/30",
        ghost:
          "skui:border-none skui:*:data-[slot=bubble-content]:rounded-none skui:*:data-[slot=bubble-content]:bg-transparent skui:*:data-[slot=bubble-content]:p-0 skui:[&>[data-slot=bubble-content]:is(button,a):hover]:bg-muted skui:[&>[data-slot=bubble-content]:is(button,a):hover]:text-foreground skui:dark:[&>[data-slot=bubble-content]:is(button,a):hover]:bg-muted/50",
        destructive:
          "skui:*:data-[slot=bubble-content]:bg-destructive/10 skui:*:data-[slot=bubble-content]:text-destructive skui:dark:*:data-[slot=bubble-content]:bg-destructive/20 skui:[&>[data-slot=bubble-content]:is(button,a):hover]:bg-destructive/20 skui:dark:[&>[data-slot=bubble-content]:is(button,a):hover]:bg-destructive/30",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

const Bubble = React.forwardRef<
  React.ElementRef<"div">,
  React.PropsWithoutRef<React.ComponentProps<"div"> &
  VariantProps<typeof bubbleVariants> & {
    align?: "start" | "end"
  }>
>(function Bubble({
  variant = "default",
  align = "start",
  className,
  ...props
}, ref) {
  return (
    <div
      ref={ref}
      data-slot="bubble"
      data-variant={variant}
      data-align={align}
      className={cn(bubbleVariants({ variant }), className)}
      {...props}
    />
  )

})

const BubbleContent = React.forwardRef<
  React.ElementRef<"div">,
  React.PropsWithoutRef<useRender.ComponentProps<"div">>
>(function BubbleContent({
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
          "skui:w-fit skui:max-w-full skui:min-w-0 skui:overflow-hidden skui:rounded-xl skui:border skui:border-transparent skui:px-3 skui:py-2 skui:text-sm skui:leading-relaxed skui:wrap-break-word skui:group-data-[align=end]/bubble:self-end skui:[button]:text-left skui:[button,a]:transition-colors skui:[button,a]:outline-none skui:[button,a]:focus-visible:border-ring skui:[button,a]:focus-visible:ring-3 skui:[button,a]:focus-visible:ring-ring/50",
          className
        ),
      },
      props
    ),
    render,
    state: {
      slot: "bubble-content",
    },
  })

})

const bubbleReactionsVariants = cva(
  "skui:absolute skui:z-10 skui:flex skui:w-fit skui:shrink-0 skui:items-center skui:justify-center skui:gap-1 skui:rounded-full skui:bg-muted skui:px-1.5 skui:py-0.5 skui:text-sm skui:ring-3 skui:ring-card skui:has-[button]:p-0",
  {
    variants: {
      side: {
        top: "skui:top-0 skui:-translate-y-3/4",
        bottom: "skui:bottom-0 skui:translate-y-3/4",
      },
      align: {
        start: "skui:left-3",
        end: "skui:right-3",
      },
    },
    defaultVariants: {
      side: "bottom",
      align: "end",
    },
  }
)

const BubbleReactions = React.forwardRef<
  React.ElementRef<"div">,
  React.PropsWithoutRef<React.ComponentProps<"div"> & {
  align?: "start" | "end"
  side?: "top" | "bottom"
}>
>(function BubbleReactions({
  side = "bottom",
  align = "end",
  className,
  ...props
}, ref) {
  return (
    <div
      ref={ref}
      data-slot="bubble-reactions"
      data-align={align}
      data-side={side}
      className={cn(bubbleReactionsVariants({ side, align }), className)}
      {...props}
    />
  )

})

export { BubbleGroup, Bubble, BubbleContent, BubbleReactions }

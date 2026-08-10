import * as React from "react"
import { mergeProps } from "@base-ui/react/merge-props"
import { useRender } from "@base-ui/react/use-render"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "../../lib/utils"
import { Button } from "./button"

const attachmentVariants = cva(
  "skui:group/attachment skui:relative skui:flex skui:w-fit skui:max-w-full skui:min-w-0 skui:shrink-0 skui:flex-wrap skui:rounded-xl skui:border skui:bg-card skui:text-card-foreground skui:transition-colors skui:focus-within:ring-1 skui:focus-within:ring-ring/50 skui:has-[>a,>button]:hover:bg-muted/50 skui:data-[state=error]:border-destructive/30 skui:data-[state=idle]:border-dashed",
  {
    variants: {
      size: {
        default:
          "skui:gap-2 skui:text-sm skui:has-data-[slot=attachment-content]:px-2.5 skui:has-data-[slot=attachment-content]:py-2 skui:has-data-[slot=attachment-media]:p-2",
        sm: "skui:gap-2.5 skui:text-xs skui:has-data-[slot=attachment-content]:px-2 skui:has-data-[slot=attachment-content]:py-1.5 skui:has-data-[slot=attachment-media]:p-1.5",
        xs: "skui:gap-1.5 skui:rounded-lg skui:text-xs skui:has-data-[slot=attachment-content]:px-1.5 skui:has-data-[slot=attachment-content]:py-1 skui:has-data-[slot=attachment-media]:p-1",
      },
      orientation: {
        horizontal: "skui:min-w-40 skui:items-center",
        vertical: "skui:w-24 skui:flex-col skui:has-data-[slot=attachment-content]:w-30",
      },
    },
  }
)

const Attachment = React.forwardRef<
  React.ElementRef<"div">,
  React.PropsWithoutRef<React.ComponentProps<"div"> &
  VariantProps<typeof attachmentVariants> & {
    state?: "idle" | "uploading" | "processing" | "error" | "done"
  }>
>(function Attachment({
  className,
  state = "done",
  size = "default",
  orientation = "horizontal",
  ...props
}, ref) {
  return (
    <div
      ref={ref}
      data-slot="attachment"
      data-state={state}
      data-size={size}
      data-orientation={orientation}
      className={cn(attachmentVariants({ size, orientation }), className)}
      {...props}
    />
  )

})

const attachmentMediaVariants = cva(
  "skui:relative skui:flex skui:aspect-square skui:w-10 skui:shrink-0 skui:items-center skui:justify-center skui:overflow-hidden skui:rounded-lg skui:bg-muted skui:text-foreground skui:group-data-[orientation=vertical]/attachment:w-full skui:group-data-[size=sm]/attachment:w-8 skui:group-data-[size=xs]/attachment:w-7 skui:group-data-[size=xs]/attachment:rounded-md skui:group-data-[state=error]/attachment:bg-destructive/10 skui:group-data-[state=error]/attachment:text-destructive skui:group-data-[orientation=vertical]/attachment:*:data-[slot=spinner]:size-6! skui:[&_svg]:pointer-events-none skui:[&_svg:not([class*='size-'])]:size-4 skui:group-data-[orientation=vertical]/attachment:[&_svg:not([class*='size-'])]:size-6 skui:group-data-[size=xs]/attachment:[&_svg:not([class*='size-'])]:size-3.5",
  {
    variants: {
      variant: {
        icon: "",
        image:
          "skui:opacity-60 skui:group-data-[state=done]/attachment:opacity-100 skui:group-data-[state=idle]/attachment:opacity-100 skui:*:[img]:aspect-square skui:*:[img]:w-full skui:*:[img]:object-cover",
      },
    },
    defaultVariants: {
      variant: "icon",
    },
  }
)

const AttachmentMedia = React.forwardRef<
  React.ElementRef<"div">,
  React.PropsWithoutRef<React.ComponentProps<"div"> & VariantProps<typeof attachmentMediaVariants>>
>(function AttachmentMedia({
  className,
  variant = "icon",
  ...props
}, ref) {
  return (
    <div
      ref={ref}
      data-slot="attachment-media"
      data-variant={variant}
      className={cn(attachmentMediaVariants({ variant }), className)}
      {...props}
    />
  )

})

const AttachmentContent = React.forwardRef<
  React.ElementRef<"div">,
  React.PropsWithoutRef<React.ComponentProps<"div">>
>(function AttachmentContent({
  className,
  ...props
}, ref) {
  return (
    <div
      ref={ref}
      data-slot="attachment-content"
      className={cn(
        "skui:max-w-full skui:min-w-0 skui:flex-1 skui:leading-tight skui:group-data-[orientation=vertical]/attachment:px-1",
        className
      )}
      {...props}
    />
  )

})

const AttachmentTitle = React.forwardRef<
  React.ElementRef<"span">,
  React.PropsWithoutRef<React.ComponentProps<"span">>
>(function AttachmentTitle({
  className,
  ...props
}, ref) {
  return (
    <span
      ref={ref}
      data-slot="attachment-title"
      className={cn(
        "skui:block skui:max-w-full skui:min-w-0 skui:truncate skui:font-medium skui:group-data-[state=processing]/attachment:shimmer skui:group-data-[state=uploading]/attachment:shimmer",
        className
      )}
      {...props}
    />
  )

})

const AttachmentDescription = React.forwardRef<
  React.ElementRef<"span">,
  React.PropsWithoutRef<React.ComponentProps<"span">>
>(function AttachmentDescription({
  className,
  ...props
}, ref) {
  return (
    <span
      ref={ref}
      data-slot="attachment-description"
      className={cn(
        "skui:mt-0.5 skui:block skui:min-w-0 skui:truncate skui:text-xs skui:text-muted-foreground skui:group-data-[state=error]/attachment:text-destructive/80",
        "skui:max-w-full",
        className
      )}
      {...props}
    />
  )

})

const AttachmentActions = React.forwardRef<
  React.ElementRef<"div">,
  React.PropsWithoutRef<React.ComponentProps<"div">>
>(function AttachmentActions({
  className,
  ...props
}, ref) {
  return (
    <div
      ref={ref}
      data-slot="attachment-actions"
      className={cn(
        "skui:relative skui:z-20 skui:flex skui:shrink-0 skui:items-center skui:group-data-[orientation=vertical]/attachment:absolute skui:group-data-[orientation=vertical]/attachment:top-3 skui:group-data-[orientation=vertical]/attachment:right-3 skui:group-data-[orientation=vertical]/attachment:gap-1",
        className
      )}
      {...props}
    />
  )

})

const AttachmentAction = React.forwardRef<
  React.ElementRef<typeof Button>,
  React.PropsWithoutRef<React.ComponentProps<typeof Button>>
>(function AttachmentAction({
  className,
  variant,
  size = "icon-xs",
  ...props
}, ref) {
  return (
    <Button
      ref={ref}
      data-slot="attachment-action"
      variant={variant ?? "ghost"}
      size={size}
      className={cn(className)}
      {...props}
    />
  )

})

const AttachmentTrigger = React.forwardRef<
  React.ElementRef<"button">,
  React.PropsWithoutRef<useRender.ComponentProps<"button">>
>(function AttachmentTrigger({
  className,
  render,
  type,
  ...props
}, ref) {
  return useRender({
    ref,
    defaultTagName: "button",
    props: mergeProps<"button">(
      {
        type: render ? type : (type ?? "button"),
        className: cn("skui:absolute skui:inset-0 skui:z-10 skui:outline-none", className),
      },
      props
    ),
    render,
    state: {
      slot: "attachment-trigger",
    },
  })

})

const AttachmentGroup = React.forwardRef<
  React.ElementRef<"div">,
  React.PropsWithoutRef<React.ComponentProps<"div">>
>(function AttachmentGroup({ className, ...props }, ref) {
  return (
    <div
      ref={ref}
      data-slot="attachment-group"
      className={cn(
        "skui:flex skui:min-w-0 skui:scroll-fade-x skui:snap-x skui:snap-mandatory skui:scroll-px-1 skui:scrollbar-none skui:gap-3 skui:overflow-x-auto skui:overscroll-x-contain skui:py-1 skui:*:data-[slot=attachment]:flex-none skui:*:data-[slot=attachment]:snap-start",
        className
      )}
      {...props}
    />
  )

})

export {
  Attachment,
  AttachmentGroup,
  AttachmentMedia,
  AttachmentContent,
  AttachmentTitle,
  AttachmentDescription,
  AttachmentActions,
  AttachmentAction,
  AttachmentTrigger,
}

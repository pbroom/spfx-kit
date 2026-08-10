import * as React from "react"

import { cn } from "../../lib/utils"

const MessageGroup = React.forwardRef<
  React.ElementRef<"div">,
  React.PropsWithoutRef<React.ComponentProps<"div">>
>(function MessageGroup({ className, ...props }, ref) {
  return (
    <div
      ref={ref}
      data-slot="message-group"
      className={cn("skui:flex skui:min-w-0 skui:flex-col skui:gap-2", className)}
      {...props}
    />
  )

})

const Message = React.forwardRef<
  React.ElementRef<"div">,
  React.PropsWithoutRef<React.ComponentProps<"div"> & { align?: "start" | "end" }>
>(function Message({
  className,
  align = "start",
  ...props
}, ref) {
  return (
    <div
      ref={ref}
      data-slot="message"
      data-align={align}
      className={cn(
        "skui:group/message skui:relative skui:flex skui:w-full skui:min-w-0 skui:gap-2 skui:text-sm skui:data-[align=end]:flex-row-reverse",
        className
      )}
      {...props}
    />
  )

})

const MessageAvatar = React.forwardRef<
  React.ElementRef<"div">,
  React.PropsWithoutRef<React.ComponentProps<"div">>
>(function MessageAvatar({ className, ...props }, ref) {
  return (
    <div
      ref={ref}
      data-slot="message-avatar"
      className={cn(
        "skui:flex skui:w-fit skui:min-w-8 skui:shrink-0 skui:items-center skui:justify-center skui:self-end skui:overflow-hidden skui:rounded-full skui:bg-muted skui:group-has-data-[slot=message-footer]/message:-translate-y-8",
        className
      )}
      {...props}
    />
  )

})

const MessageContent = React.forwardRef<
  React.ElementRef<"div">,
  React.PropsWithoutRef<React.ComponentProps<"div">>
>(function MessageContent({ className, ...props }, ref) {
  return (
    <div
      ref={ref}
      data-slot="message-content"
      className={cn(
        "skui:flex skui:w-full skui:min-w-0 skui:flex-col skui:gap-2.5 skui:wrap-break-word skui:group-data-[align=end]/message:*:data-slot:self-end",
        className
      )}
      {...props}
    />
  )

})

const MessageHeader = React.forwardRef<
  React.ElementRef<"div">,
  React.PropsWithoutRef<React.ComponentProps<"div">>
>(function MessageHeader({ className, ...props }, ref) {
  return (
    <div
      ref={ref}
      data-slot="message-header"
      className={cn(
        "skui:flex skui:max-w-full skui:min-w-0 skui:items-center skui:px-3 skui:text-xs skui:font-medium skui:text-muted-foreground skui:group-has-data-[variant=ghost]/message:px-0",
        className
      )}
      {...props}
    />
  )

})

const MessageFooter = React.forwardRef<
  React.ElementRef<"div">,
  React.PropsWithoutRef<React.ComponentProps<"div">>
>(function MessageFooter({ className, ...props }, ref) {
  return (
    <div
      ref={ref}
      data-slot="message-footer"
      className={cn(
        "skui:flex skui:max-w-full skui:min-w-0 skui:items-center skui:px-3 skui:text-xs skui:font-medium skui:text-muted-foreground skui:group-has-data-[variant=ghost]/message:px-0 skui:group-data-[align=end]/message:justify-end",
        className
      )}
      {...props}
    />
  )

})

export {
  MessageGroup,
  Message,
  MessageAvatar,
  MessageContent,
  MessageFooter,
  MessageHeader,
}

"use client"

import { MinusIcon } from "lucide-react"
import * as React from "react"
import { OTPInput, OTPInputContext } from "input-otp"

import { cn } from "../../lib/utils"

const InputOTP = React.forwardRef<
  React.ElementRef<typeof OTPInput>,
  React.PropsWithoutRef<React.ComponentProps<typeof OTPInput> & {
  containerClassName?: string
}>
>(function InputOTP({
  className,
  containerClassName,
  ...props
}, ref) {
  return (
    <OTPInput
      ref={ref}
      data-slot="input-otp"
      containerClassName={cn(
        "skui:flex skui:items-center skui:has-disabled:opacity-50",
        containerClassName
      )}
      spellCheck={false}
      className={cn("skui:disabled:cursor-not-allowed", className)}
      {...props}
    />
  )

})

const InputOTPGroup = React.forwardRef<
  React.ElementRef<"div">,
  React.PropsWithoutRef<React.ComponentProps<"div">>
>(function InputOTPGroup({ className, ...props }, ref) {
  return (
    <div
      ref={ref}
      data-slot="input-otp-group"
      className={cn(
        "skui:flex skui:items-center skui:rounded-lg skui:has-aria-invalid:border-destructive skui:has-aria-invalid:ring-3 skui:has-aria-invalid:ring-destructive/20 skui:dark:has-aria-invalid:ring-destructive/40",
        className
      )}
      {...props}
    />
  )

})

const InputOTPSlot = React.forwardRef<
  React.ElementRef<"div">,
  React.PropsWithoutRef<React.ComponentProps<"div"> & {
  index: number
}>
>(function InputOTPSlot({
  index,
  className,
  ...props
}, ref) {
  const inputOTPContext = React.useContext(OTPInputContext)
  const { char, hasFakeCaret, isActive } = inputOTPContext?.slots[index] ?? {}

  return (
    <div
      ref={ref}
      data-slot="input-otp-slot"
      data-active={isActive}
      className={cn(
        "skui:relative skui:flex skui:size-8 skui:items-center skui:justify-center skui:border-y skui:border-r skui:border-input skui:text-sm skui:transition-all skui:outline-none skui:first:rounded-l-lg skui:first:border-l skui:last:rounded-r-lg skui:aria-invalid:border-destructive skui:data-[active=true]:z-10 skui:data-[active=true]:border-ring skui:data-[active=true]:ring-3 skui:data-[active=true]:ring-ring/50 skui:data-[active=true]:aria-invalid:border-destructive skui:data-[active=true]:aria-invalid:ring-destructive/20 skui:dark:bg-input/30 skui:dark:data-[active=true]:aria-invalid:ring-destructive/40",
        className
      )}
      {...props}
    >
      {char}
      {hasFakeCaret && (
        <div className="skui:pointer-events-none skui:absolute skui:inset-0 skui:flex skui:items-center skui:justify-center">
          <div className="skui:h-4 skui:w-px skui:animate-caret-blink skui:bg-foreground skui:duration-1000" />
        </div>
      )}
    </div>
  )

})

const InputOTPSeparator = React.forwardRef<
  React.ElementRef<"div">,
  React.PropsWithoutRef<React.ComponentProps<"div">>
>(function InputOTPSeparator({ ...props }, ref) {
  return (
    <div
      ref={ref}
      data-slot="input-otp-separator"
      className="skui:flex skui:items-center skui:[&_svg:not([class*='size-'])]:size-4"
      role="separator"
      {...props}
    >
      <MinusIcon />
    </div>
  )

})

export { InputOTP, InputOTPGroup, InputOTPSlot, InputOTPSeparator }

"use client"

import * as React from "react"
import { useMemo } from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "../../lib/utils"
import { Label } from "./label"
import { Separator } from "./separator"

const FieldSet = React.forwardRef<
  React.ElementRef<"fieldset">,
  React.PropsWithoutRef<React.ComponentProps<"fieldset">>
>(function FieldSet({ className, ...props }, ref) {
  return (
    <fieldset
      ref={ref}
      data-slot="field-set"
      className={cn(
        "skui:flex skui:flex-col skui:gap-4 skui:has-[>[data-slot=checkbox-group]]:gap-3 skui:has-[>[data-slot=radio-group]]:gap-3",
        className
      )}
      {...props}
    />
  )

})

const FieldLegend = React.forwardRef<
  React.ElementRef<"legend">,
  React.PropsWithoutRef<React.ComponentProps<"legend"> & { variant?: "legend" | "label" }>
>(function FieldLegend({
  className,
  variant = "legend",
  ...props
}, ref) {
  return (
    <legend
      ref={ref}
      data-slot="field-legend"
      data-variant={variant}
      className={cn(
        "skui:mb-1.5 skui:font-medium skui:data-[variant=label]:text-sm skui:data-[variant=legend]:text-base",
        className
      )}
      {...props}
    />
  )

})

const FieldGroup = React.forwardRef<
  React.ElementRef<"div">,
  React.PropsWithoutRef<React.ComponentProps<"div">>
>(function FieldGroup({ className, ...props }, ref) {
  return (
    <div
      ref={ref}
      data-slot="field-group"
      className={cn(
        "skui:group/field-group skui:@container/field-group skui:flex skui:w-full skui:flex-col skui:gap-5 skui:data-[slot=checkbox-group]:gap-3 skui:*:data-[slot=field-group]:gap-4",
        className
      )}
      {...props}
    />
  )

})

const fieldVariants = cva(
  "skui:group/field skui:flex skui:w-full skui:gap-2 skui:data-[invalid=true]:text-destructive",
  {
    variants: {
      orientation: {
        vertical: "skui:flex-col skui:*:w-full skui:[&>.skui\\:sr-only]:w-auto",
        horizontal:
          "skui:flex-row skui:items-center skui:has-[>[data-slot=field-content]]:items-start skui:*:data-[slot=field-label]:flex-auto skui:has-[>[data-slot=field-content]]:[&>[role=checkbox],[role=radio]]:mt-px",
        responsive:
          "skui:flex-col skui:*:w-full skui:@md/field-group:flex-row skui:@md/field-group:items-center skui:@md/field-group:*:w-auto skui:@md/field-group:has-[>[data-slot=field-content]]:items-start skui:@md/field-group:*:data-[slot=field-label]:flex-auto skui:[&>.skui\\:sr-only]:w-auto skui:@md/field-group:has-[>[data-slot=field-content]]:[&>[role=checkbox],[role=radio]]:mt-px",
      },
    },
    defaultVariants: {
      orientation: "vertical",
    },
  }
)

const Field = React.forwardRef<
  React.ElementRef<"div">,
  React.PropsWithoutRef<React.ComponentProps<"div"> & VariantProps<typeof fieldVariants>>
>(function Field({
  className,
  orientation = "vertical",
  ...props
}, ref) {
  return (
    <div
      ref={ref}
      role="group"
      data-slot="field"
      data-orientation={orientation}
      className={cn(fieldVariants({ orientation }), className)}
      {...props}
    />
  )

})

const FieldContent = React.forwardRef<
  React.ElementRef<"div">,
  React.PropsWithoutRef<React.ComponentProps<"div">>
>(function FieldContent({ className, ...props }, ref) {
  return (
    <div
      ref={ref}
      data-slot="field-content"
      className={cn(
        "skui:group/field-content skui:flex skui:flex-1 skui:flex-col skui:gap-0.5 skui:leading-snug",
        className
      )}
      {...props}
    />
  )

})

const FieldLabel = React.forwardRef<
  React.ElementRef<typeof Label>,
  React.PropsWithoutRef<React.ComponentProps<typeof Label>>
>(function FieldLabel({
  className,
  ...props
}, ref) {
  return (
    <Label
      ref={ref}
      data-slot="field-label"
      className={cn(
        "skui:group/field-label skui:peer/field-label skui:flex skui:w-fit skui:gap-2 skui:leading-snug skui:group-data-[disabled=true]/field:opacity-50 skui:has-data-checked:border-primary/30 skui:has-data-checked:bg-primary/5 skui:has-[>[data-slot=field]]:rounded-lg skui:has-[>[data-slot=field]]:border skui:*:data-[slot=field]:p-2.5 skui:dark:has-data-checked:border-primary/20 skui:dark:has-data-checked:bg-primary/10",
        "skui:has-[>[data-slot=field]]:w-full skui:has-[>[data-slot=field]]:flex-col",
        className
      )}
      {...props}
    />
  )

})

const FieldTitle = React.forwardRef<
  React.ElementRef<"div">,
  React.PropsWithoutRef<React.ComponentProps<"div">>
>(function FieldTitle({ className, ...props }, ref) {
  return (
    <div
      ref={ref}
      data-slot="field-label"
      className={cn(
        "skui:flex skui:w-fit skui:items-center skui:gap-2 skui:text-sm skui:font-medium skui:group-data-[disabled=true]/field:opacity-50",
        className
      )}
      {...props}
    />
  )

})

const FieldDescription = React.forwardRef<
  React.ElementRef<"p">,
  React.PropsWithoutRef<React.ComponentProps<"p">>
>(function FieldDescription({ className, ...props }, ref) {
  return (
    <p
      ref={ref}
      data-slot="field-description"
      className={cn(
        "skui:text-left skui:text-sm skui:leading-normal skui:font-normal skui:text-muted-foreground skui:group-has-data-horizontal/field:text-balance skui:[[data-variant=legend]+&]:-mt-1.5",
        "skui:last:mt-0 skui:nth-last-2:-mt-1",
        "skui:[&>a]:underline skui:[&>a]:underline-offset-4 skui:[&>a:hover]:text-primary",
        className
      )}
      {...props}
    />
  )

})

const FieldSeparator = React.forwardRef<
  React.ElementRef<"div">,
  React.PropsWithoutRef<React.ComponentProps<"div"> & {
  children?: React.ReactNode
}>
>(function FieldSeparator({
  children,
  className,
  ...props
}, ref) {
  return (
    <div
      ref={ref}
      data-slot="field-separator"
      data-content={!!children}
      className={cn(
        "skui:relative skui:-my-2 skui:h-5 skui:text-sm skui:group-data-[variant=outline]/field-group:-mb-2",
        className
      )}
      {...props}
    >
      <Separator className="skui:absolute skui:inset-0 skui:top-1/2" />
      {children && (
        <span
          className="skui:relative skui:mx-auto skui:block skui:w-fit skui:bg-background skui:px-2 skui:text-muted-foreground"
          data-slot="field-separator-content"
        >
          {children}
        </span>
      )}
    </div>
  )

})

const FieldError = React.forwardRef<
  React.ElementRef<"div">,
  React.PropsWithoutRef<React.ComponentProps<"div"> & {
  errors?: Array<{ message?: string } | undefined>
}>
>(function FieldError({
  className,
  children,
  errors,
  ...props
}, ref) {
  const content = useMemo(() => {
    if (children) {
      return children
    }

    if (!errors?.length) {
      return null
    }

    const uniqueErrors = [
      ...new Map(errors.map((error) => [error?.message, error])).values(),
    ]

    if (uniqueErrors?.length == 1) {
      return uniqueErrors[0]?.message
    }

    return (
      <ul className="skui:ml-4 skui:flex skui:list-disc skui:flex-col skui:gap-1">
        {uniqueErrors.map(
          (error, index) =>
            error?.message && <li key={index}>{error.message}</li>
        )}
      </ul>
    )
  }, [children, errors])

  if (!content) {
    return null
  }

  return (
    <div
      ref={ref}
      role="alert"
      data-slot="field-error"
      className={cn("skui:text-sm skui:font-normal skui:text-destructive", className)}
      {...props}
    >
      {content}
    </div>
  )

})

export {
  Field,
  FieldLabel,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLegend,
  FieldSeparator,
  FieldSet,
  FieldContent,
  FieldTitle,
}

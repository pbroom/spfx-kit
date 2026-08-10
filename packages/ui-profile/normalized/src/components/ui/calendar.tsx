"use client"

import { ChevronDownIcon, ChevronLeftIcon, ChevronRightIcon } from "lucide-react"
import * as React from "react"
import {
  DayPicker,
  getDefaultClassNames,
  type DayButton,
  type Locale,
} from "react-day-picker"

import { cn } from "../../lib/utils"
import { Button, buttonVariants } from "./button"

function Calendar({
  className,
  classNames,
  showOutsideDays = true,
  captionLayout = "label",
  buttonVariant = "ghost",
  locale,
  formatters,
  components,
  ...props
}: React.ComponentProps<typeof DayPicker> & {
  buttonVariant?: React.ComponentProps<typeof Button>["variant"]
}) {
  const defaultClassNames = getDefaultClassNames()

  return (
    <DayPicker
      showOutsideDays={showOutsideDays}
      className={cn(
        "skui:group/calendar skui:bg-background skui:p-2 skui:[--cell-radius:var(--radius-md)] skui:[--cell-size:--spacing(7)] skui:in-data-[slot=card-content]:bg-transparent skui:in-data-[slot=popover-content]:bg-transparent",
        "skui:rtl:**:[.rdp-button\\_next>svg]:rotate-180",
        "skui:rtl:**:[.rdp-button\\_previous>svg]:rotate-180",
        className
      )}
      captionLayout={captionLayout}
      locale={locale}
      formatters={{
        formatMonthDropdown: (date) =>
          date.toLocaleString(locale?.code, { month: "short" }),
        ...formatters,
      }}
      classNames={{
        root: cn("skui:w-fit", defaultClassNames.root),
        months: cn(
          "skui:relative skui:flex skui:flex-col skui:gap-4 skui:md:flex-row",
          defaultClassNames.months
        ),
        month: cn("skui:flex skui:w-full skui:flex-col skui:gap-4", defaultClassNames.month),
        nav: cn(
          "skui:absolute skui:inset-x-0 skui:top-0 skui:flex skui:w-full skui:items-center skui:justify-between skui:gap-1",
          defaultClassNames.nav
        ),
        button_previous: cn(
          buttonVariants({ variant: buttonVariant }),
          "skui:size-(--cell-size) skui:p-0 skui:select-none skui:aria-disabled:opacity-50",
          defaultClassNames.button_previous
        ),
        button_next: cn(
          buttonVariants({ variant: buttonVariant }),
          "skui:size-(--cell-size) skui:p-0 skui:select-none skui:aria-disabled:opacity-50",
          defaultClassNames.button_next
        ),
        month_caption: cn(
          "skui:flex skui:h-(--cell-size) skui:w-full skui:items-center skui:justify-center skui:px-(--cell-size)",
          defaultClassNames.month_caption
        ),
        dropdowns: cn(
          "skui:flex skui:h-(--cell-size) skui:w-full skui:items-center skui:justify-center skui:gap-1.5 skui:text-sm skui:font-medium",
          defaultClassNames.dropdowns
        ),
        dropdown_root: cn(
          "skui:relative skui:rounded-(--cell-radius)",
          defaultClassNames.dropdown_root
        ),
        dropdown: cn(
          "skui:absolute skui:inset-0 skui:bg-popover skui:opacity-0",
          defaultClassNames.dropdown
        ),
        caption_label: cn(
          "skui:font-medium skui:select-none",
          captionLayout === "label"
            ? "skui:text-sm"
            : "skui:flex skui:items-center skui:gap-1 skui:rounded-(--cell-radius) skui:text-sm skui:[&>svg]:size-3.5 skui:[&>svg]:text-muted-foreground",
          defaultClassNames.caption_label
        ),
        month_grid: cn("skui:w-full skui:border-collapse", defaultClassNames.month_grid),
        weekdays: cn("skui:flex", defaultClassNames.weekdays),
        weekday: cn(
          "skui:flex-1 skui:rounded-(--cell-radius) skui:text-[0.8rem] skui:font-normal skui:text-muted-foreground skui:select-none",
          defaultClassNames.weekday
        ),
        week: cn("skui:mt-2 skui:flex skui:w-full", defaultClassNames.week),
        week_number_header: cn(
          "skui:w-(--cell-size) skui:select-none",
          defaultClassNames.week_number_header
        ),
        week_number: cn(
          "skui:text-[0.8rem] skui:text-muted-foreground skui:select-none",
          defaultClassNames.week_number
        ),
        day: cn(
          "skui:group/day skui:relative skui:aspect-square skui:h-full skui:w-full skui:rounded-(--cell-radius) skui:p-0 skui:text-center skui:select-none skui:[&:last-child[data-selected=true]_button]:rounded-r-(--cell-radius)",
          props.showWeekNumber
            ? "skui:[&:nth-child(2)[data-selected=true]_button]:rounded-l-(--cell-radius)"
            : "skui:[&:first-child[data-selected=true]_button]:rounded-l-(--cell-radius)",
          defaultClassNames.day
        ),
        range_start: cn(
          "skui:relative skui:isolate skui:z-0 skui:rounded-l-(--cell-radius) skui:bg-muted skui:after:absolute skui:after:inset-y-0 skui:after:right-0 skui:after:w-4 skui:after:bg-muted",
          defaultClassNames.range_start
        ),
        range_middle: cn("skui:rounded-none", defaultClassNames.range_middle),
        range_end: cn(
          "skui:relative skui:isolate skui:z-0 skui:rounded-r-(--cell-radius) skui:bg-muted skui:after:absolute skui:after:inset-y-0 skui:after:left-0 skui:after:w-4 skui:after:bg-muted",
          defaultClassNames.range_end
        ),
        today: cn(
          "skui:rounded-(--cell-radius) skui:bg-muted skui:text-foreground skui:data-[selected=true]:rounded-none",
          defaultClassNames.today
        ),
        outside: cn(
          "skui:text-muted-foreground skui:aria-selected:text-muted-foreground",
          defaultClassNames.outside
        ),
        disabled: cn(
          "skui:text-muted-foreground skui:opacity-50",
          defaultClassNames.disabled
        ),
        hidden: cn("skui:invisible", defaultClassNames.hidden),
        ...classNames,
      }}
      components={{
        Root: ({ className, rootRef, ...props }) => {
          return (
            <div
              data-slot="calendar"
              ref={rootRef}
              className={cn(className)}
              {...props}
            />
          )
        },
        Chevron: ({ className, orientation, ...props }) => {
          if (orientation === "left") {
            return (
              <ChevronLeftIcon
                className={cn("skui:size-4", className)}
                {...props}
              />
            )
          }

          if (orientation === "right") {
            return (
              <ChevronRightIcon
                className={cn("skui:size-4", className)}
                {...props}
              />
            )
          }

          return (
            <ChevronDownIcon
              className={cn("skui:size-4", className)}
              {...props}
            />
          )
        },
        DayButton: ({ ...props }) => (
          <CalendarDayButton locale={locale} {...props} />
        ),
        WeekNumber: ({ children, ...props }) => {
          return (
            <td {...props}>
              <div className="skui:flex skui:size-(--cell-size) skui:items-center skui:justify-center skui:text-center">
                {children}
              </div>
            </td>
          )
        },
        ...components,
      }}
      {...props}
    />
  )
}

const CalendarDayButton = React.forwardRef<
  React.ElementRef<typeof Button>,
  React.PropsWithoutRef<React.ComponentProps<typeof DayButton> & { locale?: Partial<Locale> }>
>(function CalendarDayButton({
  className,
  day,
  modifiers,
  locale,
  ...props
}, ref) {
  const defaultClassNames = getDefaultClassNames()

  const focusRef = React.useRef<HTMLButtonElement>(null)
  React.useEffect(() => {
    if (modifiers.focused) focusRef.current?.focus()
  }, [modifiers.focused])

  return (
    <Button
      ref={ref}
      variant="ghost"
      size="icon"
      data-day={day.date.toLocaleDateString(locale?.code)}
      data-selected-single={
        modifiers.selected &&
        !modifiers.range_start &&
        !modifiers.range_end &&
        !modifiers.range_middle
      }
      data-range-start={modifiers.range_start}
      data-range-end={modifiers.range_end}
      data-range-middle={modifiers.range_middle}
      className={cn(
        "skui:relative skui:isolate skui:z-10 skui:flex skui:aspect-square skui:size-auto skui:w-full skui:min-w-(--cell-size) skui:flex-col skui:gap-1 skui:border-0 skui:leading-none skui:font-normal skui:group-data-[focused=true]/day:relative skui:group-data-[focused=true]/day:z-10 skui:group-data-[focused=true]/day:border-ring skui:group-data-[focused=true]/day:ring-[3px] skui:group-data-[focused=true]/day:ring-ring/50 skui:data-[range-end=true]:rounded-(--cell-radius) skui:data-[range-end=true]:rounded-r-(--cell-radius) skui:data-[range-end=true]:bg-primary skui:data-[range-end=true]:text-primary-foreground skui:data-[range-middle=true]:rounded-none skui:data-[range-middle=true]:bg-muted skui:data-[range-middle=true]:text-foreground skui:data-[range-start=true]:rounded-(--cell-radius) skui:data-[range-start=true]:rounded-l-(--cell-radius) skui:data-[range-start=true]:bg-primary skui:data-[range-start=true]:text-primary-foreground skui:data-[selected-single=true]:bg-primary skui:data-[selected-single=true]:text-primary-foreground skui:dark:hover:text-foreground skui:[&>span]:text-xs skui:[&>span]:opacity-70",
        defaultClassNames.day,
        className
      )}
      {...props}
    />
  )

})

export { Calendar, CalendarDayButton }

"use client"

import { useSpfxUiHost, useSpfxUiRequiredId } from "../../lib/ui-root"
import * as React from "react"
import * as RechartsPrimitive from "recharts"
import type { TooltipValueType } from "recharts"

import { cn } from "../../lib/utils"

// Format: { THEME_NAME: CSS_SELECTOR }
const THEMES = { light: "", dark: ".dark" } as const

const INITIAL_DIMENSION = { width: 320, height: 200 } as const
type TooltipNameType = number | string

export type ChartConfig = Record<
  string,
  {
    label?: React.ReactNode
    icon?: React.ComponentType
  } & (
    | { color?: string; theme?: never }
    | { color?: never; theme: Record<keyof typeof THEMES, string> }
  )
>

type ChartContextProps = {
  config: ChartConfig
}

const ChartContext = React.createContext<ChartContextProps | null>(null)

function useChart() {
  const context = React.useContext(ChartContext)

  if (!context) {
    throw new Error("useChart must be used within a <ChartContainer />")
  }

  return context
}

const ChartContainer = React.forwardRef<
  React.ElementRef<"div">,
  React.PropsWithoutRef<React.ComponentProps<"div"> & {
  config: ChartConfig
  children: React.ComponentProps<
    typeof RechartsPrimitive.ResponsiveContainer
  >["children"]
  initialDimension?: {
    width: number
    height: number
  }
}>
>(function ChartContainer({
  id,
  className,
  children,
  config,
  initialDimension = INITIAL_DIMENSION,
  ...props
}, ref) {
  const requiredId = useSpfxUiRequiredId(id, "ChartContainer")
  const chartId = `chart-${encodeURIComponent(requiredId)
    .replace(/%/g, "_")
    .replace(/[.!~*'()]/g, (value) => `_${value.charCodeAt(0).toString(16)}_`)}`
  const { scopeValue } = useSpfxUiHost()

  return (
    <ChartContext.Provider value={{ config }}>
      <div
        ref={ref}
        data-slot="chart"
        data-chart={chartId}
        className={cn(
          "skui:flex skui:aspect-video skui:justify-center skui:text-xs skui:[&_.recharts-cartesian-axis-tick_text]:fill-muted-foreground skui:[&_.recharts-cartesian-grid_line[stroke='#ccc']]:stroke-border/50 skui:[&_.recharts-curve.recharts-tooltip-cursor]:stroke-border skui:[&_.recharts-dot[stroke='#fff']]:stroke-transparent skui:[&_.recharts-layer]:outline-hidden skui:[&_.recharts-polar-grid_[stroke='#ccc']]:stroke-border skui:[&_.recharts-radial-bar-background-sector]:fill-muted skui:[&_.recharts-rectangle.recharts-tooltip-cursor]:fill-muted skui:[&_.recharts-reference-line_[stroke='#ccc']]:stroke-border skui:[&_.recharts-sector]:outline-hidden skui:[&_.recharts-sector[stroke='#fff']]:stroke-transparent skui:[&_.recharts-surface]:outline-hidden",
          className
        )}
        {...props}
      >
        <ChartStyle id={chartId} config={config} scopeValue={scopeValue} />
        <RechartsPrimitive.ResponsiveContainer
          initialDimension={initialDimension}
        >
          {children}
        </RechartsPrimitive.ResponsiveContainer>
      </div>
    </ChartContext.Provider>
  )

})

function safeChartCssName(value: string) {
  if (!/^[A-Za-z_][A-Za-z0-9_-]*$/.test(value)) {
    throw new Error("ChartConfig keys must be CSS identifier-safe")
  }
  return value
}

function safeChartCssColor(value: string) {
  if (/[;{}\\]|url\s*\(/i.test(value)) {
    throw new Error("ChartConfig colors must be single safe CSS color values")
  }
  return value
}

const ChartStyle = ({
  id,
  config,
  scopeValue,
}: {
  id: string
  config: ChartConfig
  scopeValue: string
}) => {
  const colorConfig = Object.entries(config).filter(
    ([, config]) => config.theme ?? config.color
  )

  if (!colorConfig.length) {
    return null
  }

  return (
    <style
      dangerouslySetInnerHTML={{
        __html: Object.entries(THEMES)
          .map(
            ([theme, prefix]) => `
[data-spfx-ui-scope="${scopeValue}"]${prefix} [data-chart="${id}"] {
${colorConfig
  .map(([key, itemConfig]) => {
    const color =
      itemConfig.theme?.[theme as keyof typeof itemConfig.theme] ??
      itemConfig.color
    return color ? `  --color-${safeChartCssName(key)}: ${safeChartCssColor(color)};` : null
  })
  .join("\n")}
}
`
          )
          .join("\n"),
      }}
    />
  )
}

const ChartTooltip = RechartsPrimitive.Tooltip

function ChartTooltipContent({
  active,
  payload,
  className,
  indicator = "dot",
  hideLabel = false,
  hideIndicator = false,
  label,
  labelFormatter,
  labelClassName,
  formatter,
  color,
  nameKey,
  labelKey,
}: React.ComponentProps<typeof RechartsPrimitive.Tooltip> &
  React.ComponentProps<"div"> & {
    hideLabel?: boolean
    hideIndicator?: boolean
    indicator?: "line" | "dot" | "dashed"
    nameKey?: string
    labelKey?: string
  } & Omit<
    RechartsPrimitive.DefaultTooltipContentProps<
      TooltipValueType,
      TooltipNameType
    >,
    "accessibilityLayer"
  >) {
  const { config } = useChart()

  const tooltipLabel = React.useMemo(() => {
    if (hideLabel || !payload?.length) {
      return null
    }

    const [item] = payload
    const key = `${labelKey ?? item?.dataKey ?? item?.name ?? "value"}`
    const itemConfig = getPayloadConfigFromPayload(config, item, key)
    const value =
      !labelKey && typeof label === "string"
        ? (config[label]?.label ?? label)
        : itemConfig?.label

    if (labelFormatter) {
      return (
        <div className={cn("skui:font-medium", labelClassName)}>
          {labelFormatter(value, payload)}
        </div>
      )
    }

    if (!value) {
      return null
    }

    return <div className={cn("skui:font-medium", labelClassName)}>{value}</div>
  }, [
    label,
    labelFormatter,
    payload,
    hideLabel,
    labelClassName,
    config,
    labelKey,
  ])

  if (!active || !payload?.length) {
    return null
  }

  const nestLabel = payload.length === 1 && indicator !== "dot"

  return (
    <div
      className={cn(
        "skui:grid skui:min-w-32 skui:items-start skui:gap-1.5 skui:rounded-lg skui:border skui:border-border/50 skui:bg-background skui:px-2.5 skui:py-1.5 skui:text-xs skui:shadow-xl",
        className
      )}
    >
      {!nestLabel ? tooltipLabel : null}
      <div className="skui:grid skui:gap-1.5">
        {payload
          .filter((item) => item.type !== "none")
          .map((item, index) => {
            const key = `${nameKey ?? item.name ?? item.dataKey ?? "value"}`
            const itemConfig = getPayloadConfigFromPayload(config, item, key)
            const indicatorColor = color ?? item.payload?.fill ?? item.color

            return (
              <div
                key={index}
                className={cn(
                  "skui:flex skui:w-full skui:flex-wrap skui:items-stretch skui:gap-2 skui:[&>svg]:h-2.5 skui:[&>svg]:w-2.5 skui:[&>svg]:text-muted-foreground",
                  indicator === "dot" && "skui:items-center"
                )}
              >
                {formatter && item?.value !== undefined && item.name ? (
                  formatter(item.value, item.name, item, index, item.payload)
                ) : (
                  <>
                    {itemConfig?.icon ? (
                      <itemConfig.icon />
                    ) : (
                      !hideIndicator && (
                        <div
                          className={cn(
                            "skui:shrink-0 skui:rounded-[2px] skui:border-(--color-border) skui:bg-(--color-bg)",
                            {
                              "skui:h-2.5 skui:w-2.5": indicator === "dot",
                              "skui:w-1": indicator === "line",
                              "skui:w-0 skui:border-[1.5px] skui:border-dashed skui:bg-transparent":
                                indicator === "dashed",
                              "skui:my-0.5": nestLabel && indicator === "dashed",
                            }
                          )}
                          style={
                            {
                              "--color-bg": indicatorColor,
                              "--color-border": indicatorColor,
                            } as React.CSSProperties
                          }
                        />
                      )
                    )}
                    <div
                      className={cn(
                        "skui:flex skui:flex-1 skui:justify-between skui:leading-none",
                        nestLabel ? "skui:items-end" : "skui:items-center"
                      )}
                    >
                      <div className="skui:grid skui:gap-1.5">
                        {nestLabel ? tooltipLabel : null}
                        <span className="skui:text-muted-foreground">
                          {itemConfig?.label ?? item.name}
                        </span>
                      </div>
                      {item.value != null && (
                        <span className="skui:font-mono skui:font-medium skui:text-foreground skui:tabular-nums">
                          {typeof item.value === "number"
                            ? item.value.toLocaleString()
                            : String(item.value)}
                        </span>
                      )}
                    </div>
                  </>
                )}
              </div>
            )
          })}
      </div>
    </div>
  )
}

const ChartLegend = RechartsPrimitive.Legend

function ChartLegendContent({
  className,
  hideIcon = false,
  payload,
  verticalAlign = "bottom",
  nameKey,
}: React.ComponentProps<"div"> & {
  hideIcon?: boolean
  nameKey?: string
} & RechartsPrimitive.DefaultLegendContentProps) {
  const { config } = useChart()

  if (!payload?.length) {
    return null
  }

  return (
    <div
      className={cn(
        "skui:flex skui:items-center skui:justify-center skui:gap-4",
        verticalAlign === "top" ? "skui:pb-3" : "skui:pt-3",
        className
      )}
    >
      {payload
        .filter((item) => item.type !== "none")
        .map((item, index) => {
          const key = `${nameKey ?? item.dataKey ?? "value"}`
          const itemConfig = getPayloadConfigFromPayload(config, item, key)

          return (
            <div
              key={index}
              className={cn(
                "skui:flex skui:items-center skui:gap-1.5 skui:[&>svg]:h-3 skui:[&>svg]:w-3 skui:[&>svg]:text-muted-foreground"
              )}
            >
              {itemConfig?.icon && !hideIcon ? (
                <itemConfig.icon />
              ) : (
                <div
                  className="skui:h-2 skui:w-2 skui:shrink-0 skui:rounded-[2px]"
                  style={{
                    backgroundColor: item.color,
                  }}
                />
              )}
              {itemConfig?.label}
            </div>
          )
        })}
    </div>
  )
}

function getPayloadConfigFromPayload(
  config: ChartConfig,
  payload: unknown,
  key: string
) {
  if (typeof payload !== "object" || payload === null) {
    return undefined
  }

  const payloadPayload =
    "payload" in payload &&
    typeof payload.payload === "object" &&
    payload.payload !== null
      ? payload.payload
      : undefined

  let configLabelKey: string = key

  if (
    key in payload &&
    typeof payload[key as keyof typeof payload] === "string"
  ) {
    configLabelKey = payload[key as keyof typeof payload] as string
  } else if (
    payloadPayload &&
    key in payloadPayload &&
    typeof payloadPayload[key as keyof typeof payloadPayload] === "string"
  ) {
    configLabelKey = payloadPayload[
      key as keyof typeof payloadPayload
    ] as string
  }

  return configLabelKey in config ? config[configLabelKey] : config[key]
}

export {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  ChartLegend,
  ChartLegendContent,
  ChartStyle,
}

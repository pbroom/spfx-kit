"use client"

import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react"
import * as React from "react"
import useEmblaCarousel, {
  type UseEmblaCarouselType,
} from "embla-carousel-react"

import { cn } from "../../lib/utils"
import { Button } from "./button"

type CarouselApi = UseEmblaCarouselType[1]
type UseCarouselParameters = Parameters<typeof useEmblaCarousel>
type CarouselOptions = UseCarouselParameters[0]
type CarouselPlugin = UseCarouselParameters[1]

type CarouselProps = {
  opts?: CarouselOptions
  plugins?: CarouselPlugin
  orientation?: "horizontal" | "vertical"
  setApi?: (api: CarouselApi) => void
}

type CarouselContextProps = {
  carouselRef: ReturnType<typeof useEmblaCarousel>[0]
  api: ReturnType<typeof useEmblaCarousel>[1]
  scrollPrev: () => void
  scrollNext: () => void
  canScrollPrev: boolean
  canScrollNext: boolean
} & CarouselProps

const CarouselContext = React.createContext<CarouselContextProps | null>(null)

function useCarousel() {
  const context = React.useContext(CarouselContext)

  if (!context) {
    throw new Error("useCarousel must be used within a <Carousel />")
  }

  return context
}

const Carousel = React.forwardRef<
  React.ElementRef<"div">,
  React.PropsWithoutRef<React.ComponentProps<"div"> & CarouselProps>
>(function Carousel({
  orientation = "horizontal",
  opts,
  setApi,
  plugins,
  className,
  children,
  ...props
}, ref) {
  const [carouselRef, api] = useEmblaCarousel(
    {
      ...opts,
      axis: orientation === "horizontal" ? "x" : "y",
    },
    plugins
  )
  const [canScrollPrev, setCanScrollPrev] = React.useState(false)
  const [canScrollNext, setCanScrollNext] = React.useState(false)

  const onSelect = React.useCallback((api: CarouselApi) => {
    if (!api) return
    setCanScrollPrev(api.canScrollPrev())
    setCanScrollNext(api.canScrollNext())
  }, [])

  const scrollPrev = React.useCallback(() => {
    api?.scrollPrev()
  }, [api])

  const scrollNext = React.useCallback(() => {
    api?.scrollNext()
  }, [api])

  const handleKeyDown = React.useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      if (event.key === "ArrowLeft") {
        event.preventDefault()
        scrollPrev()
      } else if (event.key === "ArrowRight") {
        event.preventDefault()
        scrollNext()
      }
    },
    [scrollPrev, scrollNext]
  )

  React.useEffect(() => {
    if (!api || !setApi) return
    setApi(api)
  }, [api, setApi])

  React.useEffect(() => {
    if (!api) return
    onSelect(api)
    api.on("reInit", onSelect)
    api.on("select", onSelect)

    return () => {
      api?.off("select", onSelect)
    }
  }, [api, onSelect])

  return (
    <CarouselContext.Provider
      value={{
        carouselRef,
        api: api,
        opts,
        orientation:
          orientation || (opts?.axis === "y" ? "vertical" : "horizontal"),
        scrollPrev,
        scrollNext,
        canScrollPrev,
        canScrollNext,
      }}
    >
      <div
        ref={ref}
        onKeyDownCapture={handleKeyDown}
        className={cn("skui:relative", className)}
        role="region"
        aria-roledescription="carousel"
        data-slot="carousel"
        {...props}
      >
        {children}
      </div>
    </CarouselContext.Provider>
  )

})

const CarouselContent = React.forwardRef<
  React.ElementRef<"div">,
  React.PropsWithoutRef<React.ComponentProps<"div">>
>(function CarouselContent({ className, ...props }, ref) {
  const { carouselRef, orientation } = useCarousel()

  return (
    <div
      ref={carouselRef}
      className="skui:overflow-hidden"
      data-slot="carousel-content"
    >
      <div
        ref={ref}
        className={cn(
          "skui:flex",
          orientation === "horizontal" ? "skui:-ml-4" : "skui:-mt-4 skui:flex-col",
          className
        )}
        {...props}
      />
    </div>
  )

})

const CarouselItem = React.forwardRef<
  React.ElementRef<"div">,
  React.PropsWithoutRef<React.ComponentProps<"div">>
>(function CarouselItem({ className, ...props }, ref) {
  const { orientation } = useCarousel()

  return (
    <div
      ref={ref}
      role="group"
      aria-roledescription="slide"
      data-slot="carousel-item"
      className={cn(
        "skui:min-w-0 skui:shrink-0 skui:grow-0 skui:basis-full",
        orientation === "horizontal" ? "skui:pl-4" : "skui:pt-4",
        className
      )}
      {...props}
    />
  )

})

const CarouselPrevious = React.forwardRef<
  React.ElementRef<typeof Button>,
  React.PropsWithoutRef<React.ComponentProps<typeof Button>>
>(function CarouselPrevious({
  className,
  variant = "outline",
  size = "icon-sm",
  ...props
}, ref) {
  const { orientation, scrollPrev, canScrollPrev } = useCarousel()

  return (
    <Button
      ref={ref}
      data-slot="carousel-previous"
      variant={variant}
      size={size}
      className={cn(
        "skui:absolute skui:touch-manipulation skui:rounded-full",
        orientation === "horizontal"
          ? "skui:inset-y-0 skui:-left-12 skui:my-auto"
          : "skui:-top-12 skui:left-1/2 skui:-translate-x-1/2 skui:rotate-90",
        className
      )}
      disabled={!canScrollPrev}
      onClick={scrollPrev}
      {...props}
    >
      <ChevronLeftIcon
        className=""
      />
      <span className="skui:sr-only">Previous slide</span>
    </Button>
  )

})

const CarouselNext = React.forwardRef<
  React.ElementRef<typeof Button>,
  React.PropsWithoutRef<React.ComponentProps<typeof Button>>
>(function CarouselNext({
  className,
  variant = "outline",
  size = "icon-sm",
  ...props
}, ref) {
  const { orientation, scrollNext, canScrollNext } = useCarousel()

  return (
    <Button
      ref={ref}
      data-slot="carousel-next"
      variant={variant}
      size={size}
      className={cn(
        "skui:absolute skui:touch-manipulation skui:rounded-full",
        orientation === "horizontal"
          ? "skui:inset-y-0 skui:-right-12 skui:my-auto"
          : "skui:-bottom-12 skui:left-1/2 skui:-translate-x-1/2 skui:rotate-90",
        className
      )}
      disabled={!canScrollNext}
      onClick={scrollNext}
      {...props}
    >
      <ChevronRightIcon
        className=""
      />
      <span className="skui:sr-only">Next slide</span>
    </Button>
  )

})

export {
  type CarouselApi,
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselPrevious,
  CarouselNext,
  useCarousel,
}

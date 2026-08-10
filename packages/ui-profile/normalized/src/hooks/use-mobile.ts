import { useSpfxUiHost } from "../lib/ui-root"
import * as React from "react"

const MOBILE_BREAKPOINT = 768

export function useIsMobile() {
  const { targetWindow } = useSpfxUiHost()
  const [isMobile, setIsMobile] = React.useState<boolean | undefined>(undefined)

  React.useEffect(() => {
    const mql = targetWindow.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`)
    const onChange = () => {
      setIsMobile(targetWindow.innerWidth < MOBILE_BREAKPOINT)
    }
    mql.addEventListener("change", onChange)
    setIsMobile(targetWindow.innerWidth < MOBILE_BREAKPOINT)
    return () => mql.removeEventListener("change", onChange)
  }, [targetWindow])

  return !!isMobile
}

import { useEffect, useState, useRef } from 'react'

type NumberTickerProps = {
  value: number
  decimalPlaces?: number
  duration?: number
  className?: string
  suffix?: string
  prefix?: string
}

export function NumberTicker({
  value,
  decimalPlaces = 0,
  duration = 600,
  className = '',
  suffix = '',
  prefix = '',
}: NumberTickerProps) {
  const [displayValue, setDisplayValue] = useState<number>(0)
  const prevValueRef = useRef<number>(0)
  const startTimeRef = useRef<number | null>(null)
  const animFrameRef = useRef<number | null>(null)

  useEffect(() => {
    const startValue = prevValueRef.current
    const targetValue = value
    startTimeRef.current = null

    // If reduced motion is requested or target is identical, set immediately
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches || duration <= 0) {
      setDisplayValue(targetValue)
      prevValueRef.current = targetValue
      return
    }

    const animate = (timestamp: number) => {
      if (!startTimeRef.current) startTimeRef.current = timestamp
      const elapsed = timestamp - startTimeRef.current
      const progress = Math.min(elapsed / duration, 1)

      // Ease out exponential curve
      const ease = progress === 1 ? 1 : 1 - Math.pow(2, -10 * progress)
      const current = startValue + (targetValue - startValue) * ease

      setDisplayValue(current)

      if (progress < 1) {
        animFrameRef.current = requestAnimationFrame(animate)
      } else {
        setDisplayValue(targetValue)
        prevValueRef.current = targetValue
      }
    }

    animFrameRef.current = requestAnimationFrame(animate)

    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current)
    }
  }, [value, duration])

  const formatted = decimalPlaces > 0
    ? displayValue.toLocaleString(undefined, {
        minimumFractionDigits: decimalPlaces,
        maximumFractionDigits: decimalPlaces,
      })
    : Math.round(displayValue).toLocaleString()

  return (
    <span className={`number-ticker ${className}`}>
      {prefix}
      {formatted}
      {suffix}
    </span>
  )
}

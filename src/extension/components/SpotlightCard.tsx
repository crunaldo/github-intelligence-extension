import React, { useRef, useState } from 'react'

type SpotlightCardProps = {
  children: React.ReactNode
  className?: string
  style?: React.CSSProperties
  spotlightColor?: string
  borderColor?: string
  radius?: string
  onClick?: (e: React.MouseEvent<HTMLDivElement>) => void
}

export function SpotlightCard({
  children,
  className = '',
  style = {},
  spotlightColor = 'rgba(255, 47, 90, 0.14)', // Brand primary radiant glow (#FF2F5A)
  borderColor = 'var(--border-subtle)',
  radius = 'var(--radius-md)',
  onClick,
}: SpotlightCardProps) {
  const cardRef = useRef<HTMLDivElement>(null)
  const [position, setPosition] = useState<{ x: number; y: number }>({ x: 0, y: 0 })
  const [opacity, setOpacity] = useState<number>(0)

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!cardRef.current) return
    const rect = cardRef.current.getBoundingClientRect()
    setPosition({
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    })
  }

  const handleMouseEnter = () => setOpacity(1)
  const handleMouseLeave = () => setOpacity(0)

  return (
    <div
      ref={cardRef}
      onMouseMove={handleMouseMove}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onClick={onClick}
      className={`spotlight-card ${className}`}
      style={{
        position: 'relative',
        borderRadius: radius,
        border: `1px solid ${borderColor}`,
        overflow: 'hidden',
        transition: 'border-color 0.2s ease, box-shadow 0.2s ease',
        ...style,
      }}
    >
      {/* Moving radial spotlight overlay */}
      <div
        className="spotlight-layer"
        style={{
          pointerEvents: 'none',
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          opacity,
          transition: 'opacity 0.25s ease',
          background: `radial-gradient(circle 180px at ${position.x}px ${position.y}px, ${spotlightColor}, transparent 80%)`,
          zIndex: 1,
        }}
      />
      <div style={{ position: 'relative', zIndex: 2, width: '100%' }}>{children}</div>
    </div>
  )
}

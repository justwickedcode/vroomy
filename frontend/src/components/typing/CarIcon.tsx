import type { CSSProperties } from 'react'

export default function CarIcon({
  className,
  color,
  style,
}: {
  className?: string
  color: string
  style?: CSSProperties
}) {
  return (
    <svg
      viewBox="0 0 36 20"
      className={className}
      aria-hidden="true"
      style={{ overflow: 'visible', ...style }}
    >
      <rect x="7" y="1.5" width="5" height="3.2" rx="1.2" fill="#1f2430" />
      <rect x="7" y="15.3" width="5" height="3.2" rx="1.2" fill="#1f2430" />
      <rect x="23" y="1.5" width="5" height="3.2" rx="1.2" fill="#1f2430" />
      <rect x="23" y="15.3" width="5" height="3.2" rx="1.2" fill="#1f2430" />
      <rect x="1.5" y="4.5" width="31" height="11" rx="5.5" fill={color} />
      <rect
        x="20"
        y="6.3"
        width="9"
        height="7.4"
        rx="2.6"
        fill="black"
        opacity="0.25"
      />
      <rect
        x="4"
        y="6.3"
        width="7"
        height="7.4"
        rx="2.2"
        fill="white"
        opacity="0.18"
      />
    </svg>
  )
}

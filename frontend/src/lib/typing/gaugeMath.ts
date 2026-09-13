// Shared polar/arc geometry for the app's SVG gauges (currently PaceDial) —
// they draw on a 100x100 viewBox centered at (50,50), so this only needs
// to be parametrized by angle and radius.
const CENTER = 50

export function polar(deg: number, radius: number) {
  const rad = (deg * Math.PI) / 180
  return {
    x: CENTER + radius * Math.sin(rad),
    y: CENTER - radius * Math.cos(rad),
  }
}

export function arcPath(startDeg: number, endDeg: number, radius: number) {
  const start = polar(startDeg, radius)
  const end = polar(endDeg, radius)
  const largeArc = endDeg - startDeg <= 180 ? 0 : 1
  return `M ${start.x} ${start.y} A ${radius} ${radius} 0 ${largeArc} 1 ${end.x} ${end.y}`
}

import { cn } from '#/lib/utils'

// For a number with no natural ceiling (elapsed time, a race count) there's nothing
// for a Gauge's needle to point at — this is a plain digital readout sized to sit
// level with Gauge in the same row.
export default function DigitalReadout({
  value,
  label,
  size,
}: {
  value: string
  label: string
  size?: 'lg'
}) {
  return (
    <div className={cn('digital-readout', size === 'lg' && 'digital-readout--lg')}>
      <span className="gauge-value">{value}</span>
      <span className="gauge-label">{label}</span>
    </div>
  )
}

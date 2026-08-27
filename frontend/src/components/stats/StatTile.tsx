import type { LucideIcon } from 'lucide-react'

export default function StatTile({
  icon: Icon,
  label,
  value,
}: {
  icon: LucideIcon
  label: string
  value: string
}) {
  return (
    <div className="glass-chip rounded-lg p-4">
      <Icon className="mb-2 size-4 text-primary" strokeWidth={2.5} />
      <p className="font-mono text-2xl font-extrabold tabular-nums">{value}</p>
      <p className="kicker mt-0.5">{label}</p>
    </div>
  )
}

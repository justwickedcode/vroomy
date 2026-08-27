import { cn } from '#/lib/utils'

type Finger = 'lp' | 'lr' | 'lm' | 'li' | 'ri' | 'rm' | 'rr' | 'rp' | 'th'

interface KeyDef {
  label: string
  key?: string
  grow?: number
  finger: Finger
}

// Standard touch-typing finger chart — each key's home finger, used to
// tint a bottom-edge indicator so the keyboard doubles as a finger-zone
// reference the way keybr.com's does, without needing a hand illustration.
const FINGER_COLOR: Record<Finger, string> = {
  lp: '#fb7185',
  lr: '#c084fc',
  lm: '#60a5fa',
  li: '#34d399',
  ri: '#2dd4bf',
  rm: '#22d3ee',
  rr: '#a78bfa',
  rp: '#f472b6',
  th: '#7d8494',
}

const ROWS: Array<Array<KeyDef>> = [
  [
    { label: '`', key: '`', finger: 'lp' },
    { label: '1', key: '1', finger: 'lp' },
    { label: '2', key: '2', finger: 'lr' },
    { label: '3', key: '3', finger: 'lm' },
    { label: '4', key: '4', finger: 'li' },
    { label: '5', key: '5', finger: 'li' },
    { label: '6', key: '6', finger: 'ri' },
    { label: '7', key: '7', finger: 'ri' },
    { label: '8', key: '8', finger: 'rm' },
    { label: '9', key: '9', finger: 'rr' },
    { label: '0', key: '0', finger: 'rp' },
    { label: '-', key: '-', finger: 'rp' },
    { label: '=', key: '=', finger: 'rp' },
    { label: 'Backspace', grow: 2, finger: 'rp' },
  ],
  [
    { label: 'Tab', grow: 1.5, finger: 'lp' },
    { label: 'q', key: 'q', finger: 'lp' },
    { label: 'w', key: 'w', finger: 'lr' },
    { label: 'e', key: 'e', finger: 'lm' },
    { label: 'r', key: 'r', finger: 'li' },
    { label: 't', key: 't', finger: 'li' },
    { label: 'y', key: 'y', finger: 'ri' },
    { label: 'u', key: 'u', finger: 'ri' },
    { label: 'i', key: 'i', finger: 'rm' },
    { label: 'o', key: 'o', finger: 'rr' },
    { label: 'p', key: 'p', finger: 'rp' },
    { label: '[', key: '[', finger: 'rp' },
    { label: ']', key: ']', finger: 'rp' },
  ],
  [
    { label: 'Caps', grow: 1.75, finger: 'lp' },
    { label: 'a', key: 'a', finger: 'lp' },
    { label: 's', key: 's', finger: 'lr' },
    { label: 'd', key: 'd', finger: 'lm' },
    { label: 'f', key: 'f', finger: 'li' },
    { label: 'g', key: 'g', finger: 'li' },
    { label: 'h', key: 'h', finger: 'ri' },
    { label: 'j', key: 'j', finger: 'ri' },
    { label: 'k', key: 'k', finger: 'rm' },
    { label: 'l', key: 'l', finger: 'rr' },
    { label: ';', key: ';', finger: 'rp' },
    { label: 'Enter', grow: 2.25, finger: 'rp' },
  ],
  [
    { label: 'Shift', grow: 2.25, finger: 'lp' },
    { label: 'z', key: 'z', finger: 'lp' },
    { label: 'x', key: 'x', finger: 'lr' },
    { label: 'c', key: 'c', finger: 'lm' },
    { label: 'v', key: 'v', finger: 'li' },
    { label: 'b', key: 'b', finger: 'li' },
    { label: 'n', key: 'n', finger: 'ri' },
    { label: 'm', key: 'm', finger: 'ri' },
    { label: ',', key: ',', finger: 'rm' },
    { label: '.', key: '.', finger: 'rr' },
    { label: '/', key: '/', finger: 'rp' },
    { label: 'Shift', grow: 2.25, finger: 'rp' },
  ],
  [{ label: 'Space', key: ' ', grow: 6, finger: 'th' }],
]

export default function Keyboard({ activeKey }: { activeKey: string | null }) {
  return (
    <div className="flex flex-col gap-1.5 rounded-xl bg-black/25 p-3">
      {ROWS.map((row, r) => (
        <div key={r} className="flex gap-1.5">
          {row.map((k, i) => {
            const active =
              activeKey !== null &&
              k.key !== undefined &&
              k.key.toLowerCase() === activeKey.toLowerCase()
            return (
              <span
                key={`${k.label}-${i}`}
                style={{
                  flexGrow: k.grow ?? 1,
                  borderBottomColor: active
                    ? undefined
                    : FINGER_COLOR[k.finger],
                }}
                className={cn(
                  'flex h-8 items-center justify-center rounded-md border border-b-2 font-mono text-[0.65rem] uppercase transition-colors duration-150 sm:h-9',
                  active
                    ? 'border-primary bg-primary text-primary-foreground shadow-[0_0_12px_-2px_var(--color-primary)]'
                    : 'border-border/70 bg-secondary/50 text-muted-foreground',
                )}
              >
                {k.label === ' ' ? '' : k.label}
              </span>
            )
          })}
        </div>
      ))}
    </div>
  )
}

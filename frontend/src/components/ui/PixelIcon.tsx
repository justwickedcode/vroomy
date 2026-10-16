import { cn } from '#/lib/utils'

// Pixel-art icons in the same flat, hard-edged style as the car sprites (see public/cars/).
// Each icon is a 16x16 grid, one character per pixel, drawn as crisp SVG rects so it stays sharp
// at any whole-number scale (16px, 32px...).
//
// Two kinds:
// - "mono" icons follow the surrounding text color, so nav links keep their active/hover
//   colors: '#' is currentColor, '+' is currentColor at 45% for shading.
// - "color" icons use fixed colors from PALETTE (the power-ups and the logo).
// '.' is transparent in both.

const PALETTE: Record<string, string> = {
  K: '#14110d',
  Y: '#f5b400',
  L: '#ffd64d',
  D: '#c47f00',
  G: '#22252c',
  g: '#3a3f4a',
  W: '#fff4c9',
  R: '#e0352b',
  r: '#ff7a5c',
  O: '#fb5607',
  B: '#38bdf8',
  b: '#bae6fd',
  P: '#a855f7',
  p: '#d8b4fe',
  S: '#cbd5e1',
  F: '#ffe36b',
  N: '#7c2d12',
  n: '#c2410c',
}

const ICONS = {
  keyboard: {
    kind: 'mono',
    rows: [
      '................',
      '................',
      '................',
      '.##############.',
      '#++++++++++++++#',
      '#+#+#+#+#+#+#++#',
      '#++++++++++++++#',
      '#++#+#+#+#+#+#+#',
      '#++++++++++++++#',
      '#+#+##########+#',
      '#++++++++++++++#',
      '.##############.',
      '................',
      '................',
      '................',
      '................',
    ],
  },
  stats: {
    kind: 'mono',
    rows: [
      '................',
      '................',
      '.#..............',
      '.#..........##..',
      '.#..........##..',
      '.#......##..##..',
      '.#......##..##..',
      '.#..##..##..##..',
      '.#..##..##..##..',
      '.#..##..##..##..',
      '.#..##..##..##..',
      '.#..##..##..##..',
      '.##############.',
      '................',
      '................',
      '................',
    ],
  },
  achievements: {
    kind: 'mono',
    rows: [
      '................',
      '....##....##....',
      '....#+#..#+#....',
      '.....#+##+#.....',
      '......#++#......',
      '.....######.....',
      '....#++++++#....',
      '...#+++##+++#...',
      '...#++####++#...',
      '...#+++##+++#...',
      '...#++#++#++#...',
      '....#++++++#....',
      '.....######.....',
      '................',
      '................',
      '................',
    ],
  },
  garage: {
    kind: 'mono',
    rows: [
      '................',
      '................',
      '.......##.......',
      '.....######.....',
      '...##++++++##...',
      '.##++++++++++##.',
      '.#++########++#.',
      '.#+#........#+#.',
      '.#+#.######.#+#.',
      '.#+#.#++++#.#+#.',
      '.#+#.######.#+#.',
      '.#+#.#....#.#+#.',
      '.###.######.###.',
      '................',
      '................',
      '................',
    ],
  },
  leaderboards: {
    kind: 'mono',
    rows: [
      '................',
      '................',
      '...##########...',
      '.###++++++++###.',
      '.#.#++++++++#.#.',
      '.#.#++++++++#.#.',
      '..##++++++++##..',
      '....#++++++#....',
      '.....#++++#.....',
      '......####......',
      '.......##.......',
      '.......##.......',
      '.....######.....',
      '....########....',
      '................',
      '................',
    ],
  },
  friends: {
    kind: 'mono',
    rows: [
      '................',
      '................',
      '....###.........',
      '...#+++#........',
      '...#+++#....#...',
      '...#+++#....#...',
      '....###...#####.',
      '............#...',
      '..#######...#...',
      '.#+++++++#......',
      '.#+++++++#......',
      '.#+++++++#......',
      '.#########......',
      '................',
      '................',
      '................',
    ],
  },
  replays: {
    kind: 'mono',
    rows: [
      '................',
      '................',
      '.....######.....',
      '...##......##...',
      '..#..........#..',
      '..#...##.....#..',
      '.#....###.....#.',
      '.#....####....#.',
      '.#....####....#.',
      '.#....###.....#.',
      '..#...##.....#..',
      '..#..........#..',
      '...##......##...',
      '.....######.....',
      '................',
      '................',
    ],
  },
  logo: {
    kind: 'color',
    rows: [
      '................',
      '................',
      '................',
      '...KKKKKKKKKK...',
      '..KYYYYYYYYYYKK.',
      '.KRYYYYYLLLLYYYK',
      'KDKGKGYGGGGgYYWK',
      'KDKGKGYGGGGGYYYK',
      'KDKGKGYGGGGGYYYK',
      'KDKGKGYGGGGgYYWK',
      '.KRYYYYDDDDDYYYK',
      '..KYYYYYYYYYYKK.',
      '...KKKKKKKKKK...',
      '................',
      '................',
      '................',
    ],
  },
  boost: {
    kind: 'color',
    rows: [
      '................',
      '.........KKK....',
      '........KLYK....',
      '.......KLYK.....',
      '......KLYYK.....',
      '.....KLYYK......',
      '....KLYYYKKKK...',
      '...KLYYYYYYYK...',
      '...KKKKKYYYK....',
      '......KYYYK.....',
      '.....KYYYK......',
      '.....KYYK.......',
      '....KYDK........',
      '....KDK.........',
      '....KK..........',
      '................',
    ],
  },
  nitro: {
    kind: 'color',
    rows: [
      '................',
      '.......K........',
      '......KOK.......',
      '......KOK..K....',
      '.....KOOOK.KK...',
      '....KOOFOOKOK...',
      '...KOOFFOOOOK...',
      '...KOFFFFOOOK...',
      '..KOOFFFFFOOOK..',
      '..KOFFFWWFFOOK..',
      '..KOFFWWWWFFOK..',
      '..KOFFWWWWFFOK..',
      '...KOFFWWFFOK...',
      '....KKOOOOKK....',
      '......KKKK......',
      '................',
    ],
  },
  shell: {
    kind: 'color',
    rows: [
      '................',
      '................',
      '......KKKK......',
      '....KKRRRRKK....',
      '...KRRrrRRRRK...',
      '..KRRrSSSSRRRK..',
      '..KRrSKRRKSRRK..',
      '.KRRSKRRRRKSRRK.',
      '.KRRSKRRRRKSRRK.',
      '.KRRRSKRRKSRRRK.',
      '..KRRRSSSSRRRK..',
      '..KSSSSSSSSSSK..',
      '...KSSSSSSSSK...',
      '....KKKKKKKK....',
      '................',
      '................',
    ],
  },
  emp: {
    kind: 'color',
    rows: [
      '................',
      '..KK........KK..',
      '.KbK..KKKK..KbK.',
      '.Kb..KbbbbK..bK.',
      'KbK.KbK..KbK.KbK',
      'Kb..Kb.KK.bK..bK',
      'Kb..Kb.KBK.bK.bK',
      'KbK..K.KBK.K.KbK',
      '.Kb.....KBK..bK.',
      '.KbK...KBBK.KbK.',
      '..KK...KBBK..KK.',
      '.......KBBK.....',
      '......KBBBBK....',
      '.....KBBBBBBK...',
      '.....KKKKKKKK...',
      '................',
    ],
  },
  magnet: {
    kind: 'color',
    rows: [
      '................',
      '................',
      '..KKKK....KKKK..',
      '..KSSK....KSSK..',
      '..KSSK....KSSK..',
      '..KPPK....KPPK..',
      '..KPPK....KPPK..',
      '..KPPK....KPPK..',
      '..KPPPK..KPPPK..',
      '..KPpPPKKPPPPK..',
      '...KPppPPPPPK...',
      '...KKPPPPPPKK...',
      '.....KKKKKK.....',
      '................',
      '................',
      '................',
    ],
  },
  nuke: {
    kind: 'color',
    rows: [
      '................',
      '....KKKKKKKK....',
      '..KKnOOOOOOnKK..',
      '.KnOOFFFFFFOOnK.',
      '.KOFFWWWWWWFFOK.',
      '.KnOFFFFFFFFOnK.',
      '..KKnnOOOOnnKK..',
      '....KKnOOnKK....',
      '......KOOK......',
      '......KFOK......',
      '.....KOFFOK.....',
      '....KnOFFOnK....',
      '..KKnnOOOOnnKK..',
      '.KnnnnnnnnnnnnK.',
      '.KKKKKKKKKKKKKK.',
      '................',
    ],
  },
  coin: {
    kind: 'color',
    rows: [
      '................',
      '................',
      '.....KKKKKK.....',
      '....KYLLLLYK....',
      '...KYLYYYYYDK...',
      '..KYLYYKKKYYDK..',
      '..KYLYKYYYYYDK..',
      '..KYLYKYYYYYDK..',
      '..KYLYKYYYYYDK..',
      '..KYLYKYYYYYDK..',
      '..KYLYYKKKYYDK..',
      '...KYYYYYYYDK...',
      '....KDDDDDDK....',
      '.....KKKKKK.....',
      '................',
      '................',
    ],
  },
} as const satisfies Record<
  string,
  { kind: 'mono' | 'color'; rows: ReadonlyArray<string> }
>

export type PixelIconName = keyof typeof ICONS

interface Run {
  x: number
  y: number
  width: number
  char: string
}

// Merges each row's consecutive same-character pixels into one rect, so an icon is a few dozen
// elements rather than up to 256.
function runsOf(rows: ReadonlyArray<string>): Array<Run> {
  const runs: Array<Run> = []
  rows.forEach((row, y) => {
    let x = 0
    while (x < row.length) {
      const char = row[x]
      let end = x + 1
      while (end < row.length && row[end] === char) end++
      if (char !== '.') runs.push({ x, y, width: end - x, char })
      x = end
    }
  })
  return runs
}

const RUNS = Object.fromEntries(
  Object.entries(ICONS).map(([name, icon]) => [name, runsOf(icon.rows)]),
) as Record<PixelIconName, Array<Run>>

export default function PixelIcon({
  name,
  className,
  title,
}: {
  name: PixelIconName
  className?: string
  title?: string
}) {
  const mono = ICONS[name].kind === 'mono'
  return (
    <svg
      viewBox="0 0 16 16"
      shapeRendering="crispEdges"
      className={cn('size-4 shrink-0', className)}
      role={title ? 'img' : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
    >
      {RUNS[name].map((run) => (
        <rect
          key={`${run.x}-${run.y}`}
          x={run.x}
          y={run.y}
          width={run.width}
          height={1}
          fill={mono ? 'currentColor' : PALETTE[run.char]}
          fillOpacity={mono && run.char === '+' ? 0.45 : undefined}
        />
      ))}
    </svg>
  )
}

// The logo as a standalone SVG document, for the favicon data URL (see __root.tsx) — the same
// pixels as <PixelIcon name="logo" />.
export function logoSvgMarkup(): string {
  const rects = RUNS.logo
    .map(
      (r) =>
        `<rect x='${r.x}' y='${r.y}' width='${r.width}' height='1' fill='${PALETTE[r.char]}'/>`,
    )
    .join('')
  return `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16' shape-rendering='crispEdges'>${rects}</svg>`
}

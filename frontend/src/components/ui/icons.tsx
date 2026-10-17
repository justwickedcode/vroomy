import PixelIcon from '#/components/ui/PixelIcon'
import type { CSSProperties, FunctionComponent } from 'react'
import type { PixelIconName } from '#/components/ui/PixelIcon'

// The app's icon set, drawn as pixel art (see PixelIcon) to match the car sprites. Each export
// has the same name and props as the lucide-react icon it replaced, so swapping a file over is
// just its import line. Each is drawn in its own color with sprite-style shading; a color passed
// in style tints it instead (medals), and `mono` draws it flat in the text color.

export interface IconProps {
  className?: string
  style?: CSSProperties
  // Flat, in the surrounding text color, instead of the icon's own colors — for faint
  // decorative uses where color would be too loud.
  mono?: boolean
  // Accepted for drop-in compatibility with lucide's props; pixel icons have no stroke.
  strokeWidth?: number | string
}

export type IconComponent = FunctionComponent<IconProps>

function pixel(name: PixelIconName, displayName: string): IconComponent {
  // A text color passed in style (gold/silver/bronze medals) becomes the icon's tint.
  const Icon = ({ className, style, mono }: IconProps) => (
    <PixelIcon
      name={name}
      className={className}
      style={style}
      tint={typeof style?.color === 'string' ? style.color : undefined}
      mono={mono}
    />
  )
  Icon.displayName = displayName
  return Icon
}

export const ArrowLeft = pixel('arrow-left', 'ArrowLeft')
export const ArrowRight = pixel('arrow-right', 'ArrowRight')
export const Award = pixel('achievements', 'Award')
export const CalendarClock = pixel('calendar-clock', 'CalendarClock')
export const CalendarDays = pixel('calendar', 'CalendarDays')
export const Check = pixel('check', 'Check')
export const CheckCheck = pixel('check-check', 'CheckCheck')
export const ChevronRight = pixel('chevron-right', 'ChevronRight')
export const Clock = pixel('clock', 'Clock')
export const Copy = pixel('copy', 'Copy')
export const Crosshair = pixel('crosshair', 'Crosshair')
export const Crown = pixel('crown', 'Crown')
export const ExternalLink = pixel('external', 'ExternalLink')
export const Flag = pixel('flag', 'Flag')
export const Flame = pixel('flame', 'Flame')
export const Gauge = pixel('gauge', 'Gauge')
export const Keyboard = pixel('keyboard', 'Keyboard')
export const Link2 = pixel('link', 'Link2')
export const Lock = pixel('lock', 'Lock')
export const LogIn = pixel('log-in', 'LogIn')
export const LogOut = pixel('log-out', 'LogOut')
export const MapPin = pixel('map-pin', 'MapPin')
export const Medal = pixel('achievements', 'Medal')
export const Menu = pixel('menu', 'Menu')
export const Milestone = pixel('milestone', 'Milestone')
export const Minus = pixel('minus', 'Minus')
export const Monitor = pixel('monitor', 'Monitor')
export const Moon = pixel('moon', 'Moon')
export const PanelLeftClose = pixel('panel-close', 'PanelLeftClose')
export const PanelLeftOpen = pixel('panel-open', 'PanelLeftOpen')
export const Pause = pixel('pause', 'Pause')
export const Play = pixel('play', 'Play')
export const PlayCircle = pixel('replays', 'PlayCircle')
export const Plus = pixel('plus', 'Plus')
export const Rabbit = pixel('rabbit', 'Rabbit')
export const Rocket = pixel('rocket', 'Rocket')
export const RotateCcw = pixel('rotate-ccw', 'RotateCcw')
export const Route = pixel('route', 'Route')
export const Search = pixel('search', 'Search')
export const SlidersHorizontal = pixel('sliders', 'SlidersHorizontal')
export const Sparkles = pixel('sparkles', 'Sparkles')
export const Sunrise = pixel('sunrise', 'Sunrise')
export const Swords = pixel('swords', 'Swords')
export const Target = pixel('target', 'Target')
export const TrendingUp = pixel('trending-up', 'TrendingUp')
export const Trophy = pixel('leaderboards', 'Trophy')
export const UserMinus = pixel('user-minus', 'UserMinus')
export const UserPlus = pixel('friends', 'UserPlus')
export const UserRound = pixel('user', 'UserRound')
export const Users = pixel('users', 'Users')
export const Wind = pixel('wind', 'Wind')
export const X = pixel('x', 'X')
export const XIcon = pixel('x', 'XIcon')
export const Zap = pixel('zap', 'Zap')

import PixelIcon from '#/components/ui/PixelIcon'

// A pixel-art top-down supercar in the same style and amber as the Lambo sprite in the garage
// (public/cars/lambo.png), so the mark looks like it belongs to the game. Drawn at 2x (32px) so
// every pixel is a crisp 2x2 block.
export default function Logo() {
  return <PixelIcon name="logo" className="brand-logo size-8" />
}

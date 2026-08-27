import { Link } from '@tanstack/react-router'
import { ArrowLeft } from 'lucide-react'
import { Card, CardContent } from '#/components/ui/card'
import { Button } from '#/components/ui/button'
import type { LucideIcon } from 'lucide-react'

export default function ComingSoon({
  icon: Icon,
  title,
}: {
  icon: LucideIcon
  title: string
}) {
  return (
    <main className="px-4 py-8 sm:py-10">
      <div className="page-wrap">
        <Card className="rise-in overflow-hidden">
          <CardContent className="flex flex-col items-start gap-4 pt-6">
            <Icon className="size-6 text-muted-foreground" />
            <h1 className="text-lg font-bold">{title} — coming soon</h1>
            <Button variant="outline" asChild>
              <Link to="/">
                <ArrowLeft />
                Back
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    </main>
  )
}

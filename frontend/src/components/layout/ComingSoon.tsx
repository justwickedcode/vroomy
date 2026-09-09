import { Link } from '@tanstack/react-router'
import { ArrowLeft } from 'lucide-react'
import { Card, CardContent, CardHeader } from '#/components/ui/card'
import { Button } from '#/components/ui/button'
import { Badge } from '#/components/ui/badge'
import type { LucideIcon } from 'lucide-react'

export default function ComingSoon({
  icon: Icon,
  title,
}: {
  icon: LucideIcon
  title: string
}) {
  return (
    <main className="flex flex-1 flex-col justify-center px-4 py-8 sm:py-10">
      <div className="page-wrap max-w-xl">
        <Card className="rise-in overflow-hidden text-center">
          <CardHeader className="items-center py-10">
            <span className="mb-3 flex size-12 items-center justify-center rounded-full bg-secondary text-muted-foreground">
              <Icon className="size-5" />
            </span>
            <Badge variant="outline" className="mb-3">
              Coming soon
            </Badge>
            <h1 className="text-xl font-extrabold tracking-tight">{title}</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              This one's on the roadmap — not built yet.
            </p>
          </CardHeader>
          <CardContent className="pb-8">
            <Button variant="outline" asChild>
              <Link to="/">
                <ArrowLeft />
                Back to dashboard
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    </main>
  )
}

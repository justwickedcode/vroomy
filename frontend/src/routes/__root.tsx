import {
  HeadContent,
  Link,
  Scripts,
  createRootRouteWithContext,
} from '@tanstack/react-router'
import { Flag } from 'lucide-react'
import Header from '#/components/layout/Header'
import { Button } from '#/components/ui/button'
import { Card, CardContent, CardHeader } from '#/components/ui/card'

import appCss from '../styles.css?url'

import type { QueryClient } from '@tanstack/react-query'
import type { ErrorComponentProps } from '@tanstack/react-router'

const FAVICON =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' rx='7' fill='%2338bdf8'/%3E%3Cg fill='white'%3E%3Crect x='8' y='8' width='4' height='4'/%3E%3Crect x='16' y='8' width='4' height='4'/%3E%3Crect x='12' y='12' width='4' height='4'/%3E%3Crect x='20' y='12' width='4' height='4'/%3E%3Crect x='8' y='16' width='4' height='4'/%3E%3Crect x='16' y='16' width='4' height='4'/%3E%3Crect x='12' y='20' width='4' height='4'/%3E%3Crect x='20' y='20' width='4' height='4'/%3E%3C/g%3E%3C/svg%3E"

const DESCRIPTION =
  'A multiplayer typing race game — race real quotes against AI bots, type fast, and watch your car cross the finish line first.'

interface MyRouterContext {
  queryClient: QueryClient
}

export const Route = createRootRouteWithContext<MyRouterContext>()({
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      { title: 'Vroomy' },
      { name: 'description', content: DESCRIPTION },
      { name: 'theme-color', content: '#38bdf8' },
      { property: 'og:title', content: 'Vroomy' },
      { property: 'og:description', content: DESCRIPTION },
      { property: 'og:type', content: 'website' },
    ],
    links: [
      { rel: 'stylesheet', href: appCss },
      { rel: 'icon', type: 'image/svg+xml', href: FAVICON },
    ],
  }),
  shellComponent: RootDocument,
  notFoundComponent: NotFound,
  errorComponent: RouteError,
})

function RootDocument({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body className="font-sans antialiased">
        <div className="flex min-h-svh flex-col">
          <Header />
          <div className="flex flex-1 flex-col">{children}</div>
        </div>
        <Scripts />
      </body>
    </html>
  )
}

function NotFound() {
  return (
    <main className="flex min-h-[60vh] items-center justify-center px-4 py-16">
      <Card className="rise-in w-full max-w-md overflow-hidden text-center">
        <CardHeader className="items-center py-8">
          <span className="flex size-12 items-center justify-center rounded-full bg-accent text-accent-foreground">
            <Flag className="size-5" />
          </span>
          <p className="kicker mt-3">404</p>
          <h1 className="text-xl font-extrabold tracking-tight">
            This road doesn't lead anywhere.
          </h1>
        </CardHeader>
        <CardContent className="pb-8">
          <Button asChild>
            <Link to="/">Back to the start line</Link>
          </Button>
        </CardContent>
      </Card>
    </main>
  )
}

function RouteError({ error }: ErrorComponentProps) {
  return (
    <main className="flex min-h-[60vh] items-center justify-center px-4 py-16">
      <Card className="rise-in w-full max-w-md overflow-hidden text-center">
        <CardHeader className="items-center py-8">
          <span className="flex size-12 items-center justify-center rounded-full bg-destructive/15 text-destructive">
            <Flag className="size-5" />
          </span>
          <p className="kicker mt-3 text-destructive">Crashed out</p>
          <h1 className="text-xl font-extrabold tracking-tight">
            Something stalled the engine.
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {error instanceof Error ? error.message : 'Unknown error.'}
          </p>
        </CardHeader>
        <CardContent className="pb-8">
          <Button onClick={() => window.location.reload()}>Try again</Button>
        </CardContent>
      </Card>
    </main>
  )
}

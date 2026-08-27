import { Outlet, createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/race/solo')({ component: Outlet })

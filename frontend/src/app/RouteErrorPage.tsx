import { isRouteErrorResponse, Link, useRouteError } from 'react-router'
import { Button } from '@/components/ui/button'
import { errorMessage } from '@/services'

function Frame({ code, title, body }: { code: string; title: string; body: string }) {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-6 text-center">
      <p className="font-mono text-sm text-muted-foreground">{code}</p>
      <h1 className="mt-2 text-xl font-semibold">{title}</h1>
      <p className="mt-1 max-w-md text-sm text-muted-foreground">{body}</p>
      <div className="mt-6 flex gap-2">
        <Button variant="outline" onClick={() => window.location.reload()}>
          Reload
        </Button>
        <Button asChild>
          <Link to="/">Go to my home</Link>
        </Button>
      </div>
    </main>
  )
}

export function NotFoundPage() {
  return <Frame code="404" title="Page not found" body="The page you are looking for does not exist or you do not have access to it." />
}

export function RouteErrorPage() {
  const error = useRouteError()
  if (isRouteErrorResponse(error) && error.status === 404) return <NotFoundPage />
  return <Frame code="Error" title="Something went wrong" body={errorMessage(error)} />
}

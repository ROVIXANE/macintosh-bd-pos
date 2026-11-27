import { Link } from 'react-router-dom'
import { Compass } from 'lucide-react'
import { Button, Card } from '@/components/ui'

export function NotFoundPage() {
  return (
    <Card className="mx-auto max-w-md p-8 text-center">
      <Compass size={38} className="mx-auto text-slate-400" />
      <h1 className="mt-3 text-xl font-bold text-slate-900">Page not found</h1>
      <p className="mt-2 text-sm text-slate-600">The page you requested does not exist in Macintosh BD POS.</p>
      <Link to="/" className="mt-5 inline-block"><Button variant="primary">Go to dashboard</Button></Link>
    </Card>
  )
}

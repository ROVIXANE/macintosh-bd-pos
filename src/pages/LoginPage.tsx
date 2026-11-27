import { useEffect, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { LockKeyhole, Mail } from 'lucide-react'
import { Button, Card, Field, Input } from '@/components/ui'
import { useAuth } from '@/context/AuthContext'
import { useLanguage } from '@/context/LanguageContext'
import { checkConnection, configHint } from '@/lib/supabase'
import { errorMessage } from '@/lib/utils'

export function LoginPage() {
  const { session, loading, signIn } = useAuth()
  const { language, toggle, t } = useLanguage()
  const navigate = useNavigate()
  const location = useLocation()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [connection, setConnection] = useState('')

  const from = (location.state as { from?: string } | null)?.from ?? '/'

  useEffect(() => { void checkConnection().then((result) => setConnection(result.message)) }, [])
  useEffect(() => { if (!loading && session) navigate(from, { replace: true }) }, [loading, session, navigate, from])

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    setBusy(true); setError(null)
    try {
      await signIn(email, password)
      navigate(from, { replace: true })
    } catch (err) {
      setError(errorMessage(err))
    } finally { setBusy(false) }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-100 p-4">
      <Card className="w-full max-w-md p-7">
        <div className="mb-6 text-center">
          <div className="mx-auto grid h-12 w-12 place-items-center rounded-xl bg-brand-600 text-xl font-bold text-white">M</div>
          <h1 className="mt-3 text-xl font-bold text-slate-900">Macintosh BD POS</h1>
          <p className="mt-1 text-sm text-slate-500">{t('signInPrompt')}</p>
          <Button className="mt-3" size="sm" variant="ghost" onClick={toggle} aria-label={t('language')}>
            {language === 'en' ? 'বাংলা' : 'English'}
          </Button>
        </div>
        <form onSubmit={(event) => void submit(event)} className="space-y-4">
          <Field label={t('email')} required><div className="relative"><Mail size={16} className="absolute left-3 top-3 text-slate-400" /><Input className="pl-9" type="email" autoComplete="username" value={email} onChange={(event) => setEmail(event.target.value)} required /></div></Field>
          <Field label={t('password')} required><div className="relative"><LockKeyhole size={16} className="absolute left-3 top-3 text-slate-400" /><Input className="pl-9" type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required /></div></Field>
          {error && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
          <Button type="submit" variant="primary" className="w-full" loading={busy}>{t('signIn')}</Button>
        </form>
        <div className="mt-5 space-y-2 text-center text-xs text-slate-500">
          <p><Link className="text-brand-600 hover:underline" to="/setup">{t('firstTimeOwner')}</Link></p>
          <p>{connection || configHint}</p>
        </div>
      </Card>
    </div>
  )
}

import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ShieldCheck } from 'lucide-react'
import { Button, Card } from '@/components/ui'
import { useAuth } from '@/context/AuthContext'
import { useLanguage } from '@/context/LanguageContext'
import { checkConnection } from '@/lib/supabase'
import { errorMessage } from '@/lib/utils'

export function SetupPage() {
  const { session, profile, loading, bootstrapOwner } = useAuth()
  const { language, toggle, t } = useLanguage()
  const navigate = useNavigate()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [connection, setConnection] = useState('')

  useEffect(() => { void checkConnection().then((result) => setConnection(result.message)) }, [])
  useEffect(() => { if (!loading && profile) navigate('/', { replace: true }) }, [loading, profile, navigate])

  async function setup() {
    setBusy(true); setError(null)
    try { await bootstrapOwner(); navigate('/', { replace: true }) }
    catch (err) { setError(errorMessage(err)) }
    finally { setBusy(false) }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-100 p-4">
      <Card className="w-full max-w-lg p-8 text-center">
        <ShieldCheck size={40} className="mx-auto text-brand-600" />
        <h1 className="mt-3 text-xl font-bold text-slate-900">{t('firstTimeOwner')}</h1>
        <p className="mt-2 text-sm text-slate-600">{t('setupNotice')}</p>
        <Button className="mt-3" size="sm" variant="ghost" onClick={toggle} aria-label={t('language')}>
          {language === 'en' ? 'বাংলা' : 'English'}
        </Button>
        <p className="mt-3 rounded-lg bg-slate-50 p-3 text-xs text-slate-500">{connection}</p>
        {error && <p className="mt-3 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
        <div className="mt-6 flex justify-center gap-2">
          {!session ? <Link to="/login"><Button variant="primary">{t('signInFirst')}</Button></Link> : (
            <Button variant="primary" loading={busy} onClick={() => void setup()}>{t('claimOwner')}</Button>
          )}
          <Link to="/login"><Button>{t('backToLogin')}</Button></Link>
        </div>
      </Card>
    </div>
  )
}

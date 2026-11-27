import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ShieldCheck } from 'lucide-react'
import { Button, Card } from '@/components/ui'
import { useAuth } from '@/context/AuthContext'
import { useLanguage } from '@/context/LanguageContext'
import { checkConnection } from '@/lib/supabase'
import { errorMessage } from '@/lib/utils'

export function SetupPage() {
  const { session, profile, loading, signUp, bootstrapOwner } = useAuth()
  const { language, toggle, t } = useLanguage()
  const navigate = useNavigate()

  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [connection, setConnection] = useState('')
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')

  const bn = language === 'bn'

  useEffect(() => {
    void checkConnection().then((result) => setConnection(result.message))
  }, [])

  useEffect(() => {
    if (!loading && profile?.role === 'owner') navigate('/', { replace: true })
  }, [loading, profile, navigate])

  async function register(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setBusy(true)
    setError(null)
    setSuccess(null)

    try {
      await signUp(email, password, fullName)
      setSuccess(
        bn
          ? 'অ্যাকাউন্ট তৈরি হয়েছে। ইমেইল যাচাই করুন, তারপর Login করে এখানে ফিরে আসুন।'
          : 'Account created. Verify your email, then sign in and return here.'
      )
      setPassword('')
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  async function setup() {
    setBusy(true)
    setError(null)

    try {
      await bootstrapOwner()
      navigate('/', { replace: true })
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-100 p-4">
      <Card className="w-full max-w-lg p-8 text-center">
        <ShieldCheck size={40} className="mx-auto text-brand-600" />

        <h1 className="mt-3 text-xl font-bold text-slate-900">
          {t('firstTimeOwner')}
        </h1>

        <p className="mt-2 text-sm text-slate-600">
          {t('setupNotice')}
        </p>

        <Button
          className="mt-3"
          size="sm"
          variant="ghost"
          onClick={toggle}
          aria-label={t('language')}
        >
          {bn ? 'English' : 'বাংলা'}
        </Button>

        <p className="mt-3 rounded-lg bg-slate-50 p-3 text-xs text-slate-500">
          {connection}
        </p>

        {error && (
          <p className="mt-3 rounded-lg bg-red-50 p-3 text-sm text-red-700">
            {error}
          </p>
        )}

        {success && (
          <p className="mt-3 rounded-lg bg-green-50 p-3 text-sm text-green-700">
            {success}
          </p>
        )}

        {loading ? (
          <p className="mt-6 text-sm text-slate-500">
            {bn ? 'অপেক্ষা করুন...' : 'Please wait...'}
          </p>
        ) : session ? (
          <div className="mt-6 flex flex-col gap-3">
            <Button variant="primary" loading={busy} onClick={() => void setup()}>
              {t('claimOwner')}
            </Button>
            <Link to="/login">
              <Button>{t('backToLogin')}</Button>
            </Link>
          </div>
        ) : (
          <form onSubmit={register} className="mt-6 space-y-3 text-left">
            <h2 className="text-lg font-semibold text-slate-800">
              {bn ? 'প্রথম Owner অ্যাকাউন্ট তৈরি করুন' : 'Create first owner account'}
            </h2>

            <label className="block text-sm font-medium text-slate-700">
              {bn ? 'সম্পূর্ণ নাম' : 'Full name'}
              <input
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                type="text"
                autoComplete="name"
                required
                minLength={2}
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
              />
            </label>

            <label className="block text-sm font-medium text-slate-700">
              {t('email')}
              <input
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </label>

            <label className="block text-sm font-medium text-slate-700">
              {t('password')}
              <input
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                type="password"
                autoComplete="new-password"
                required
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </label>

            <p className="text-xs text-slate-500">
              {bn
                ? 'পাসওয়ার্ড কমপক্ষে ৮ অক্ষরের হতে হবে।'
                : 'Password must be at least 8 characters.'}
            </p>

            <Button
              type="submit"
              variant="primary"
              loading={busy}
              className="w-full"
            >
              {bn ? 'অ্যাকাউন্ট তৈরি করুন' : 'Create account'}
            </Button>

            <p className="text-center text-sm text-slate-600">
              {bn ? 'আগে থেকেই অ্যাকাউন্ট আছে?' : 'Already have an account?'}
              {' '}
              <Link className="font-semibold text-brand-700" to="/login">
                {t('signIn')}
              </Link>
            </p>
          </form>
        )}
      </Card>
    </div>
  )
}

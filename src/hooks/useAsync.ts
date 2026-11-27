import { useCallback, useEffect, useState } from 'react'
import { errorMessage } from '@/lib/utils'

export function useAsync<T>(loader: () => Promise<T>, deps: unknown[]) {
  const [data, setData] = useState<T | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [version, setVersion] = useState(0)

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const run = useCallback(loader, deps)

  useEffect(() => {
    let active = true
    setLoading(true)
    setError(null)
    run()
      .then((result) => { if (active) setData(result) })
      .catch((err) => { if (active) setError(errorMessage(err)) })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [run, version])

  const reload = useCallback(() => setVersion((value) => value + 1), [])
  return { data, loading, error, reload, setData }
}

import { useState } from 'react'
import { api } from '../api'
import Card from './Card'

function AuthForm({ onAuthed }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function submit(mode) {
    setError('')
    setLoading(true)
    try {
      const { token } = mode === 'signup'
        ? await api.signup(email, password)
        : await api.login(email, password)
      localStorage.setItem('seatsurge_token', token)
      onAuthed(token)
    } catch (err) {
      setError(err.message.replaceAll('_', ' '))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="mx-auto mt-16 max-w-sm px-6">
      <Card>
        <h1 className="text-xl font-bold text-slate-900">Welcome</h1>
        <p className="mt-1 text-sm text-slate-500">Sign in to grab a seat before they're gone.</p>

        <div className="mt-6 flex flex-col gap-3">
          <input
            className="rounded-lg border border-slate-200 px-3 py-2.5 text-sm outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
            placeholder="Email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <input
            className="rounded-lg border border-slate-200 px-3 py-2.5 text-sm outline-none transition focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
            placeholder="Password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>

        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

        <div className="mt-5 flex gap-2">
          <button
            disabled={loading}
            className="flex-1 rounded-lg bg-indigo-600 px-3 py-2.5 text-sm font-semibold text-white transition hover:bg-indigo-700 disabled:opacity-50"
            onClick={() => submit('login')}
          >
            Log in
          </button>
          <button
            disabled={loading}
            className="flex-1 rounded-lg border border-slate-200 px-3 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
            onClick={() => submit('signup')}
          >
            Sign up
          </button>
        </div>
      </Card>
    </div>
  )
}

export default AuthForm

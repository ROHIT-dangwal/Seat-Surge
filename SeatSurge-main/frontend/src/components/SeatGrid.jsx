import { useEffect, useState } from 'react'
import { api } from '../api'

function LegendDot({ className, label }) {
  return (
    <span className="flex items-center gap-1.5 text-xs text-slate-500">
      <span className={`h-2.5 w-2.5 rounded-full ${className}`} />
      {label}
    </span>
  )
}

function SeatGrid({ token, onHeld }) {
  const [event, setEvent] = useState(null)
  const [seats, setSeats] = useState([])
  const [error, setError] = useState('')
  const [pendingSeat, setPendingSeat] = useState(null)

  useEffect(() => {
    api.listEvents().then(({ events }) => {
      const first = events[0]
      setEvent(first)
      if (first) api.listSeats(first.id).then(({ seats }) => setSeats(seats))
    })
  }, [])

  async function hold(seat) {
    setError('')
    setPendingSeat(seat.id)
    try {
      const result = await api.holdSeat(event.id, seat.id, token)
      onHeld(result)
    } catch (err) {
      setError(err.message.replaceAll('_', ' '))
      const { seats } = await api.listSeats(event.id)
      setSeats(seats)
    } finally {
      setPendingSeat(null)
    }
  }

  if (!event) {
    return <p className="mt-20 text-center text-sm text-slate-400">Loading event…</p>
  }

  const availableCount = seats.filter((s) => s.status === 'available').length

  return (
    <div className="mx-auto mt-10 max-w-3xl px-6 pb-16">
      <h1 className="text-2xl font-bold text-slate-900">{event.name}</h1>
      <p className="mt-1 text-sm text-slate-500">
        {availableCount} of {seats.length} seats available
      </p>

      <div className="mt-4 flex gap-4">
        <LegendDot className="bg-indigo-500" label="Available" />
        <LegendDot className="bg-amber-400" label="Held" />
        <LegendDot className="bg-slate-300" label="Sold" />
      </div>

      {error && (
        <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>
      )}

      <div className="mt-6 grid grid-cols-8 gap-2 sm:grid-cols-10">
        {seats.map((seat) => {
          const available = seat.status === 'available'
          return (
            <button
              key={seat.id}
              disabled={!available || pendingSeat === seat.id}
              onClick={() => hold(seat)}
              className={`rounded-t-lg rounded-b-sm py-2.5 text-xs font-semibold transition ${
                available
                  ? 'bg-indigo-50 text-indigo-700 hover:bg-indigo-600 hover:text-white'
                  : seat.status === 'held'
                  ? 'bg-amber-50 text-amber-400'
                  : 'bg-slate-100 text-slate-300'
              } ${pendingSeat === seat.id ? 'animate-pulse' : ''} disabled:cursor-not-allowed`}
            >
              {seat.seat_label}
            </button>
          )
        })}
      </div>
    </div>
  )
}

export default SeatGrid

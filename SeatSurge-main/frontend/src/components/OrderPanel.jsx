import { useEffect, useState } from 'react'
import { api } from '../api'
import Card from './Card'
import useCountdown from '../hooks/useCountdown'

function OrderPanel({ token, order, paymentQr, onDone }) {
  const [status, setStatus] = useState(order.status)
  const [ticketCode, setTicketCode] = useState(null)
  const [validateResult, setValidateResult] = useState(null)
  const [confirmError, setConfirmError] = useState('')
  const [confirming, setConfirming] = useState(false)
  const countdown = useCountdown(order.heldUntil)

  useEffect(() => {
    if (status !== 'pending_payment') return
    const interval = setInterval(async () => {
      const result = await api.getOrder(order.id, token)
      setStatus(result.status)
      if (result.status === 'confirmed') setTicketCode(result.ticketCode)
    }, 2000)
    return () => clearInterval(interval)
  }, [status, order.id, token])

  async function validateAtGate() {
    setValidateResult(null)
    try {
      await api.validateTicket(ticketCode)
      setValidateResult({ ok: true, message: 'Ticket validated — entry granted' })
    } catch (err) {
      setValidateResult({ ok: false, message: `Validation failed: ${err.message.replaceAll('_', ' ')}` })
    }
  }

  async function confirmWithoutQr() {
    setConfirmError('')
    setConfirming(true)
    try {
      const { ticketCode: code } = await api.confirmPayment(order.paymentCode)
      setTicketCode(code)
      setStatus('confirmed')
    } catch (err) {
      setConfirmError(err.message.replaceAll('_', ' '))
    } finally {
      setConfirming(false)
    }
  }

  return (
    <div className="mx-auto mt-16 max-w-sm px-6">
      <Card className="flex flex-col items-center text-center">
        <p className="text-xs font-medium uppercase tracking-wide text-slate-400">Your seat</p>
        <h1 className="mt-1 text-2xl font-bold text-slate-900">{order.seatLabel}</h1>

        {status === 'pending_payment' && (
          <>
            <p className="mt-4 text-sm text-slate-500">Scan with your phone to confirm payment</p>
            <div className="mt-4 rounded-xl border border-slate-200 p-3">
              <img src={paymentQr} alt="payment qr" className="h-52 w-52" />
            </div>
            <div className="mt-4 flex items-center gap-2 text-xs text-slate-400">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-indigo-500" />
              Waiting for confirmation · hold expires in {countdown}
            </div>

            <div className="mt-5 flex w-full items-center gap-3 text-xs text-slate-300">
              <div className="h-px flex-1 bg-slate-200" />
              or
              <div className="h-px flex-1 bg-slate-200" />
            </div>
            <button
              disabled={confirming}
              className="mt-4 w-full rounded-lg border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
              onClick={confirmWithoutQr}
            >
              {confirming ? 'Confirming…' : 'Confirm without scanning'}
            </button>
            {confirmError && <p className="mt-2 text-sm text-red-600">{confirmError}</p>}
          </>
        )}

        {status === 'confirmed' && (
          <>
            <p className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 text-sm font-medium text-emerald-700">
              Payment confirmed
            </p>
            <p className="mt-4 break-all rounded-lg bg-slate-50 px-3 py-2 font-mono text-xs text-slate-600">
              {ticketCode}
            </p>
            <button
              className="mt-4 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-indigo-700"
              onClick={validateAtGate}
            >
              Simulate gate scan
            </button>
            {validateResult && (
              <p
                className={`mt-3 text-sm ${validateResult.ok ? 'text-emerald-600' : 'text-red-600'}`}
              >
                {validateResult.message}
              </p>
            )}
          </>
        )}

        {status === 'expired' && (
          <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">
            Your reservation expired.
          </p>
        )}

        <button
          className="mt-6 text-sm font-medium text-slate-400 underline-offset-2 transition hover:text-slate-700 hover:underline"
          onClick={onDone}
        >
          Back to seats
        </button>
      </Card>
    </div>
  )
}

export default OrderPanel

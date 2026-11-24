import { useState } from 'react'
import Header from './components/Header'
import AuthForm from './components/AuthForm'
import SeatGrid from './components/SeatGrid'
import OrderPanel from './components/OrderPanel'

function App() {
  const [token, setToken] = useState(localStorage.getItem('seatsurge_token'))
  const [heldOrder, setHeldOrder] = useState(null)

  function logout() {
    localStorage.removeItem('seatsurge_token')
    setToken(null)
    setHeldOrder(null)
  }

  return (
    <div className="min-h-screen">
      <Header authed={!!token} onLogout={logout} />
      {!token ? (
        <AuthForm onAuthed={setToken} />
      ) : heldOrder ? (
        <OrderPanel
          token={token}
          order={heldOrder.order}
          paymentQr={heldOrder.paymentQr}
          onDone={() => setHeldOrder(null)}
        />
      ) : (
        <SeatGrid token={token} onHeld={setHeldOrder} />
      )}
    </div>
  )
}

export default App

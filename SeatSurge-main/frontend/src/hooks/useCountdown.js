import { useEffect, useState } from 'react'

function useCountdown(target) {
  const [remaining, setRemaining] = useState(() => Math.max(0, new Date(target) - Date.now()))

  useEffect(() => {
    const interval = setInterval(() => {
      setRemaining(Math.max(0, new Date(target) - Date.now()))
    }, 1000)
    return () => clearInterval(interval)
  }, [target])

  const minutes = Math.floor(remaining / 60000)
  const seconds = Math.floor((remaining % 60000) / 1000)
  return `${minutes}:${seconds.toString().padStart(2, '0')}`
}

export default useCountdown

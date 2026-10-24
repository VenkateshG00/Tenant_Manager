import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

if ('serviceWorker' in navigator) {
  let hadController = Boolean(navigator.serviceWorker.controller)

  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (hadController) {
      window.location.reload()
      return
    }
    hadController = true
  })

  const checkForAppUpdate = () => {
    if (document.visibilityState !== 'visible') return
    void navigator.serviceWorker.getRegistration()
      .then((registration) => registration?.update())
      .catch((error: unknown) => {
        console.error('Could not check for an app update', error)
      })
  }

  window.addEventListener('pageshow', checkForAppUpdate)
  document.addEventListener('visibilitychange', checkForAppUpdate)
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
// Fuente del sistema de diseño (T-FAR-12): Atkinson Hyperlegible Next, SIL OFL 1.1, servida desde la app.
import '@fontsource/atkinson-hyperlegible-next/latin-400.css'
import '@fontsource/atkinson-hyperlegible-next/latin-700.css'
import './i18n'
import './tema/tokens.css'
import './index.css'
import './tema/vidrio.css'
import App from './App.tsx'

// La vista sale de la sesión y el tema es solo oscuro (specs/08-interfaz, T-FAR-21): se borran los valores
// que dejaron el selector de vista y el botón de tema anteriores.
try {
  localStorage.removeItem('vista')
  localStorage.removeItem('tema')
} catch {
  // Sin almacenamiento no hay nada que borrar.
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

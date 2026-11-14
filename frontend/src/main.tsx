import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
// Fuente del sistema de diseño (T-FAR-12): Atkinson Hyperlegible Next, SIL OFL 1.1, servida desde la app.
import '@fontsource/atkinson-hyperlegible-next/latin-400.css'
import '@fontsource/atkinson-hyperlegible-next/latin-700.css'
import './i18n'
import './tema/tokens.css'
import './index.css'
import App from './App.tsx'
import { aplicarTema, temaGuardado } from './tema/tema'

// El tema guardado se aplica antes del primer render, para no parpadear; sin él, el del sistema.
aplicarTema(temaGuardado())
// La vista ya no se guarda: sale de la sesión (specs/08-interfaz). Se borra la que dejó el selector anterior.
try {
  localStorage.removeItem('vista')
} catch {
  // Sin almacenamiento no hay nada que borrar.
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

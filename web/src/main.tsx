import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './lib/fonts.js'
import './lib/i18n.js'
import './styles.css'
import { App } from './App.js'

const root = document.getElementById('root')
if (!root) throw new Error('#root ausente no index.html')

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import SyncApp from './SyncApp'
import './styles.css'

const root = document.getElementById('root')
if (!root) throw new Error('The application root is missing.')

createRoot(root).render(<StrictMode><SyncApp /></StrictMode>)

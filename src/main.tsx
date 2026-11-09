import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import SyncApp from './SyncApp'
import './styles.css'
import { initialLanguage } from './core/languages'
import { contextualLibraryRedirect } from './core/library-navigation'

const root = document.getElementById('root')
if (!root) throw new Error('The application root is missing.')

const libraryRedirect = contextualLibraryRedirect(location.href, initialLanguage().id, import.meta.env.BASE_URL)
if (libraryRedirect) location.replace(libraryRedirect)
else createRoot(root).render(<StrictMode><SyncApp /></StrictMode>)

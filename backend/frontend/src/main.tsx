import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import ErrorBoundary from './ErrorBoundary.tsx'
import NotFoundPage from './NotFoundPage.tsx'

const path = window.location.pathname
const isKnownRoute = path === '/'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {isKnownRoute ? (
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    ) : (
      <NotFoundPage />
    )}
  </StrictMode>,
)

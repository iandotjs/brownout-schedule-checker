import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import ErrorBoundary from './ErrorBoundary.tsx'
import NotFoundPage from './NotFoundPage.tsx'
import ReportPage from './ReportPage.tsx'

const path = window.location.pathname
const isHome = path === '/'
const isReport = path === '/report'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {isHome ? (
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    ) : isReport ? (
      <ErrorBoundary>
        <ReportPage />
      </ErrorBoundary>
    ) : (
      <NotFoundPage />
    )}
  </StrictMode>,
)

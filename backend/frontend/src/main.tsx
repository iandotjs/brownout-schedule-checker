import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import ErrorBoundary from './ErrorBoundary.tsx'
import NotFoundPage from './NotFoundPage.tsx'
import ReportPage from './ReportPage.tsx'
import AdminPage from './AdminPage.tsx'

const path = window.location.pathname
const ADMIN_KEY = import.meta.env.VITE_ADMIN_KEY || ''
const adminParam = new URLSearchParams(window.location.search).get('admin')
const isAdmin = ADMIN_KEY && adminParam === ADMIN_KEY

const isHome = path === '/'
const isReport = path === '/report'
const isAdminPage = path === '/admin' && isAdmin

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {isAdminPage ? (
      <ErrorBoundary>
        <AdminPage />
      </ErrorBoundary>
    ) : isHome ? (
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

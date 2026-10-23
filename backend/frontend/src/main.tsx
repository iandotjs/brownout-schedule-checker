import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import ErrorBoundary from './ErrorBoundary.tsx'
import NotFoundPage from './NotFoundPage.tsx'
import ReportPage from './ReportPage.tsx'
import AdminPage from './AdminPage.tsx'
import { AuthProvider } from './AuthContext.tsx'

const path = window.location.pathname

const isHome = path === '/'
const isReport = path === '/report'
const isAdminPage = path === '/admin'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthProvider>
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
    </AuthProvider>
  </StrictMode>,
)

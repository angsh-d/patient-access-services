import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { useIsRestoring } from '@tanstack/react-query'
import { MainLayout } from './components/layout/MainLayout'
import { ErrorBoundary } from './components/ErrorBoundary'
import Landing from './pages/Landing'
import Dashboard from './pages/Dashboard'
import CaseDetail from './pages/CaseDetail'
import NewCase from './pages/NewCase'
import Settings from './pages/Settings'
import Analytics from './pages/Analytics'
import PolicyVault from './pages/PolicyVault'
import { pageTransition } from './lib/animations'

function AnimatedRoutes() {
  const location = useLocation()

  return (
    <AnimatePresence mode="wait">
      <Routes location={location} key={location.pathname}>
        <Route
          path="/"
          element={
            <PageWrapper>
              <Landing />
            </PageWrapper>
          }
        />

        <Route element={<MainLayout />}>
          <Route
            path="/dashboard"
            element={
              <PageWrapper>
                <Dashboard />
              </PageWrapper>
            }
          />

          <Route
            path="/policy-vault"
            element={
              <PageWrapper>
                <PolicyVault />
              </PageWrapper>
            }
          />
          <Route
            path="/cases/new"
            element={
              <PageWrapper>
                <NewCase />
              </PageWrapper>
            }
          />
          <Route
            path="/cases/:caseId"
            element={
              <PageWrapper>
                <CaseDetail />
              </PageWrapper>
            }
          />

          <Route
            path="/analytics"
            element={
              <PageWrapper>
                <Analytics />
              </PageWrapper>
            }
          />

          <Route
            path="/settings"
            element={
              <PageWrapper>
                <Settings />
              </PageWrapper>
            }
          />
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AnimatePresence>
  )
}

function PageWrapper({ children }: { children: React.ReactNode }) {
  return (
    <motion.div
      variants={pageTransition}
      initial="initial"
      animate="animate"
      exit="exit"
    >
      {children}
    </motion.div>
  )
}

function CacheRestoringFallback() {
  return (
    <div className="min-h-screen bg-grey-50 flex items-center justify-center">
      <div className="text-center">
        <div className="w-8 h-8 border-2 border-grey-300 border-t-grey-900 rounded-full animate-spin mx-auto mb-3" />
        <p className="text-sm text-grey-500">Loading...</p>
      </div>
    </div>
  )
}

function AppContent() {
  const isRestoring = useIsRestoring()

  if (isRestoring) {
    return <CacheRestoringFallback />
  }

  return (
    <BrowserRouter>
      <AnimatedRoutes />
    </BrowserRouter>
  )
}

function App() {
  return (
    <ErrorBoundary>
      <AppContent />
    </ErrorBoundary>
  )
}

export default App

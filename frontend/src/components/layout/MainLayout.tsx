import { Outlet } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Sidebar } from './Sidebar'
import { TopNavbar } from './TopNavbar'

export function MainLayout() {
  return (
    <div className="min-h-screen" style={{ background: 'var(--color-surface)' }}>
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:top-0 focus:left-0 focus:z-[100] focus:bg-white focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-grey-900 focus:border focus:border-grey-300 focus:rounded-md focus:m-2"
      >
        Skip to main content
      </a>
      <TopNavbar />
      <div style={{ paddingTop: '48px' }}>
        <Sidebar />
        <main id="main-content" className="ml-64 min-h-screen">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
          >
            <Outlet />
          </motion.div>
        </main>
      </div>
    </div>
  )
}

export default MainLayout

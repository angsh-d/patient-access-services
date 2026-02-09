import { Outlet } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Sidebar } from './Sidebar'
import { TopNavbar } from './TopNavbar'

export function MainLayout() {
  return (
    <div className="min-h-screen" style={{ background: 'var(--color-surface)' }}>
      <TopNavbar />
      <div style={{ paddingTop: '48px' }}>
        <Sidebar />
        <main className="ml-64 min-h-screen">
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

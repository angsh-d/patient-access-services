import { NavLink, useLocation } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  LayoutGrid,
  Shield,
  Scale,
  Settings,
  Plus,
} from 'lucide-react'
import { cn } from '@/lib/utils'

const navItems = [
  { path: '/dashboard', label: 'Dashboard', icon: <LayoutGrid className="w-[18px] h-[18px]" /> },
  { path: '/policy-vault', label: 'Policy Vault', icon: <Shield className="w-[18px] h-[18px]" /> },
  { path: '/appeals', label: 'Appeals', icon: <Scale className="w-[18px] h-[18px]" /> },
  { path: '/settings', label: 'Settings', icon: <Settings className="w-[18px] h-[18px]" /> },
]

export function Sidebar() {
  const location = useLocation()

  return (
    <aside className="glass-sidebar fixed left-0 w-64 flex flex-col z-40" style={{ top: '48px', height: 'calc(100vh - 48px)' }}>
      <div className="h-12 flex items-center px-5">
        <span className="font-semibold text-[13px] text-grey-500 tracking-tight">
          Navigation
        </span>
      </div>

      <div className="px-3 pt-1 pb-3">
        <NavLink to="/cases/new">
          <motion.button
            className="w-full h-[38px] flex items-center justify-center gap-2 rounded-xl bg-grey-900 text-white text-[13px] font-semibold shadow-sm"
            whileHover={{ scale: 1.01 }}
            whileTap={{ scale: 0.97 }}
            transition={{ duration: 0.15, ease: [0.16, 1, 0.3, 1] }}
          >
            <Plus className="w-4 h-4" strokeWidth={2.5} />
            New Case
          </motion.button>
        </NavLink>
      </div>

      <nav className="flex-1 px-3 py-1">
        <div className="space-y-0.5">
          {navItems.map((item) => {
            const isActive = item.path === '/dashboard'
              ? location.pathname === '/dashboard'
              : location.pathname.startsWith(item.path)

            return (
              <NavLink
                key={item.path}
                to={item.path}
                className="block"
              >
                <motion.div
                  className={cn(
                    'relative flex items-center gap-3 px-3 py-[9px] rounded-[10px] transition-colors duration-200',
                    isActive
                      ? 'bg-black/[0.06]'
                      : 'hover:bg-black/[0.03]'
                  )}
                  whileTap={{ scale: 0.98 }}
                  transition={{ duration: 0.1 }}
                >
                  <span className={cn(
                    'transition-colors duration-200',
                    isActive ? 'text-grey-900' : 'text-grey-400'
                  )}>
                    {item.icon}
                  </span>
                  <span className={cn(
                    'text-[13px] transition-colors duration-200',
                    isActive ? 'text-grey-900 font-semibold' : 'text-grey-500 font-medium'
                  )}>
                    {item.label}
                  </span>
                  <AnimatePresence>
                    {isActive && (
                      <motion.div
                        className="ml-auto w-1.5 h-1.5 rounded-full bg-grey-900"
                        initial={{ scale: 0, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        exit={{ scale: 0, opacity: 0 }}
                        transition={{ duration: 0.2, ease: [0.34, 1.56, 0.64, 1] }}
                      />
                    )}
                  </AnimatePresence>
                </motion.div>
              </NavLink>
            )
          })}
        </div>
      </nav>

      <div className="px-3 pb-3">
        <div className="p-3 rounded-xl bg-black/[0.03]">
          <p className="text-[10px] font-semibold uppercase tracking-[0.06em] text-grey-400 mb-1.5">Platform</p>
          <div className="flex flex-col gap-1">
            <p className="text-[11px] text-grey-500 leading-relaxed">
              Multi-payer prior authorization with AI-driven strategy optimization.
            </p>
          </div>
        </div>
      </div>

      <div className="px-3 pb-3">
        <p className="text-[11px] text-grey-300 text-center font-medium">
          Patient Services v1.0
        </p>
      </div>
    </aside>
  )
}

export default Sidebar

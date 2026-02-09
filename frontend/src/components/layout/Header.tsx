import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { ChevronLeft } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui'

interface BreadcrumbItem {
  label: string
  href?: string
}

interface HeaderAction {
  label: string
  onClick: () => void
  variant?: 'primary' | 'secondary' | 'ghost'
  icon?: React.ReactNode
  isLoading?: boolean
}

interface HeaderProps {
  title: string
  subtitle?: string
  breadcrumbs?: BreadcrumbItem[]
  actions?: HeaderAction[]
  showBack?: boolean
  backTo?: string
  className?: string
}

export function Header({
  title,
  subtitle,
  breadcrumbs,
  actions,
  showBack,
  backTo,
  className,
}: HeaderProps) {
  const navigate = useNavigate()

  const handleBack = () => {
    if (backTo) {
      navigate(backTo)
    } else {
      navigate(-1)
    }
  }

  return (
    <motion.header
      className={cn(
        'glass-header sticky top-0 z-30 px-8 py-4',
        className
      )}
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
    >
      <div className="flex items-center justify-between">
        {/* Left side: Back button + Title */}
        <div className="flex items-center gap-4">
          {showBack && (
            <motion.button
              onClick={handleBack}
              className={cn(
                'p-2 -ml-2 rounded-xl text-grey-500',
                'hover:bg-grey-100 hover:text-grey-700',
                'transition-colors duration-fast'
              )}
              whileHover={{ x: -2 }}
              whileTap={{ scale: 0.95 }}
            >
              <ChevronLeft className="w-5 h-5" />
            </motion.button>
          )}

          <div>
            {/* Breadcrumbs */}
            {breadcrumbs && breadcrumbs.length > 0 && (
              <nav className="flex items-center gap-2 mb-1">
                {breadcrumbs.map((crumb, index) => (
                  <span key={index} className="flex items-center gap-2">
                    {index > 0 && (
                      <span className="text-grey-300">/</span>
                    )}
                    {crumb.href ? (
                      <a
                        href={crumb.href}
                        className="text-xs text-grey-500 hover:text-grey-700 transition-colors"
                        onClick={(e) => {
                          e.preventDefault()
                          navigate(crumb.href!)
                        }}
                      >
                        {crumb.label}
                      </a>
                    ) : (
                      <span className="text-xs text-grey-400">
                        {crumb.label}
                      </span>
                    )}
                  </span>
                ))}
              </nav>
            )}

            {/* Title */}
            <h1 className="text-2xl font-semibold text-grey-900 tracking-tight">
              {title}
            </h1>

            {/* Subtitle */}
            {subtitle && (
              <p className="text-sm text-grey-500 mt-0.5">
                {subtitle}
              </p>
            )}
          </div>
        </div>

        {/* Right side: Actions */}
        {actions && actions.length > 0 && (
          <div className="flex items-center gap-3">
            {actions.map((action, index) => (
              <Button
                key={index}
                variant={action.variant || 'secondary'}
                onClick={action.onClick}
                leftIcon={action.icon}
                isLoading={action.isLoading}
              >
                {action.label}
              </Button>
            ))}
          </div>
        )}
      </div>
    </motion.header>
  )
}

export default Header

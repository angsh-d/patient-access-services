/**
 * HeroCTA - Large, prominent "New Case" button with AI assistant styling
 *
 * Design Philosophy:
 * - Greyscale-first with minimal semantic colors
 * - Apple HIG inspired - clean, professional, enterprise SaaS aesthetic
 * - Only the primary CTA button uses color (draws attention)
 * - Subtle animations, not distracting
 */

import { motion } from 'framer-motion'
import { Sparkles, ArrowRight, Brain, Zap, Shield } from 'lucide-react'
import { GlassPanel } from '@/components/ui/GlassPanel'
import { Button } from '@/components/ui/Button'
import { cn } from '@/lib/utils'

export interface HeroCTAProps {
  onCreateCase: () => void
  title?: string
  subtitle?: string
  className?: string
  isLoading?: boolean
}

export function HeroCTA({
  onCreateCase,
  title = 'Start AI-Assisted Case',
  subtitle = 'AI will analyze policies and recommend the optimal access strategy for your patient',
  className,
  isLoading = false,
}: HeroCTAProps) {
  return (
    <GlassPanel
      variant="default"
      padding="lg"
      className={cn('relative overflow-hidden border-grey-200', className)}
    >
      {/* Subtle background decoration - greyscale */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-1/2 -right-1/4 w-96 h-96 bg-gradient-to-br from-grey-100 to-grey-200/50 rounded-full blur-3xl" />
      </div>

      <div className="relative flex items-center justify-between gap-6">
        <div className="flex items-start gap-4">
          {/* Icon - Greyscale with subtle animation */}
          <motion.div
            className="w-14 h-14 rounded-2xl bg-grey-900 flex items-center justify-center shadow-md flex-shrink-0"
            animate={{
              boxShadow: [
                '0 4px 14px rgba(0, 0, 0, 0.1)',
                '0 4px 20px rgba(0, 0, 0, 0.15)',
                '0 4px 14px rgba(0, 0, 0, 0.1)',
              ],
            }}
            transition={{
              duration: 3,
              repeat: Infinity,
              ease: 'easeInOut',
            }}
          >
            <motion.div
              animate={{ rotate: [0, 3, -3, 0] }}
              transition={{
                duration: 4,
                repeat: Infinity,
                ease: 'easeInOut',
              }}
            >
              <Sparkles className="w-7 h-7 text-white" />
            </motion.div>
          </motion.div>

          <div className="flex-1">
            <h2 className="text-xl font-semibold text-grey-900 flex items-center gap-2">
              {title}
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-grey-100 text-grey-600 text-xs font-medium border border-grey-200">
                <Brain className="w-3 h-3" />
                AI-Powered
              </span>
            </h2>
            <p className="text-sm text-grey-600 mt-1 max-w-lg">{subtitle}</p>

            {/* Feature highlights */}
            <div className="flex items-center gap-4 mt-3">
              <FeatureTag icon={Brain} label="Policy Analysis" />
              <FeatureTag icon={Zap} label="Strategy Generation" />
              <FeatureTag icon={Shield} label="Coverage Assessment" />
            </div>
          </div>
        </div>

        {/* CTA Button - Only element with accent color */}
        <motion.div
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
        >
          <Button
            variant="primary"
            size="lg"
            onClick={onCreateCase}
            isLoading={isLoading}
            rightIcon={<ArrowRight className="w-5 h-5" />}
            className="bg-grey-900 hover:bg-grey-800 shadow-md px-6"
          >
            Create Case
          </Button>
        </motion.div>
      </div>
    </GlassPanel>
  )
}

/**
 * Feature tag component
 */
function FeatureTag({ icon: Icon, label }: { icon: React.ElementType; label: string }) {
  return (
    <div className="flex items-center gap-1.5 text-xs text-grey-500">
      <Icon className="w-3.5 h-3.5 text-grey-400" />
      <span>{label}</span>
    </div>
  )
}

/**
 * HeroCTACompact - Smaller version for sidebars or secondary placements
 */
export function HeroCTACompact({
  onCreateCase,
  className,
}: {
  onCreateCase: () => void
  className?: string
}) {
  return (
    <motion.button
      className={cn(
        'w-full p-4 rounded-xl border border-grey-200 bg-grey-50/50',
        'flex items-center gap-3 text-left group transition-all',
        'hover:border-grey-300 hover:bg-grey-100/50',
        className
      )}
      onClick={onCreateCase}
      whileHover={{ scale: 1.01 }}
      whileTap={{ scale: 0.99 }}
    >
      <div className="w-10 h-10 rounded-xl bg-grey-900 flex items-center justify-center flex-shrink-0">
        <Sparkles className="w-5 h-5 text-white" />
      </div>
      <div className="flex-1 min-w-0">
        <span className="text-sm font-medium text-grey-900 block">New AI Case</span>
        <span className="text-xs text-grey-500">Start AI-assisted PA workflow</span>
      </div>
      <ArrowRight className="w-4 h-4 text-grey-400 group-hover:text-grey-700 group-hover:translate-x-0.5 transition-all flex-shrink-0" />
    </motion.button>
  )
}

/**
 * HeroCTAMinimal - Very compact button-style CTA
 */
export function HeroCTAMinimal({
  onCreateCase,
  className,
}: {
  onCreateCase: () => void
  className?: string
}) {
  return (
    <Button
      variant="primary"
      onClick={onCreateCase}
      leftIcon={<Sparkles className="w-4 h-4" />}
      className={cn(
        'bg-grey-900 hover:bg-grey-800',
        className
      )}
    >
      New AI Case
    </Button>
  )
}

export default HeroCTA

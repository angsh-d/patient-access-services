import { motion } from 'framer-motion'
import { AlertTriangle, FileX, Clock, ArrowRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Card, Badge, Button } from '@/components/ui'
import type { DocumentationGap, GapSeverity } from '@/types/coverage'

interface DocumentationGapsProps {
  gaps: DocumentationGap[]
  onResolve?: (gap: DocumentationGap) => void
  className?: string
}

export function DocumentationGaps({ gaps, onResolve, className }: DocumentationGapsProps) {
  if (gaps.length === 0) {
    return (
      <Card variant="default" padding="md" className={className}>
        <div className="flex items-center gap-3 text-semantic-success">
          <div className="w-10 h-10 rounded-full bg-semantic-success/10 flex items-center justify-center">
            <FileX className="w-5 h-5" />
          </div>
          <div>
            <p className="font-medium">No Documentation Gaps</p>
            <p className="text-sm text-grey-500">
              All required documentation is present
            </p>
          </div>
        </div>
      </Card>
    )
  }

  // Sort by severity (default to 'medium' if undefined)
  const severityOrder: GapSeverity[] = ['critical', 'high', 'medium', 'low']
  const sortedGaps = [...gaps].sort((a, b) =>
    severityOrder.indexOf(a.severity ?? 'medium') - severityOrder.indexOf(b.severity ?? 'medium')
  )

  return (
    <div className={cn('space-y-4', className)}>
      {/* Summary */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <AlertTriangle className="w-5 h-5 text-semantic-warning" />
          <span className="font-medium text-grey-900">
            {gaps.length} Documentation Gap{gaps.length > 1 ? 's' : ''} Found
          </span>
        </div>
        <div className="flex items-center gap-2">
          {['critical', 'high', 'medium', 'low'].map((severity) => {
            const count = gaps.filter(g => g.severity === severity).length
            if (count === 0) return null
            return (
              <Badge
                key={severity}
                variant={
                  severity === 'critical' ? 'error' :
                  severity === 'high' ? 'warning' :
                  severity === 'medium' ? 'neutral' : 'neutral'
                }
                size="sm"
              >
                {count} {severity}
              </Badge>
            )
          })}
        </div>
      </div>

      {/* Gap cards */}
      <div className="space-y-3">
        {sortedGaps.map((gap, index) => (
          <GapCard
            key={gap.id ?? gap.gap_id ?? index}
            gap={gap}
            index={index}
            onResolve={() => onResolve?.(gap)}
          />
        ))}
      </div>
    </div>
  )
}

interface GapCardProps {
  gap: DocumentationGap
  index: number
  onResolve?: () => void
}

function GapCard({ gap, index, onResolve }: GapCardProps) {
  const severityConfig: Record<GapSeverity, {
    variant: 'error' | 'warning' | 'neutral'
    bg: string
    label: string
  }> = {
    critical: { variant: 'error', bg: 'bg-semantic-error/10', label: 'Critical' },
    high: { variant: 'warning', bg: 'bg-semantic-warning/10', label: 'High' },
    medium: { variant: 'neutral', bg: 'bg-grey-200', label: 'Medium' },
    low: { variant: 'neutral', bg: 'bg-grey-100', label: 'Low' },
  }

  const severity = gap.severity ?? 'medium'
  const config = severityConfig[severity]

  return (
    <motion.div
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{
        duration: 0.3,
        delay: index * 0.05,
        ease: [0.16, 1, 0.3, 1]
      }}
    >
      <Card
        variant="default"
        padding="md"
        className={cn(
          'border-l-4',
          severity === 'critical' && 'border-l-semantic-error',
          severity === 'high' && 'border-l-semantic-warning',
          severity === 'medium' && 'border-l-grey-400',
          severity === 'low' && 'border-l-grey-300'
        )}
      >
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-2">
              <Badge variant={config.variant} size="sm">
                {config.label}
              </Badge>
              <span className="text-xs text-grey-500">
                {gap.source_criterion}
              </span>
            </div>

            <h4 className="text-sm font-medium text-grey-900 mb-1">
              {gap.description}
            </h4>

            <p className="text-xs text-grey-500 mb-3">
              <span className="font-medium">Impact:</span> {gap.impact}
            </p>

            <div className="flex items-center gap-4">
              <div className="flex items-center gap-1.5 text-xs text-grey-600">
                <ArrowRight className="w-3.5 h-3.5" />
                <span>{gap.required_action}</span>
              </div>
              {gap.estimated_resolution_time && (
                <div className="flex items-center gap-1.5 text-xs text-grey-500">
                  <Clock className="w-3.5 h-3.5" />
                  <span>{gap.estimated_resolution_time}</span>
                </div>
              )}
            </div>
          </div>

          {onResolve && (
            <Button
              variant="secondary"
              size="sm"
              onClick={onResolve}
            >
              Resolve
            </Button>
          )}
        </div>
      </Card>
    </motion.div>
  )
}

export default DocumentationGaps

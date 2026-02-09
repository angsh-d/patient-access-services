import { motion } from 'framer-motion'
import {
  CheckCircle2,
  Clock,
  TrendingUp,
  TrendingDown,
  Minus,
  Brain,
  Sparkles,
} from 'lucide-react'
import { cn } from '@/lib/utils'

export interface StatItem {
  label: string
  value: string | number
  trend?: 'up' | 'down' | 'neutral'
  trendValue?: string
  icon?: 'approved' | 'time' | 'rate' | 'ai'
}

interface WorkspaceStatsProps {
  stats: StatItem[]
  className?: string
  title?: string
}

const iconMap = {
  approved: CheckCircle2,
  time: Clock,
  rate: TrendingUp,
  ai: Brain,
}

const trendConfig = {
  up: { icon: TrendingUp, color: 'text-semantic-success' },
  down: { icon: TrendingDown, color: 'text-semantic-error' },
  neutral: { icon: Minus, color: 'text-grey-300' },
}

export function WorkspaceStats({
  stats,
  className,
  title = 'My Performance',
}: WorkspaceStatsProps) {
  return (
    <div className={cn('surface-card overflow-hidden', className)}>
      <div className="px-4 py-3 border-b border-grey-100/80">
        <h3 className="text-[13px] font-semibold text-grey-800">{title}</h3>
      </div>

      <div className="p-4 space-y-3.5">
        {stats.map((stat, index) => {
          const Icon = stat.icon ? iconMap[stat.icon] : null
          const trend = stat.trend ? trendConfig[stat.trend] : null
          const TrendIcon = trend?.icon

          return (
            <motion.div
              key={index}
              className="flex items-center justify-between"
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: index * 0.08, duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
            >
              <div className="flex items-center gap-2.5">
                {Icon && (
                  <div className="w-7 h-7 rounded-lg bg-grey-100/80 flex items-center justify-center">
                    <Icon className="w-3.5 h-3.5 text-grey-400" />
                  </div>
                )}
                <span className="text-[13px] text-grey-500">{stat.label}</span>
              </div>

              <div className="flex items-center gap-1.5">
                <span className="text-[17px] font-semibold text-grey-900 tabular-nums">{stat.value}</span>
                {trend && TrendIcon && (
                  <div className={cn('flex items-center gap-0.5', trend.color)}>
                    <TrendIcon className="w-3 h-3" />
                    {stat.trendValue && (
                      <span className="text-[11px] font-medium">{stat.trendValue}</span>
                    )}
                  </div>
                )}
              </div>
            </motion.div>
          )
        })}
      </div>
    </div>
  )
}

interface AIInsightCardProps {
  insight: string
  source?: string
  className?: string
}

export function AIInsightCard({ insight, source, className }: AIInsightCardProps) {
  return (
    <div className={cn('surface-card overflow-hidden', className)}>
      <div className="px-4 py-3 border-b border-grey-100/80 flex items-center gap-2">
        <div className="w-5 h-5 rounded-md bg-gradient-to-br from-violet-500/10 to-blue-500/10 flex items-center justify-center">
          <Sparkles className="w-3 h-3 text-violet-500" />
        </div>
        <h3 className="text-[13px] font-semibold text-grey-800">AI Insight</h3>
      </div>
      <div className="p-4">
        <p className="text-[13px] text-grey-600 leading-[1.6]">"{insight}"</p>
        {source && (
          <p className="text-[11px] text-grey-300 mt-3 font-medium">Based on {source}</p>
        )}
      </div>
    </div>
  )
}

interface ActivityItem {
  id: string
  action: string
  caseId?: string
  patientName?: string
  timestamp: string
  status?: 'success' | 'pending' | 'info'
}

interface RecentActivityProps {
  activities: ActivityItem[]
  onActivityClick?: (activity: ActivityItem) => void
  className?: string
  maxItems?: number
}

export function RecentActivity({
  activities,
  onActivityClick,
  className,
  maxItems = 5,
}: RecentActivityProps) {
  const displayActivities = activities.slice(0, maxItems)

  const statusColors = {
    success: 'bg-semantic-success',
    pending: 'bg-semantic-warning',
    info: 'bg-grey-300',
  }

  return (
    <div className={cn('surface-card overflow-hidden', className)}>
      <div className="px-4 py-3 border-b border-grey-100/80 flex items-center gap-2">
        <Clock className="w-3.5 h-3.5 text-grey-400" />
        <h3 className="text-[13px] font-semibold text-grey-800">Recent Activity</h3>
      </div>

      <div className="divide-y divide-grey-100/60">
        {displayActivities.length === 0 ? (
          <div className="px-4 py-6 text-center text-[13px] text-grey-400">
            No recent activity
          </div>
        ) : (
          displayActivities.map((activity) => (
            <button
              key={activity.id}
              type="button"
              onClick={() => onActivityClick?.(activity)}
              className="w-full px-4 py-3 flex items-start gap-3 hover:bg-grey-50/50 transition-colors duration-150 text-left"
              disabled={!onActivityClick}
            >
              <div
                className={cn(
                  'w-[6px] h-[6px] rounded-full mt-[7px] flex-shrink-0',
                  statusColors[activity.status || 'info']
                )}
              />
              <div className="flex-1 min-w-0">
                <p className="text-[13px] text-grey-600 truncate">{activity.action}</p>
                <p className="text-[11px] text-grey-300 mt-0.5 font-medium">
                  {new Date(activity.timestamp).toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </p>
              </div>
            </button>
          ))
        )}
      </div>
    </div>
  )
}

export default WorkspaceStats

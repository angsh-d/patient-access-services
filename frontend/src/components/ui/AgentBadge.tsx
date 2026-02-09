/**
 * AgentBadge - Visual representation of AI agents
 *
 * Design Philosophy:
 * - Greyscale-first with subtle differentiation
 * - Apple HIG inspired - clean, professional
 * - Consistent visual language across all agents
 */

import { motion } from 'framer-motion'
import {
  FileSearch,
  Brain,
  Lightbulb,
  Play,
  AlertTriangle,
  UserCheck,
} from 'lucide-react'
import { cn } from '@/lib/utils'

export type AgentType =
  | 'intake'
  | 'policy_analyzer'
  | 'strategy_generator'
  | 'action_coordinator'
  | 'recovery'
  | 'human_review'

interface AgentBadgeProps {
  agent: AgentType
  size?: 'sm' | 'md' | 'lg'
  showLabel?: boolean
  showIcon?: boolean
  animated?: boolean
  className?: string
}

/**
 * Agent Configuration - Greyscale-first design
 * All agents use the same grey palette for consistency
 */
const AGENT_CONFIG: Record<
  AgentType,
  {
    label: string
    shortLabel: string
    color: string
    bgColor: string
    borderColor: string
    glowColor: string
    icon: React.ElementType
  }
> = {
  intake: {
    label: 'Intake Agent',
    shortLabel: 'Intake',
    color: 'text-grey-700',
    bgColor: 'bg-grey-100',
    borderColor: 'border-grey-200',
    glowColor: 'rgba(107, 114, 128, 0.2)',
    icon: FileSearch,
  },
  policy_analyzer: {
    label: 'Policy Analyzer',
    shortLabel: 'Policy',
    color: 'text-grey-700',
    bgColor: 'bg-grey-100',
    borderColor: 'border-grey-200',
    glowColor: 'rgba(107, 114, 128, 0.2)',
    icon: Brain,
  },
  strategy_generator: {
    label: 'Strategy Generator',
    shortLabel: 'Strategy',
    color: 'text-grey-700',
    bgColor: 'bg-grey-100',
    borderColor: 'border-grey-200',
    glowColor: 'rgba(107, 114, 128, 0.2)',
    icon: Lightbulb,
  },
  action_coordinator: {
    label: 'Action Coordinator',
    shortLabel: 'Actions',
    color: 'text-grey-700',
    bgColor: 'bg-grey-100',
    borderColor: 'border-grey-200',
    glowColor: 'rgba(107, 114, 128, 0.2)',
    icon: Play,
  },
  recovery: {
    label: 'Recovery Agent',
    shortLabel: 'Recovery',
    color: 'text-grey-700',
    bgColor: 'bg-grey-100',
    borderColor: 'border-grey-200',
    glowColor: 'rgba(107, 114, 128, 0.2)',
    icon: AlertTriangle,
  },
  human_review: {
    label: 'Human Review',
    shortLabel: 'Human',
    color: 'text-grey-700',
    bgColor: 'bg-grey-100',
    borderColor: 'border-grey-200',
    glowColor: 'rgba(107, 114, 128, 0.2)',
    icon: UserCheck,
  },
}

const SIZE_CONFIG = {
  sm: {
    badge: 'px-2 py-0.5 text-xs gap-1',
    icon: 'w-3 h-3',
    iconOnly: 'w-6 h-6',
  },
  md: {
    badge: 'px-2.5 py-1 text-sm gap-1.5',
    icon: 'w-4 h-4',
    iconOnly: 'w-8 h-8',
  },
  lg: {
    badge: 'px-3 py-1.5 text-sm gap-2',
    icon: 'w-5 h-5',
    iconOnly: 'w-10 h-10',
  },
}

export function AgentBadge({
  agent,
  size = 'md',
  showLabel = true,
  showIcon = true,
  animated = false,
  className,
}: AgentBadgeProps) {
  const config = AGENT_CONFIG[agent]
  const sizeConfig = SIZE_CONFIG[size]
  const Icon = config.icon

  const pulseAnimation = animated
    ? {
        animate: {
          boxShadow: [
            `0 0 0 0 ${config.glowColor.replace('0.25', '0')}`,
            `0 0 10px 3px ${config.glowColor}`,
            `0 0 0 0 ${config.glowColor.replace('0.25', '0')}`,
          ],
        },
        transition: {
          duration: 2,
          repeat: Infinity,
          ease: 'easeInOut',
        },
      }
    : {}

  // Icon-only mode
  if (!showLabel) {
    return (
      <motion.div
        className={cn(
          'rounded-lg flex items-center justify-center',
          config.bgColor,
          config.borderColor,
          'border',
          sizeConfig.iconOnly,
          className
        )}
        {...pulseAnimation}
      >
        <Icon className={cn(sizeConfig.icon, config.color)} />
      </motion.div>
    )
  }

  return (
    <motion.span
      className={cn(
        'inline-flex items-center rounded-full font-medium',
        config.bgColor,
        config.borderColor,
        config.color,
        'border',
        sizeConfig.badge,
        className
      )}
      {...pulseAnimation}
    >
      {showIcon && <Icon className={sizeConfig.icon} />}
      {size === 'sm' ? config.shortLabel : config.label}
    </motion.span>
  )
}

/**
 * AgentIcon - Just the icon with color styling
 */
export function AgentIcon({
  agent,
  size = 'md',
  className,
}: {
  agent: AgentType
  size?: 'sm' | 'md' | 'lg'
  className?: string
}) {
  const config = AGENT_CONFIG[agent]
  const sizeConfig = SIZE_CONFIG[size]
  const Icon = config.icon

  return <Icon className={cn(sizeConfig.icon, config.color, className)} />
}

/**
 * AgentDot - Small dot indicator (greyscale)
 */
export function AgentDot({
  animated = false,
  className,
}: {
  agent?: AgentType
  animated?: boolean
  className?: string
}) {
  return (
    <motion.span
      className={cn(
        'inline-block w-2 h-2 rounded-full bg-grey-500',
        className
      )}
      animate={
        animated
          ? {
              scale: [1, 1.2, 1],
              opacity: [1, 0.7, 1],
            }
          : undefined
      }
      transition={
        animated
          ? {
              duration: 1.5,
              repeat: Infinity,
              ease: 'easeInOut',
            }
          : undefined
      }
    />
  )
}

/**
 * Helper to get agent color for custom use
 */
export function getAgentColor(agent: AgentType) {
  return AGENT_CONFIG[agent]
}

/**
 * Helper to map case stage to agent type
 */
export function stageToAgent(stage: string): AgentType {
  switch (stage) {
    case 'intake':
      return 'intake'
    case 'policy_analysis':
      return 'policy_analyzer'
    case 'awaiting_human_decision':
      return 'human_review'
    case 'strategy_generation':
    case 'strategy_selection':
      return 'strategy_generator'
    case 'action_coordination':
    case 'monitoring':
      return 'action_coordinator'
    case 'recovery':
      return 'recovery'
    default:
      return 'intake'
  }
}

export default AgentBadge

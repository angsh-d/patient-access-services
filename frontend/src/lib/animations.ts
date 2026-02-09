/**
 * Framer Motion animation utilities
 *
 * Provides reusable animation variants for consistent UI motion throughout the app.
 */

import { Variants, Transition } from 'framer-motion'

/**
 * Fade in with upward motion - great for list items and cards
 */
export const fadeInUp: Variants = {
  initial: { opacity: 0, y: 20 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -10 },
}

/**
 * Fade in with downward motion - good for dropdowns
 */
export const fadeInDown: Variants = {
  initial: { opacity: 0, y: -10 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -10 },
}

/**
 * Simple fade in/out
 */
export const fadeIn: Variants = {
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  exit: { opacity: 0 },
}

/**
 * Scale in from smaller size - good for modals and overlays
 */
export const scaleIn: Variants = {
  initial: { opacity: 0, scale: 0.95 },
  animate: { opacity: 1, scale: 1 },
  exit: { opacity: 0, scale: 0.95 },
}

/**
 * Slide in from right - good for panels and sidebars
 */
export const slideInRight: Variants = {
  initial: { opacity: 0, x: 20 },
  animate: { opacity: 1, x: 0 },
  exit: { opacity: 0, x: 20 },
}

/**
 * Slide in from left
 */
export const slideInLeft: Variants = {
  initial: { opacity: 0, x: -20 },
  animate: { opacity: 1, x: 0 },
  exit: { opacity: 0, x: -20 },
}

/**
 * Container with staggered children - wrap list items
 */
export const staggerContainer: Variants = {
  initial: {},
  animate: {
    transition: {
      staggerChildren: 0.1,
      delayChildren: 0.05,
    },
  },
  exit: {
    transition: {
      staggerChildren: 0.05,
      staggerDirection: -1,
    },
  },
}

/**
 * Fast stagger for quick lists
 */
export const staggerContainerFast: Variants = {
  initial: {},
  animate: {
    transition: {
      staggerChildren: 0.05,
      delayChildren: 0.02,
    },
  },
}

/**
 * Pulsing glow effect - great for AI active indicators
 */
export const pulseGlow = {
  animate: {
    boxShadow: [
      '0 0 0 0 rgba(0, 122, 255, 0)',
      '0 0 20px 5px rgba(0, 122, 255, 0.3)',
      '0 0 0 0 rgba(0, 122, 255, 0)',
    ],
    transition: {
      duration: 2,
      repeat: Infinity,
      ease: 'easeInOut',
    },
  },
}

/**
 * AI agent glow variants by type
 */
export const agentGlow = {
  intake: {
    animate: {
      boxShadow: [
        '0 0 0 0 rgba(59, 130, 246, 0)',
        '0 0 15px 3px rgba(59, 130, 246, 0.25)',
        '0 0 0 0 rgba(59, 130, 246, 0)',
      ],
      transition: { duration: 2, repeat: Infinity },
    },
  },
  policy: {
    animate: {
      boxShadow: [
        '0 0 0 0 rgba(147, 51, 234, 0)',
        '0 0 15px 3px rgba(147, 51, 234, 0.25)',
        '0 0 0 0 rgba(147, 51, 234, 0)',
      ],
      transition: { duration: 2, repeat: Infinity },
    },
  },
  strategy: {
    animate: {
      boxShadow: [
        '0 0 0 0 rgba(34, 197, 94, 0)',
        '0 0 15px 3px rgba(34, 197, 94, 0.25)',
        '0 0 0 0 rgba(34, 197, 94, 0)',
      ],
      transition: { duration: 2, repeat: Infinity },
    },
  },
  action: {
    animate: {
      boxShadow: [
        '0 0 0 0 rgba(249, 115, 22, 0)',
        '0 0 15px 3px rgba(249, 115, 22, 0.25)',
        '0 0 0 0 rgba(249, 115, 22, 0)',
      ],
      transition: { duration: 2, repeat: Infinity },
    },
  },
  recovery: {
    animate: {
      boxShadow: [
        '0 0 0 0 rgba(239, 68, 68, 0)',
        '0 0 15px 3px rgba(239, 68, 68, 0.25)',
        '0 0 0 0 rgba(239, 68, 68, 0)',
      ],
      transition: { duration: 2, repeat: Infinity },
    },
  },
}

/**
 * Criterion match animation - for policy matching
 */
export const criterionMatch: Variants = {
  initial: { scale: 0.8, opacity: 0 },
  animate: { scale: 1, opacity: 1 },
  exit: { scale: 0.8, opacity: 0 },
}

/**
 * Progress bar fill animation
 */
export const progressFill = (percentage: number) => ({
  initial: { width: 0 },
  animate: {
    width: `${percentage}%`,
    transition: { duration: 0.8, ease: [0.16, 1, 0.3, 1] },
  },
})

/**
 * Card hover effect
 */
export const cardHover = {
  whileHover: { y: -2, scale: 1.005 },
  whileTap: { scale: 0.995 },
  transition: { duration: 0.2, ease: [0.16, 1, 0.3, 1] } as Transition,
}

/**
 * Button press effect
 */
export const buttonPress = {
  whileHover: { scale: 1.02 },
  whileTap: { scale: 0.98 },
  transition: { duration: 0.15 } as Transition,
}

/**
 * Page transition variants
 */
export const pageTransition: Variants = {
  initial: { opacity: 0, y: 10 },
  animate: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.3, ease: [0.16, 1, 0.3, 1] },
  },
  exit: {
    opacity: 0,
    y: -10,
    transition: { duration: 0.2 },
  },
}

/**
 * Tab content transition
 */
export const tabTransition: Variants = {
  initial: { opacity: 0, x: 10 },
  animate: {
    opacity: 1,
    x: 0,
    transition: { duration: 0.2, ease: [0.16, 1, 0.3, 1] },
  },
  exit: {
    opacity: 0,
    x: -10,
    transition: { duration: 0.15 },
  },
}

/**
 * Notification slide in
 */
export const notificationSlide: Variants = {
  initial: { opacity: 0, x: 50, scale: 0.9 },
  animate: {
    opacity: 1,
    x: 0,
    scale: 1,
    transition: { type: 'spring', stiffness: 400, damping: 25 },
  },
  exit: {
    opacity: 0,
    x: 50,
    scale: 0.9,
    transition: { duration: 0.2 },
  },
}

/**
 * Spin animation for loading indicators
 */
export const spin = {
  animate: {
    rotate: 360,
    transition: {
      duration: 1,
      repeat: Infinity,
      ease: 'linear',
    },
  },
}

/**
 * Bounce animation for attention
 */
export const bounce = {
  animate: {
    y: [0, -5, 0],
    transition: {
      duration: 0.6,
      repeat: Infinity,
      repeatType: 'reverse' as const,
    },
  },
}

/**
 * Apple-style spring config
 */
export const appleSpring: Transition = {
  type: 'spring',
  stiffness: 400,
  damping: 30,
}

/**
 * Apple-style ease config
 */
export const appleEase: Transition = {
  duration: 0.25,
  ease: [0.16, 1, 0.3, 1],
}

/**
 * Slow ease for dramatic effects
 */
export const slowEase: Transition = {
  duration: 0.4,
  ease: [0.16, 1, 0.3, 1],
}

/**
 * Status indicator pulse based on status type
 */
export const statusPulse = (status: 'success' | 'warning' | 'error' | 'info') => {
  const colors = {
    success: 'rgba(34, 197, 94, 0.3)',
    warning: 'rgba(234, 179, 8, 0.3)',
    error: 'rgba(239, 68, 68, 0.3)',
    info: 'rgba(59, 130, 246, 0.3)',
  }

  return {
    animate: {
      boxShadow: [
        `0 0 0 0 ${colors[status].replace('0.3', '0')}`,
        `0 0 10px 3px ${colors[status]}`,
        `0 0 0 0 ${colors[status].replace('0.3', '0')}`,
      ],
      transition: {
        duration: 1.5,
        repeat: Infinity,
        ease: 'easeInOut',
      },
    },
  }
}

/**
 * List item animation - use with staggerContainer
 */
export const listItem: Variants = {
  initial: { opacity: 0, y: 10 },
  animate: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.2, ease: [0.16, 1, 0.3, 1] },
  },
  exit: {
    opacity: 0,
    y: -5,
    transition: { duration: 0.1 },
  },
}

/**
 * Accordion expand/collapse
 */
export const accordion: Variants = {
  initial: { height: 0, opacity: 0 },
  animate: {
    height: 'auto',
    opacity: 1,
    transition: { duration: 0.3, ease: [0.16, 1, 0.3, 1] },
  },
  exit: {
    height: 0,
    opacity: 0,
    transition: { duration: 0.2 },
  },
}

import { cn } from '@/lib/utils'

export interface SkeletonProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: 'default' | 'circular' | 'text'
  width?: string | number
  height?: string | number
  lines?: number
}

function Skeleton({
  className,
  variant = 'default',
  width,
  height,
  lines = 1,
  ...props
}: SkeletonProps) {
  const baseStyles = cn(
    'animate-shimmer bg-gradient-to-r from-grey-200 via-grey-100 to-grey-200',
    'bg-[length:200%_100%]'
  )

  const variants = {
    default: 'rounded-lg',
    circular: 'rounded-full',
    text: 'rounded h-4',
  }

  const style: React.CSSProperties = {
    width: typeof width === 'number' ? `${width}px` : width,
    height: typeof height === 'number' ? `${height}px` : height,
  }

  if (variant === 'text' && lines > 1) {
    return (
      <div className={cn('space-y-2', className)} {...props}>
        {Array.from({ length: lines }).map((_, i) => (
          <div
            key={i}
            className={cn(baseStyles, variants.text)}
            style={{
              ...style,
              width: i === lines - 1 ? '75%' : style.width || '100%',
            }}
          />
        ))}
      </div>
    )
  }

  return (
    <div
      className={cn(baseStyles, variants[variant], className)}
      style={style}
      {...props}
    />
  )
}

// Preset skeleton components
function SkeletonCard({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('p-6 rounded-2xl bg-grey-100 border border-grey-200/50 space-y-4', className)}
      {...props}
    >
      <div className="flex items-center gap-3">
        <Skeleton variant="circular" width={40} height={40} />
        <div className="flex-1 space-y-2">
          <Skeleton height={16} width="60%" />
          <Skeleton height={12} width="40%" />
        </div>
      </div>
      <Skeleton variant="text" lines={3} />
    </div>
  )
}

function SkeletonMetric({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('p-6 rounded-2xl bg-grey-100 border border-grey-200/50', className)}
      {...props}
    >
      <Skeleton height={12} width={80} className="mb-2" />
      <Skeleton height={36} width={100} />
    </div>
  )
}

function SkeletonList({
  count = 3,
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & { count?: number }) {
  return (
    <div className={cn('space-y-3', className)} {...props}>
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="flex items-center gap-4 p-4 rounded-xl bg-grey-100"
        >
          <Skeleton variant="circular" width={48} height={48} />
          <div className="flex-1 space-y-2">
            <Skeleton height={16} width="70%" />
            <Skeleton height={12} width="50%" />
          </div>
          <Skeleton height={24} width={80} className="rounded-full" />
        </div>
      ))}
    </div>
  )
}

export { Skeleton, SkeletonCard, SkeletonMetric, SkeletonList }

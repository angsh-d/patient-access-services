import { forwardRef } from 'react'
import { ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface SelectOption {
  value: string
  label: string
  disabled?: boolean
}

export interface SelectProps extends Omit<React.SelectHTMLAttributes<HTMLSelectElement>, 'children'> {
  label?: string
  helperText?: string
  error?: string
  options: SelectOption[]
  placeholder?: string
}

const Select = forwardRef<HTMLSelectElement, SelectProps>(
  (
    {
      className,
      label,
      helperText,
      error,
      options,
      placeholder,
      disabled,
      id,
      ...props
    },
    ref
  ) => {
    const selectId = id || `select-${Math.random().toString(36).substr(2, 9)}`

    return (
      <div className="w-full">
        {label && (
          <label
            htmlFor={selectId}
            className="block text-[13px] font-semibold text-grey-700 mb-1.5"
          >
            {label}
          </label>
        )}
        <div className="relative">
          <select
            ref={ref}
            id={selectId}
            disabled={disabled}
            className={cn(
              'w-full h-[38px] px-3 pr-10 text-[14px] text-grey-900 rounded-xl',
              'bg-white border-[0.5px] border-grey-200',
              'appearance-none cursor-pointer',
              'transition-all duration-fast ease-out-expo',
              'focus:outline-none focus:border-accent focus:ring-[3px] focus:ring-accent/10',
              'disabled:bg-grey-50 disabled:cursor-not-allowed disabled:opacity-40',
              error && 'border-semantic-error focus:border-semantic-error focus:ring-semantic-error/10',
              className
            )}
            {...props}
          >
            {placeholder && (
              <option value="" disabled>
                {placeholder}
              </option>
            )}
            {options.map((option) => (
              <option
                key={option.value}
                value={option.value}
                disabled={option.disabled}
              >
                {option.label}
              </option>
            ))}
          </select>
          <ChevronDown
            className={cn(
              'absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-grey-400 pointer-events-none',
              disabled && 'opacity-40'
            )}
          />
        </div>
        {(helperText || error) && (
          <p
            className={cn(
              'mt-1.5 text-[11px] font-medium',
              error ? 'text-semantic-error' : 'text-grey-400'
            )}
          >
            {error || helperText}
          </p>
        )}
      </div>
    )
  }
)

Select.displayName = 'Select'

export { Select }

import type { ComponentProps, ReactNode } from 'react'
import { Icon, type IconName } from './Icon'

const cx = (...parts: (string | false | undefined)[]) => parts.filter(Boolean).join(' ')

export const fieldClass =
  'h-11 w-full rounded-control border border-line bg-field px-3 text-[15px] text-ink outline-none ' +
  'transition-colors placeholder:text-ink-3 focus:border-line-strong sm:h-9 sm:text-[14px]'

export function Input({ className, ...props }: ComponentProps<'input'>) {
  return <input className={cx(fieldClass, className)} {...props} />
}

export function Select({ className, ...props }: ComponentProps<'select'>) {
  return <select className={cx(fieldClass, 'pr-2', className)} {...props} />
}

export function Field({ label, hint, children }: { label: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[13px] font-medium text-ink-2">{label}</span>
      {children}
      {hint && <span className="text-[12.5px] text-ink-3">{hint}</span>}
    </label>
  )
}

export function Button({
  variant = 'default',
  className,
  ...props
}: ComponentProps<'button'> & { variant?: 'default' | 'primary' | 'danger' }) {
  const look = {
    default: 'bg-surface text-ink shadow-btn hover:bg-hover',
    primary: 'bg-accent text-white hover:opacity-90',
    danger: 'bg-red-tint text-red hover:opacity-90',
  }[variant]
  return (
    <button
      type="button"
      className={cx(
        'flex h-11 items-center justify-center gap-1.5 rounded-control px-3.5 text-[14px] font-medium',
        'transition-[background-color,opacity,transform] duration-150 active:scale-[0.98]',
        'disabled:pointer-events-none disabled:opacity-50 sm:h-9 sm:text-[13px]',
        look,
        className,
      )}
      {...props}
    />
  )
}

export function IconButton({
  icon,
  label,
  className,
  ...props
}: ComponentProps<'button'> & { icon: IconName; label: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={cx(
        'flex size-10 shrink-0 items-center justify-center rounded-control text-ink-3',
        'transition-[background-color,color,transform] duration-150 hover:bg-hover-2 hover:text-ink',
        'active:scale-[0.94] disabled:pointer-events-none disabled:opacity-40 sm:size-8',
        className,
      )}
      {...props}
    >
      <Icon name={icon} />
    </button>
  )
}

import type { ReactNode } from 'react'
import { Icon, type IconName } from './Icon'

/** One navigation row in the sidebar: icon, truncated label, optional trailing control. */
export function SidebarRow({
  icon,
  label,
  active,
  onClick,
  trailing,
  'data-testid': testId,
}: {
  icon?: IconName
  label: string
  active?: boolean
  onClick(): void
  trailing?: ReactNode
  'data-testid'?: string
}) {
  return (
    <div className="group/row mx-2 flex items-center gap-0.5">
      <button
        type="button"
        onClick={onClick}
        title={label}
        aria-current={active ? 'page' : undefined}
        data-testid={testId}
        className={`flex h-11 min-w-0 flex-1 items-center rounded-control px-2 text-left transition-[background-color,color,transform] duration-150 active:scale-[0.98] sm:h-8 ${
          active ? 'bg-hover-2 text-ink' : 'text-ink-2 hover:bg-hover'
        }`}
      >
        {icon && (
          <span className="flex size-5 shrink-0 items-center justify-center">
            <Icon name={icon} />
          </span>
        )}
        <span className={`min-w-0 flex-1 truncate text-[14px] font-medium ${icon ? 'ml-1.5' : ''}`}>{label}</span>
      </button>
      {/* Always holds its width, so titles truncate in the same place whether or not it shows. */}
      {trailing && (
        <span className="shrink-0 transition-opacity focus-within:opacity-100 sm:opacity-0 sm:group-hover/row:opacity-100">
          {trailing}
        </span>
      )}
    </div>
  )
}

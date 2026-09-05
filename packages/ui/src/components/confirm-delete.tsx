import { Button } from '@tiny/ui/components/button'
import { AlertDialog } from 'radix-ui'
import type { ReactNode } from 'react'

/**
 * The question in front of a delete. It wraps the button that already meant
 * "delete" rather than replacing it, so the row keeps its layout and the
 * trigger keeps its own testid.
 *
 * `AlertDialog` and not `Dialog`: no close button, no dismissing on a click
 * outside, and focus lands on Cancel. Every way out except the one button does
 * nothing, which is the point.
 */
export const ConfirmDelete = ({
  name,
  note,
  onConfirm,
  children,
}: {
  name: string
  note: string
  onConfirm: () => void
  children: ReactNode
}) => (
  <AlertDialog.Root>
    <AlertDialog.Trigger asChild>{children}</AlertDialog.Trigger>
    <AlertDialog.Portal>
      <AlertDialog.Overlay className="bg-scrim data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0 supports-backdrop-filter:backdrop-blur-xs fixed inset-0 z-50 duration-100" />
      <AlertDialog.Content
        data-testid="confirm"
        // Both insets and `mx-auto` centre it without a width to calculate; the
        // height cap is for a long title on a short screen with a keyboard up.
        className="bg-popover rounded-card shadow-overlay data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95 fixed inset-x-4 top-1/2 z-50 mx-auto flex max-h-[calc(100dvh-2rem)] max-w-sm -translate-y-1/2 flex-col gap-2 overflow-y-auto p-5 duration-100"
      >
        <AlertDialog.Title className="font-heading font-medium break-words">
          Delete “{name}”?
        </AlertDialog.Title>
        <AlertDialog.Description className="text-ink-3 text-sm text-balance">
          {note}
        </AlertDialog.Description>
        {/* Cancel on the left because that is where every dialog puts it, and it
            holds focus, so Enter and Escape both mean no. */}
        <div className="mt-3 flex gap-2">
          <AlertDialog.Cancel asChild>
            <Button
              variant="outline"
              data-testid="confirm-cancel"
              className="h-control flex-1"
            >
              Cancel
            </Button>
          </AlertDialog.Cancel>
          <AlertDialog.Action asChild>
            <Button
              variant="destructive"
              data-testid="confirm-delete"
              className="h-control flex-1"
              onClick={onConfirm}
            >
              Delete
            </Button>
          </AlertDialog.Action>
        </div>
      </AlertDialog.Content>
    </AlertDialog.Portal>
  </AlertDialog.Root>
)

interface ConfirmationDialogProps {
  open: boolean;
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmationDialog({
  open,
  title,
  description,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  destructive = false,
  onConfirm,
  onCancel,
}: ConfirmationDialogProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[460] flex items-center justify-center bg-black/60 p-4">
      <div className="w-[20vw] min-w-[320px] max-w-[420px] rounded-lg border border-border bg-card shadow-xl">
        <div className="border-b border-border px-5 py-4">
          <h3 className="text-base font-semibold">{title}</h3>
          <p className="mt-1 text-sm text-muted-foreground">{description}</p>
        </div>
        <div className="flex justify-end gap-2 px-5 py-4">
          <button
            type="button"
            className="rounded-md border border-input bg-background px-3 py-2 text-sm"
            onClick={onCancel}
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            className={`rounded-md px-3 py-2 text-sm ${
              destructive
                ? "bg-destructive/20 text-destructive hover:bg-destructive/30"
                : "bg-primary text-primary-foreground hover:opacity-90"
            }`}
            onClick={onConfirm}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

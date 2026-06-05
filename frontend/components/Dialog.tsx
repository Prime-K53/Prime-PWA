import React from 'react';

interface DialogProps {
  open: boolean;
  onOpenChange?: (open: boolean) => void;
  onClose?: () => void;
  title?: string;
  children: React.ReactNode;
}

interface DivProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
}

const useFocusTrap = (ref: React.RefObject<HTMLDivElement | null>, open: boolean) => {
  React.useEffect(() => {
    if (!open || !ref.current) return;

    const container = ref.current;
    const previouslyFocused = document.activeElement as HTMLElement;

    const focusableSelectors = 'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';
    const getFocusable = () => Array.from(container.querySelectorAll<HTMLElement>(focusableSelectors));

    const focusFirst = () => {
      const focusable = getFocusable();
      if (focusable.length > 0) focusable[0].focus();
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;
      const focusable = getFocusable();
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };

    focusFirst();
    container.addEventListener('keydown', handleKeyDown);

    return () => {
      container.removeEventListener('keydown', handleKeyDown);
      previouslyFocused?.focus();
    };
  }, [open, ref]);
};

const Dialog: React.FC<DialogProps> = ({ open, onOpenChange, onClose, title, children }) => {
  const dialogRef = React.useRef<HTMLDivElement>(null);
  useFocusTrap(dialogRef, open);

  if (!open) return null;

  const handleClose = () => {
    onOpenChange?.(false);
    onClose?.();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200"
      onClick={handleClose}
    >
      <div
        ref={dialogRef}
        className="relative animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={title || 'Dialog'}
      >
        <DialogContent className="max-w-xl">
          {(title || onClose) && (
            <DialogHeader className="flex items-center justify-between py-4 px-6">
              {title && <DialogTitle>{title}</DialogTitle>}
              {onClose && (
                <button onClick={handleClose} className="text-slate-400 hover:text-slate-600 transition-colors text-xl font-bold">
                  ✕
                </button>
              )}
            </DialogHeader>
          )}
          <div className="p-6">
            {children}
          </div>
        </DialogContent>
      </div>
    </div>
  );
};

const DialogContent: React.FC<DivProps> = ({ className = '', children, ...props }) => (
  <div className={`w-full max-w-5xl rounded-2xl border border-slate-200/60 bg-white/95 backdrop-blur-xl shadow-2xl ring-1 ring-slate-200/60 ${className}`} {...props}>
    {children}
  </div>
);

const DialogHeader: React.FC<DivProps> = ({ className = '', ...props }) => (
  <div className={`relative px-8 py-6 border-b border-slate-200/60 bg-gradient-to-r from-slate-50/50 to-white/50 ${className}`} {...props} />
);

const DialogTitle: React.FC<React.HTMLAttributes<HTMLHeadingElement>> = ({ className = '', ...props }) => (
  <h3 className={`text-xl font-semibold text-slate-900 tracking-tight ${className}`} {...props} />
);

const DialogFooter: React.FC<DivProps> = ({ className = '', ...props }) => (
  <div className={`px-8 py-6 border-t border-slate-200/60 bg-gradient-to-r from-white/50 to-slate-50/50 flex justify-end gap-3 ${className}`} {...props} />
);

export { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter };
export default Dialog;

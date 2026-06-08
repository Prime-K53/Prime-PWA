import React from 'react';
import { useKeyboardContext } from '../core/keyboard';
import { trapFocus } from '../core/keyboard';

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

const Dialog: React.FC<DialogProps> = ({ open, onOpenChange, onClose, title, children }) => {
  const dialogRef = React.useRef<HTMLDivElement>(null);
  const { registerShortcut } = useKeyboardContext();

  React.useEffect(() => {
    if (!open) return;
    const unregister = registerShortcut({
      id: `dialog-escape-${Date.now()}`,
      key: 'Escape',
      handler: () => {
        onOpenChange?.(false);
        onClose?.();
      },
      priority: 50,
      description: 'Close dialog',
    });
    const container = dialogRef.current;
    if (container) {
      const release = trapFocus(container);
      return () => {
        unregister();
        release();
      };
    }
    return unregister;
  }, [open]);

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
                <button onClick={handleClose} className="text-slate-400 hover:text-slate-600 transition-colors text-xl font-bold" title="Close" aria-label="Close">
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

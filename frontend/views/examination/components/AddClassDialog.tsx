import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../../../components/Dialog';
import { Input } from '../../../components/Input';

interface AddClassDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAdd: (data: { class_name: string; number_of_learners: number }) => Promise<void>;
}

export const AddClassDialog: React.FC<AddClassDialogProps> = ({ open, onOpenChange, onAdd }) => {
  const [className, setClassName] = useState('');
  const [learners, setLearners] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    
    // Client-side validation
    if (!className || !className.trim()) {
      setError('Class name is required');
      return;
    }
    if (!learners) {
      setError('Number of learners is required');
      return;
    }
    
    const learnersNum = parseInt(learners, 10);
    if (isNaN(learnersNum) || learnersNum <= 0) {
      setError('Number of learners must be a positive number');
      return;
    }

    setLoading(true);
    try {
      await onAdd({
        class_name: className,
        number_of_learners: learnersNum
      });
      // Only reset and close on success
      setClassName('');
      setLearners('');
      setError(null);
      onOpenChange(false);
    } catch (err) {
      // Error is handled by parent (handleAddClass), but display it here too
      const errorMsg = err instanceof Error ? err.message : 'Failed to add class';
      setError(errorMsg);
      console.error('Failed to add class:', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Add New Class</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="px-8 py-6 space-y-4">
          {error && (
            <div className="rounded-lg bg-red-50 border border-red-200 p-3">
              <p className="text-sm text-red-700">{error}</p>
            </div>
          )}
          <div className="space-y-2">
            <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wide">Class Name</label>
            <Input
              value={className}
              onChange={(e) => {
                setClassName(e.target.value);
                setError(null); // Clear error when user starts typing
              }}
              placeholder="e.g., Form 1A"
              className="rounded-xl border-slate-200 focus:ring-blue-100"
              required
              disabled={loading}
            />
          </div>
          <div className="space-y-2">
            <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wide">Number of Learners</label>
            <Input
              type="number"
              value={learners}
              onChange={(e) => {
                setLearners(e.target.value);
                setError(null); // Clear error when user starts typing
              }}
              placeholder="0"
              required
              min="1"
              className="rounded-xl border-slate-200 focus:ring-blue-100"
              disabled={loading}
            />
          </div>
          <DialogFooter>
            <button
              type="button"
              onClick={() => {
                onOpenChange(false);
                setError(null);
              }}
              disabled={loading}
              className="inline-flex items-center gap-1.5 bg-slate-50 text-slate-700 px-4 py-2 rounded-xl font-medium hover:bg-slate-100 text-sm shadow-sm transition-all border border-slate-200 disabled:opacity-60"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="inline-flex items-center gap-1.5 bg-blue-600 text-white px-4 py-2 rounded-xl font-medium hover:bg-blue-700 text-sm shadow-sm transition-all disabled:opacity-60"
            >
              {loading ? 'Adding...' : 'Add Class'}
            </button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

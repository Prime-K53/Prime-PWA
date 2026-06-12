import React from 'react';

type Props = {
  open: boolean;
  onClose: () => void;
  title?: string;
  content?: React.ReactNode;
}

const DocumentPreviewModal: React.FC<Props> = ({ open, onClose, title = 'Document Preview', content }) => {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4 backdrop-blur-sm">
      <div className="bg-white rounded-[1.25rem] shadow-2xl w-full max-w-3xl overflow-hidden animate-fadeIn">
        <div className="p-4 border-b border-slate-100 bg-slate-50 flex justify-between items-center">
          <h3 className="text-lg font-semibold text-slate-900">{title}</h3>
          <button onClick={onClose} className="text-slate-600 hover:text-slate-800">Close</button>
        </div>
        <div className="p-6 max-h-[70vh] overflow:auto">
          {content ?? (
            <div className="text-slate-500">No content</div>
          )}
        </div>
      </div>
    </div>
  );
}

export default DocumentPreviewModal;

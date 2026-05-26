import React from 'react';
import { Receipt } from 'lucide-react';

type Props = {
  children: React.ReactNode;
  title?: string;
  subtitle?: string;
  showBrand?: boolean;
};

const AuthLayout: React.FC<Props> = ({ children, title, subtitle, showBrand = true }) => {
  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 flex items-center justify-center font-sans">
      <div className="absolute inset-0 pointer-events-none">
        <div className="fixed top-[-15%] right-[-10%] w-[700px] h-[700px] bg-gradient-to-br from-emerald-500/6 to-transparent rounded-full blur-[160px]" />
        <div className="fixed bottom-[-15%] left-[-10%] w-[700px] h-[700px] bg-gradient-to-tr from-blue-500/6 to-transparent rounded-full blur-[160px]" />
      </div>

      <div className="relative z-10 w-full max-w-5xl mx-auto px-6">
        <div className="bg-white/3 backdrop-blur-sm border border-white/6 rounded-2xl shadow-xl overflow-hidden grid grid-cols-1 lg:grid-cols-2">
          {showBrand && (
            <div className="hidden lg:flex flex-col gap-6 p-10 bg-gradient-to-b from-slate-900/40 to-slate-900/10">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center shadow-md">
                  <Receipt size={22} className="text-white" />
                </div>
                <div>
                  <div className="text-white font-bold text-xl">Prime ERP</div>
                  <div className="text-xs text-emerald-300 uppercase tracking-widest">Enterprise Suite</div>
                </div>
              </div>

              <div className="mt-6 text-slate-300">
                <h3 className="text-2xl font-semibold text-white">{title || 'Welcome'}</h3>
                {subtitle && <p className="text-sm mt-2 text-slate-400">{subtitle}</p>}
              </div>

              <div className="mt-auto text-slate-400 text-sm">Designed for enterprise workflows.</div>
            </div>
          )}

          <div className="p-8 lg:p-10 flex items-center justify-center">
            <div className="w-full max-w-md">{children}</div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AuthLayout;

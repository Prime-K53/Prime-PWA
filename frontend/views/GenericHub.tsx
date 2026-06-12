
import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';

interface HubOption {
  label: string;
  description: string;
  path?: string;
  onClick?: () => void;
  icon: React.ReactElement<{ size?: number }>;
  color: string;
}

interface GenericHubProps {
  title: string;
  subtitle: string;
  options: HubOption[];
  accentColor?: string;
  extraContent?: React.ReactNode;
}

const GenericHub: React.FC<GenericHubProps> = ({ title, subtitle, options, accentColor = '#2eb12e', extraContent }) => {
  const navigate = useNavigate();

  return (
    <div className="h-full flex flex-col p-8 bg-slate-50/50">
      <div className="flex-1 flex flex-col items-center overflow-hidden">
        <div className="max-w-4xl w-full text-center mb-8 animate-in fade-in slide-in-from-bottom-4 duration-500 flex-shrink-0">
          <h1 className="text-3xl font-black text-slate-800 uppercase tracking-tight mb-4">
            {title} <span style={{ color: accentColor }}>Command
          </span>
          </h1>
          <p className="text-slate-500 font-medium max-w-lg mx-auto leading-relaxed text-sm">
            {subtitle}
          </p>
        </div>

        <div className="flex-1 overflow-y-auto w-full custom-scrollbar">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 tablet-auto-fit-220 gap-4 max-w-6xl mx-auto animate-in fade-in zoom-in-95 duration-700 justify-items-center">
            {options.map((option) => (
              <button
                key={option.label}
                onClick={() => {
                  if (option.onClick) {
                    option.onClick();
                  } else if (option.path) {
                    navigate(option.path);
                  }
                }}
                className="group relative bg-white p-6 rounded-[1.5rem] border border-slate-200/60 shadow-sm hover:shadow-xl hover:border-emerald-500/20 transition-all duration-300 text-center flex flex-col items-center gap-3 active:scale-[0.98]"
              >
                <div className={`w-12 h-12 ${option.color} rounded-xl flex items-center justify-center mb-1 group-hover:scale-110 transition-transform duration-500`}>
                  {React.cloneElement(option.icon, { size: 24 })}
                </div>
                
                <div>
                  <h3 className="text-sm font-bold text-slate-800 mb-1.5 group-hover:text-[#2eb12e] transition-colors uppercase tracking-wide">
                    {option.label}
                  </h3>
                  <p className="text-[10px] text-slate-500 font-medium leading-relaxed px-2 line-clamp-2">
                    {option.description}
                  </p>
                </div>

                <div className="mt-2 opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-center gap-2 text-[#2eb12e] font-black text-[9px] uppercase tracking-widest">
                  Access <ArrowRight size={12} />
                </div>

                <div className="absolute top-4 right-4 w-1.5 h-1.5 rounded-full bg-slate-100 group-hover:bg-[#2eb12e] transition-colors" />
              </button>
            ))}
          </div>
        </div>

        {extraContent && (
          <div className="mt-8 w-full max-w-4xl animate-in fade-in slide-in-from-top-4 duration-700 delay-300 flex-shrink-0">
            {extraContent}
          </div>
        )}
      </div>

      <div className="mt-6 flex items-center justify-center gap-3 text-slate-400 flex-shrink-0 w-full">
        <div className="w-12 h-[1px] bg-slate-200" />
        <span className="text-[9px] font-black uppercase tracking-[0.3em]">Operational Neural Link</span>
        <div className="w-12 h-[1px] bg-slate-200" />
      </div>
    </div>
  );
};

export default GenericHub;

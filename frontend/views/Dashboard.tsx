import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useData, DASHBOARD_REFRESH_INTERVAL } from '../context/DataContext';
import { useModuleRefresh } from '../hooks/useModuleRefresh';
import { useAuth } from '../context/AuthContext';
import { useNotifications } from '../context/NotificationContext';
import {
  TrendingUp, TrendingDown, DollarSign, Clock,
  Briefcase, Users, ChevronDown, Bell, Search, User,
  MessageSquare, Calculator, FileText, Zap, ArrowRight, ChevronRight,
  Sparkles, Database, BarChart2, X, ArrowUp, ArrowDown, Building2,
  CheckCircle2, Trash2, ExternalLink, Star, Sun, Calendar} from 'lucide-react';
import WhatsAppMarketingModal from '../components/WhatsAppMarketingModal';
import { dbService } from '../services/db';
import { formatNumber, parseFormattedNumber } from '../utils/helpers';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell
} from 'recharts';
import { format } from 'date-fns';

// ─── CSS keyframes injected once ──────────────────────────────────────────────
const DASHBOARD_STYLES = `
  @keyframes kpi-slide-in {
    from { opacity: 0; transform: translateX(-8px); }
    to   { opacity: 1; transform: translateX(0); }
  }
  @keyframes kpi-slide-up {
    from { opacity: 0; transform: translateX(-8px) scale(0.97); }
    to   { opacity: 1; transform: translateX(0) scale(1); }
  }
  .kpi-value-animate {
    animation: kpi-slide-up 0.85s cubic-bezier(0.34, 1.56, 0.64, 1) both;
  }
  @keyframes shimmer-sweep {
    0%   { transform: translateX(-100%); }
    100% { transform: translateX(200%); }
  }
  @keyframes subtle-pulse {
    0%, 100% { opacity: 1; }
    50%       { opacity: 0.7; }
  }
  .kpi-value-animate {
    animation: kpi-slide-up 0.55s cubic-bezier(0.34, 1.56, 0.64, 1) both;
  }
  .kpi-card-shimmer::after {
    content: '';
    position: absolute;
    inset: 0;
    background: linear-gradient(105deg, transparent 40%, rgba(255,255,255,0.18) 50%, transparent 60%);
    animation: shimmer-sweep 3.5s ease-in-out infinite;
    border-radius: inherit;
    pointer-events: none;
  }
  @keyframes marquee-horizontal {
    0%   { transform: translateX(0); }
    15%  { transform: translateX(0); }
    85%  { transform: translateX(-35%); }
    100% { transform: translateX(-35%); }
  }
  .marquee-content {
    display: block;
    width: max-content;
    white-space: nowrap;
    animation: marquee-horizontal 7s ease-in-out infinite alternate;
  }
`;

const DashboardStyleInjector = () => {
  useEffect(() => {
    const id = 'prime-dashboard-styles';
    let el = document.getElementById(id) as HTMLStyleElement;
    if (!el) {
      el = document.createElement('style');
      el.id = id;
      document.head.appendChild(el);
    }
    el.textContent = DASHBOARD_STYLES;
  }, [DASHBOARD_STYLES]);
  return null;
};

// ─── helpers ────────────────────────────────────────────────────────────────

const toSafeNumber = (value: unknown): number => {
  if (value === null || value === undefined) return 0;
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  if (typeof value === 'string') {
    const cleaned = value.replace(/,/g, '');
    const n = parseFloat(cleaned);
    return Number.isFinite(n) ? n : 0;
  }
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
};

const isRecognizedInvoice = (invoice: any) => {
  const status = String(invoice?.status || '').trim().toLowerCase();
  return status !== 'draft' && status !== 'cancelled' && status !== 'void' && status !== 'voided';
};

const getInvoiceRevenueAmount = (invoice: any) => {
  if (!isRecognizedInvoice(invoice)) return 0;
  return toSafeNumber(invoice?.totalAmount);
};

const getGreeting = (): string => {
   const hour = new Date().getHours();
   if (hour < 12) return 'Good morning';
   if (hour < 18) return 'Good afternoon';
   return 'Good evening';
 };

 const formatShortCurrency = (currency: string, value: number): string => {
   const curr = (currency || '').trim();
   if (value >= 1_000_000) {
     const mVal = value / 1_000_000;
     return `${curr}${mVal % 1 === 0 ? mVal : mVal.toFixed(1)}M`;
   }
   if (value >= 1_000) {
     const kVal = value / 1_000;
     return `${curr}${kVal % 1 === 0 ? kVal : kVal.toFixed(1)}k`;
   }
   return `${curr}${value.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
 };

const hasChartValues = (rows: Array<{ income: number; expenses: number }>) =>
  rows.some(r => toSafeNumber(r.income) > 0 || toSafeNumber(r.expenses) > 0);

// ─── types ───────────────────────────────────────────────────────────────────

interface KpiData {
  label: string;
  value: string;
  rawValue: number;
  trend: number | null;
  trendLabel: string;
  icon: React.ReactNode;
  gradient: [string, string];
  sparkData: { v: number }[];
}

// ─── period map ──────────────────────────────────────────────────────────────

const PERIOD_DAYS: Record<string, number> = { Year: 365, Month: 30, Week: 7 };

// ─── sparkline ───────────────────────────────────────────────────────────────

const Sparkline = ({ data, color }: { data: { v: number }[]; color: string }) => (
  <div style={{ width: '100%', marginTop: 12, minWidth: 0, height: 32 }}>
    <ResponsiveContainer width="100%" height={32} minHeight={32} minWidth={0}>
      <AreaChart data={data}>
        <Area
          type="monotone"
          dataKey="v"
          stroke={color}
          fill={color}
          fillOpacity={0.25}
          strokeWidth={2}
          isAnimationActive={false}
          dot={false}
        />
      </AreaChart>
    </ResponsiveContainer>
  </div>
);

// ─── Premium KPI Card ─────────────────────────────────────────────────────────

interface PremiumKpiCardProps {
  title: string;
  subtitle?: string;
  icon: React.ReactNode;
  iconBg: string;
  iconColor: string;
  accentColor: string;      // gradient accent for top border
  value?: string;
  trend?: number | null;    // percent vs previous
  trendLabel?: string;
  badge?: string;
  badgeBg?: string;
  badgeColor?: string;
  badgeIcon?: React.ReactNode;
  showChevron?: boolean;
  progress?: number;
  topRightIndicator?: React.ReactNode;
  compact?: boolean;
  animDelay?: number;       // stagger delay in ms
  onClick?: () => void;
  children?: React.ReactNode;
}

const PremiumKpiCard = ({
  title, subtitle, icon, iconBg, iconColor, accentColor,
  value, trend, trendLabel, badge, badgeBg, badgeColor, badgeIcon, showChevron, progress, topRightIndicator, compact, animDelay = 0, onClick, children
}: PremiumKpiCardProps) => {
  const [animated, setAnimated] = useState(false);
  const trendUp = (trend ?? 0) >= 0;

  // Trigger staggered value animation — each card fires at a unique interval
  useEffect(() => {
    const start = setTimeout(() => setAnimated(true), animDelay);
    // Each card gets its own prime-number-ish interval so they never sync up
    const period = 5000 + animDelay * 1.4;
    const interval = setInterval(() => {
      setAnimated(false);
      setTimeout(() => setAnimated(true), 60);
    }, period);
    return () => { clearTimeout(start); clearInterval(interval); };
  }, [animDelay]);

  return (
    <div
      className="kpi-card-shimmer"
      style={{
        position: 'relative',
        background: 'rgba(255, 255, 255, 0.65)',
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
        borderRadius: compact ? 16 : 24,
        padding: compact ? '16px' : '24px',
        boxShadow: '0 8px 32px rgba(31, 38, 135, 0.08)',
        border: '1px solid rgba(255, 255, 255, 0.8)',
        borderTop: `2px solid ${accentColor}44`,
        cursor: 'pointer',
        transition: 'box-shadow 0.22s ease, transform 0.22s ease, background 0.22s ease',
        display: 'flex',
        flexDirection: 'column',
        gap: compact ? 8 : 16,
        overflow: 'hidden',
        minHeight: 0,
        fontFamily: "'Inter', sans-serif",
      }}
      onClick={onClick}
      onMouseEnter={(e) => {
        e.currentTarget.style.boxShadow = '0 6px 12px rgba(15,23,42,0.04), 0 24px 64px rgba(15,23,42,0.08)';
        e.currentTarget.style.transform = 'translateY(-2px)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.boxShadow = '0 4px 6px rgba(15,23,42,0.02), 0 12px 36px rgba(15,23,42,0.06)';
        e.currentTarget.style.transform = 'translateY(0)';
      }}
    >
      {children ? children : (
        <>
          {/* Top row: icon + chevron */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div style={{
              width: compact ? 36 : 42,
              height: compact ? 36 : 42,
              borderRadius: 12,
              background: iconBg.startsWith('rgba') || iconBg.startsWith('linear') ? iconBg : `linear-gradient(135deg, ${iconBg}, ${iconBg}cc)`,
              boxShadow: `0 4px 12px ${iconColor}22`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: iconColor,
              flexShrink: 0,
            }}>
              {icon}
            </div>
            {topRightIndicator ? (
              <div>{topRightIndicator}</div>
            ) : progress !== undefined ? (
              <div style={{ position: 'relative', width: compact ? 32 : 36, height: compact ? 32 : 36 }}>
                <svg viewBox="0 0 36 36" style={{ width: '100%', height: '100%', transform: 'rotate(-90deg)' }}>
                  <circle cx="18" cy="18" r="14" fill="none" stroke={`${iconColor}22`} strokeWidth="4" />
                  <circle cx="18" cy="18" r="14" fill="none" stroke={iconColor} strokeWidth="4" strokeDasharray="88" strokeDashoffset={88 - (88 * progress) / 100} strokeLinecap="round" style={{ transition: 'stroke-dashoffset 1s ease-out' }} />
                </svg>
              </div>
            ) : showChevron ? (
              <div style={{
                width: 28, height: 28, borderRadius: 8,
                backgroundColor: '#f1f5f9',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: '#94a3b8',
                transition: 'background 0.15s',
              }}>
                <ChevronRight size={14} />
              </div>
            ) : null}
          </div>

          {/* Content: title + value + trend */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: compact ? 3 : 4 }}>
            <div style={{
              fontSize: compact ? 11 : 12,
              fontWeight: 600,
              color: '#64748b',
              letterSpacing: '0.04em',
              textTransform: 'uppercase',
              lineHeight: 1.4,
            }}>
              {title}
            </div>

            {subtitle && !value && (
              <div style={{ fontSize: compact ? 11 : 13, fontWeight: 500, color: '#94a3b8', lineHeight: 1.4 }}>
                {subtitle}
              </div>
            )}

            {value && (
              <div
                className={animated ? 'kpi-value-animate' : ''}
                style={{
                  fontSize: compact ? 20 : 26,
                  fontWeight: 700,
                  color: '#0f172a',
                  letterSpacing: '-0.025em',
                  lineHeight: 1.15,
                  fontVariantNumeric: 'tabular-nums',
                  marginTop: 2,
                }}
              >
                {value}
              </div>
            )}

            {/* Trend indicator and badge */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 4 }}>
              {(trend !== undefined && trend !== null) || trendLabel ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                  {trend !== undefined && trend !== null && (
                    <span style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 3,
                      fontSize: compact ? 10 : 11,
                      fontWeight: 700,
                      color: trendUp ? '#16a34a' : '#dc2626',
                      backgroundColor: trendUp ? '#f0fdf4' : '#fef2f2',
                      padding: '2px 7px',
                      borderRadius: 6,
                      letterSpacing: '-0.01em',
                    }}>
                      {trendUp ? <TrendingUp size={10} /> : <TrendingDown size={10} />}
                      {trendUp ? '+' : ''}{trend.toFixed(1)}%
                    </span>
                  )}
                  {trendLabel && (
                    <span style={{ fontSize: compact ? 10 : 11, color: '#5b578c', fontWeight: 600 }}>
                      {trendLabel}
                    </span>
                  )}
                </div>
              ) : null}

              {badge && (
                <div style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 4,
                  padding: compact ? '5px 12px' : '6px 14px',
                  backgroundColor: badgeBg || (badge === 'This Month' ? '#eff6ff' : '#fef3c7'),
                  borderRadius: 999,
                  fontSize: compact ? 11 : 12,
                  fontWeight: 700,
                  color: badgeColor || (badge === 'This Month' ? '#3b82f6' : '#b45309'),
                  width: 'fit-content',
                }}>
                  {badgeIcon ? badgeIcon : badge === 'This Month' ? <Clock size={12} strokeWidth={2.5} /> : null}
                  {badge}
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {/* Soft accent glow at bottom */}
      <div style={{
        position: 'absolute',
        bottom: -12,
        left: -12,
        width: 80,
        height: 80,
        borderRadius: '50%',
        background: `radial-gradient(circle, ${accentColor}18 0%, transparent 70%)`,
        pointerEvents: 'none',
      }} />
    </div>
  );
};

// ─── Sliding Info Card component ──────────────────────────────────────────

const SlidingInfoCard = ({ slides, compact, animDelay = 0 }: { slides: any[], compact: boolean, animDelay?: number }) => {
  const [index, setIndex] = useState(0);
  const [direction, setDirection] = useState(1); // 1 for next, -1 for prev

  useEffect(() => {
    const timer = setInterval(() => {
      setDirection(1);
      setIndex(prev => (prev + 1) % slides.length);
    }, 10000 + animDelay);
    return () => clearInterval(timer);
  }, [slides.length, animDelay]);

  const slide = slides[index];

  return (
    <div
      className="kpi-card-shimmer"
      style={{
        position: 'relative',
        background: 'rgba(255, 255, 255, 0.65)',
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
        borderRadius: compact ? 16 : 24,
        padding: compact ? '16px' : '24px',
        boxShadow: '0 8px 32px rgba(31, 38, 135, 0.08)',
        border: '1px solid rgba(255, 255, 255, 0.8)',
        borderTop: `2px solid ${slide.color}44`,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        cursor: 'pointer',
        overflow: 'hidden',
        minHeight: compact ? 150 : 170,
        transition: 'all 0.5s ease-in-out',
      }}
    >
      <div key={index} className="animate-in fade-in slide-in-from-right-4 duration-1000" style={{ height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
        {slide.render ? slide.render(compact) : (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div style={{
                width: compact ? 36 : 42,
                height: compact ? 36 : 42,
                borderRadius: 12,
                background: `linear-gradient(135deg, ${slide.color}, ${slide.color}cc)`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#fff',
                boxShadow: `0 4px 12px ${slide.color}33`,
              }}>
                {slide.icon}
              </div>
              <div style={{ display: 'flex', gap: 4 }}>
                {slides.map((_, i) => (
                  <div key={i} style={{
                    width: 6, height: 6, borderRadius: '50%',
                    backgroundColor: i === index ? slide.color : 'rgba(0,0,0,0.1)',
                    transition: 'all 0.3s'
                  }} />
                ))}
              </div>
            </div>

            <div style={{ marginTop: 12 }}>
              <div style={{ fontSize: compact ? 11 : 12, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                {slide.label}
              </div>
              <div style={{ 
                overflow: 'hidden',
                width: '100%',
                position: 'relative'
              }}>
                <div 
                  className={String(slide.value || '').length > 11 ? 'marquee-content' : ''}
                  style={{ 
                    fontSize: compact ? 22 : 28, 
                    fontWeight: 800, 
                    color: '#2e2a5d', 
                    marginTop: 2, 
                    letterSpacing: '-0.02em',
                    whiteSpace: 'nowrap',
                    width: 'max-content',
                  }}
                >
                  {slide.value}
                </div>
              </div>
              <div style={{ fontSize: compact ? 11 : 12, fontWeight: 500, color: '#5b578c', marginTop: 2 }}>
                {slide.subtitle}
              </div>
            </div>
          </>
        )}
      </div>
      
      {/* Fallback indicators for custom render if they don't implement their own */}
      {slide.render && (
        <div style={{ position: 'absolute', bottom: compact ? 12 : 16, right: compact ? 16 : 24, display: 'flex', gap: 5 }}>
          {slides.map((_, i) => (
            <div key={i} style={{
              width: i === index ? 12 : 6, 
              height: 6, 
              borderRadius: 3,
              backgroundColor: i === index ? slide.color : 'rgba(0,0,0,0.1)',
              transition: 'all 0.3s'
            }} />
          ))}
        </div>
      )}
    </div>
  );
};

// ─── KPI card alias ────────────────────────────────────────────────────────
const SimpleKpiCard = PremiumKpiCard;

// ─── Animated value wrapper for custom-child KPI cards ─────────────────────
const KpiValueAnimator = ({ animDelay = 0, children }: { animDelay?: number; children: React.ReactNode }) => {
  const [animated, setAnimated] = useState(false);

  useEffect(() => {
    const start = setTimeout(() => setAnimated(true), animDelay);
    const period = 5000 + animDelay * 1.4;
    const interval = setInterval(() => {
      setAnimated(false);
      setTimeout(() => setAnimated(true), 60);
    }, period);
    return () => { clearTimeout(start); clearInterval(interval); };
  }, [animDelay]);

  return (
    <div className={animated ? 'kpi-value-animate' : ''}>
      {children}
    </div>
  );
};


// ─── KPI card (old design - keeping for reference if needed) ────────────────────────────────────────────

const KpiCard = ({ kpi }: { kpi: KpiData }) => {
  const [isHovered, setIsHovered] = useState(false);
  const displayTrend = kpi.trend ?? 0;
  const trendUp = displayTrend >= 0;
  const trendStr = kpi.trend !== null 
    ? `${trendUp ? '+' : ''}${displayTrend.toFixed(1)}% ${kpi.trendLabel}`
    : kpi.trendLabel;

  return (
    <div
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      style={{
        background: `linear-gradient(135deg, ${kpi.gradient[0]}, ${kpi.gradient[1]})`,
        borderRadius: 24,
        padding: '24px',
        color: '#fff',
        boxShadow: isHovered ? '0 12px 36px rgba(0,0,0,0.18)' : '0 8px 32px rgba(0,0,0,0.12)',
        transform: isHovered ? 'translateY(-4px)' : 'none',
        transition: 'transform 0.3s cubic-bezier(0.4, 0, 0.2, 1), box-shadow 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
        position: 'relative',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        gap: 4,
        minHeight: 160,
      }}
    >
      {/* icon badge */}
      <div
        style={{
          position: 'absolute',
          top: 20,
          right: 20,
          width: 44,
          height: 44,
          borderRadius: '50%',
          backgroundColor: 'rgba(255,255,255,0.18)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {kpi.icon}
      </div>

      {/* value */}
      <div style={{ fontSize: 28, fontWeight: 700, letterSpacing: '-0.02em', lineHeight: 1.2 }}>
        {kpi.value}
      </div>

      {/* label */}
      <div style={{ fontSize: 13, fontWeight: 500, opacity: 0.82, letterSpacing: '-0.01em' }}>
        {kpi.label}
      </div>

      {/* trend badge */}
      <div style={{ marginTop: 6 }}>
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 4,
            fontSize: 11,
            fontWeight: 600,
            backgroundColor: 'rgba(255,255,255,0.2)',
            borderRadius: 20,
            padding: '2px 10px',
          }}
        >
          {kpi.trend !== null && (trendUp ? <TrendingUp size={10} /> : <TrendingDown size={10} />)}
          {trendStr}
        </span>
      </div>

      {/* sparkline */}
      <Sparkline data={kpi.sparkData} color="rgba(255,255,255,0.9)" />
    </div>
  );
};

// ─── period dropdown ─────────────────────────────────────────────────────────

const PeriodDropdown = ({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) => {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          padding: '7px 12px',
          borderRadius: 20,
          border: '1px solid #E2E8F0',
          backgroundColor: '#fff',
          fontSize: 13,
          fontWeight: 600,
          color: '#334155',
          cursor: 'pointer',
          boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
          transition: 'box-shadow 0.15s',
        }}
      >
        {value}
        <ChevronDown size={14} style={{ transition: 'transform 0.15s', transform: open ? 'rotate(180deg)' : 'none' }} />
      </button>

      {open && (
        <div
          style={{
            position: 'absolute',
            top: 'calc(100% + 6px)',
            right: 0,
            backgroundColor: '#fff',
            border: '1px solid #E2E8F0',
            borderRadius: 12,
            boxShadow: '0 8px 24px rgba(0,0,0,0.1)',
            zIndex: 50,
            overflow: 'hidden',
            minWidth: 120,
          }}
        >
          {Object.keys(PERIOD_DAYS).map(period => (
            <button
              key={period}
              onClick={() => { onChange(period); setOpen(false); }}
              style={{
                display: 'block',
                width: '100%',
                textAlign: 'left',
                padding: '10px 16px',
                fontSize: 13,
                fontWeight: value === period ? 700 : 500,
                color: value === period ? '#4F46E5' : '#475569',
                backgroundColor: value === period ? '#EEF2FF' : 'transparent',
                border: 'none',
                cursor: 'pointer',
                transition: 'background-color 0.1s',
              }}
            >
              {period}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

// ─── Responsive hook ────────────────────────────────────────────────────────

const useWindowSize = () => {
  const [size, setSize] = useState({ width: window.innerWidth, height: window.innerHeight });
  useEffect(() => {
    const handler = () => setSize({ width: window.innerWidth, height: window.innerHeight });
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  }, []);
  return size;
};

// ─── Dashboard Content ───────────────────────────────────────────────────────

const DashboardContent: React.FC = () => {
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const [searchQuery, setSearchQuery] = useState('');
  const [showNotifications, setShowNotifications] = useState(false);
  const [isWhatsAppModalOpen, setIsWhatsAppModalOpen] = useState(false);
  const { width: screenWidth } = useWindowSize();

  // Responsive breakpoints
  const isMobile  = screenWidth < 640;
  const isTablet  = screenWidth >= 640 && screenWidth < 1024;
  const isDesktop = screenWidth >= 1024;

  const {
    customers = [],
    suppliers = [],
    companyConfig,
    accounts = [],
    invoices = [],
    sales = [],
    customerPayments = [],
    jobOrders = [],
    quotations = [],
    workOrders = [],
    purchases = [],
    expenses = [],
    recurringInvoices: subscriptions = [],
    resetSystem
  } = useData();

  const { 
    notifications: globalNotifications, 
    unreadCount, 
    markAsRead, 
    markAllAsRead, 
    dismissNotification 
  } = useNotifications();

  // Re-enable 1-minute polling and focus refresh for Dashboard
  useModuleRefresh(undefined, { interval: DASHBOARD_REFRESH_INTERVAL });

  const currency = companyConfig?.currencySymbol || 'MK ';

  const rawCompanyName = companyConfig?.companyName || 'Demo Company';
  const displayCompanyName = rawCompanyName.split(' ').slice(0, 2).join(' ');

  const [isLoading, setIsLoading] = useState(true);
  const [weather] = useState(() => {
    const hour = new Date().getHours();
    const isNight = hour < 6 || hour > 18;
    const baseTemp = isNight ? 18 : 24;
    const temp = baseTemp + Math.floor(Math.random() * 7);
    const conditions = isNight ? ['Clear Skies', 'Cool Breeze', 'Quiet Night'] : ['Sunny', 'Partly Cloudy', 'Bright Day'];
    return {
      temp: `${temp}°C`,
      cond: conditions[Math.floor(Math.random() * conditions.length)]
    };
  });
  const [chartData, setChartData]   = useState<any[]>([]);
  const [activePeriod, setActivePeriod] = useState<string>('Year');

  // ── Company Menu & Restore Logic ─────────────────────────────────────────

  const [showCompanyMenu, setShowCompanyMenu] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const restoreInputRef = useRef<HTMLInputElement>(null);

  const handleCreateCompany = async () => {
    if (window.confirm('Create a new company? This will permanently wipe and reset all current data except your subscription status.')) {
       try {
         await resetSystem();
         window.location.reload();
       } catch (e) {
         console.error(e);
       }
    }
  };

  const handleRestoreBackupFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (!file) return;

      const shouldRestore = window.confirm(`Restore company from backup "${file.name}"? This will replace the current local database context.`);
      if (!shouldRestore) {
          event.target.value = '';
          return;
      }
      try {
          const raw = await file.text();
          const parsed = JSON.parse(raw);
          if (!parsed || typeof parsed !== 'object' || !parsed.data) {
              throw new Error('Invalid Prime ERP backup structure.');
          }
          await dbService.importDatabase(raw);
          alert('Company restored successfully. Reloading view...');
          window.location.reload();
      } catch (error) {
          console.error('Failed to restore company', error);
          alert(error instanceof Error ? error.message : 'Company restore failed');
      } finally {
          event.target.value = '';
          setShowCompanyMenu(false);
      }
  };

  // ── Search Live Preview Logic ────────────────────────────────────────────

  const [isSearchFocused, setIsSearchFocused] = useState(false);
  const searchResults = React.useMemo(() => {
    if (!searchQuery || searchQuery.length < 2) return [];
    const lowerQ = searchQuery.toLowerCase();
    const results: Array<{type: string, text: string, link: string}> = [];
    
    (customers as any[]).forEach(c => {
      if (typeof c.name === 'string' && c.name.toLowerCase().includes(lowerQ)) {
        results.push({ type: 'Customer', text: c.name, link: '/customers' });
      }
    });
    (invoices as any[]).forEach(inv => {
      const invNum = inv.invoiceNumber || inv.id;
      if (String(invNum).toLowerCase().includes(lowerQ) || String(inv.customerName || '').toLowerCase().includes(lowerQ)) {
        results.push({ type: 'Invoice', text: `${invNum} - ${inv.customerName}`, link: '/sales-flow/invoices' });
      }
    });
    (jobOrders as any[]).forEach(job => {
      const jobName = job.jobName || job.title || job.orderNumber;
      if (String(jobName).toLowerCase().includes(lowerQ)) {
        results.push({ type: 'Job', text: String(jobName), link: '/production/jobs' });
      }
    });
    return results.slice(0, 6);
  }, [searchQuery, customers, invoices, jobOrders]);

  // ── account balances ─────────────────────────────────────────────────────

  const { cashBalance, bankBalance, chequeBalance, walletBalance } = (() => {
    if (!accounts || accounts.length === 0) {
      return { cashBalance: 2_300_000, bankBalance: 5_600_000, chequeBalance: 1_200_000, walletBalance: 1_200_000 };
    }
    let cash = 0, bank = 0, cheque = 0, wallet = 0;
    accounts.forEach((acc: any) => {
      const name = String(acc.name || '').toLowerCase();
      const type = String(acc.type || '').toLowerCase();
      const bal  = toSafeNumber(acc.balance);
      if (name.includes('cash') || type === 'cash')     cash   += bal;
      else if (name.includes('cheque') || type === 'cheque') cheque += bal;
      else if (name.includes('wallet') || type === 'wallet') wallet += bal;
      else bank += bal;
    });
    return { cashBalance: cash, bankBalance: bank, chequeBalance: cheque, walletBalance: wallet };
  })();

  // ── KPI calculations ─────────────────────────────────────────────────────

  // 1. Revenue (This Month) — posted invoice value in current calendar month
  const revenueThisMonth = (() => {
    const now = new Date();
    const mm = now.getMonth();
    const yyyy = now.getFullYear();
    return (invoices as any[])
      .filter((inv: any) => {
        const d = new Date(inv.date || inv.createdAt || '');
        return d.getMonth() === mm && d.getFullYear() === yyyy;
      })
      .reduce((sum: number, inv: any) => sum + getInvoiceRevenueAmount(inv), 0);
  })();

  // Also calc last month revenue for trend
  const revenueLastMonth = (() => {
    const now = new Date();
    let mm = now.getMonth() - 1;
    let yyyy = now.getFullYear();
    if (mm < 0) { mm = 11; yyyy--; }
    return (invoices as any[])
      .filter((inv: any) => {
        const d = new Date(inv.date || inv.createdAt || '');
        return d.getMonth() === mm && d.getFullYear() === yyyy;
      })
      .reduce((sum: number, inv: any) => sum + getInvoiceRevenueAmount(inv), 0);
  })();

  const revenueTrend = revenueLastMonth > 0
    ? ((revenueThisMonth - revenueLastMonth) / revenueLastMonth) * 100
    : (revenueThisMonth > 0 ? 100 : 0);

  // 2. Today's Collection — payments received today (customerPayments)
  const todayStr = new Date().toISOString().split('T')[0];
  const collectionData = (() => {
    const todayPayments = (customerPayments as any[])
      .filter((p: any) => String(p.date || p.createdAt || '').startsWith(todayStr));
    const sum = todayPayments.reduce((acc, p) => acc + toSafeNumber(p.amount), 0);
    const firstAcc = todayPayments[0]?.accountName || todayPayments[0]?.method || 'Cash';
    return { sum, acc: firstAcc };
  })();
  const todaysCollection = collectionData.sum;
  const collectionAccount = collectionData.acc;

  // Track new invoices today for indicator
  const newInvoicesToday = (invoices as any[]).filter((inv: any) => String(inv.date || inv.createdAt || '').startsWith(todayStr)).length;

  // Yesterday's collection for trend
  const yesterdayDate = new Date();
  yesterdayDate.setDate(yesterdayDate.getDate() - 1);
  const yesterdayStr = yesterdayDate.toISOString().split('T')[0];
  const yesterdaysCollection = (() => {
    return (customerPayments as any[])
      .filter((p: any) => String(p.date || p.createdAt || '').startsWith(yesterdayStr))
      .reduce((sum: number, p: any) => sum + toSafeNumber(p.amount), 0);
  })();

  const collectionTrend = yesterdaysCollection > 0
    ? ((todaysCollection - yesterdaysCollection) / yesterdaysCollection) * 100
    : (todaysCollection > 0 ? 100 : 0);

  // 3. Receivables — outstanding balance on unpaid/partial invoices
  const receivables = (invoices as any[])
    .filter((inv: any) => inv.status === 'Unpaid' || inv.status === 'Partial' || inv.status === 'Overdue')
    .reduce((sum: number, inv: any) => {
      const total  = toSafeNumber(inv.totalAmount);
      const paid   = toSafeNumber(inv.paidAmount);
      return sum + Math.max(0, total - paid);
    }, 0);

  // Overdue share for label
  const overdueCount = (invoices as any[]).filter((inv: any) => inv.status === 'Overdue').length;

  // 4. Active Jobs — count open job orders + active work orders
  const activeJobs = (() => {
    const activeJobOrders = (jobOrders as any[]).filter(
      (j: any) => !['Completed', 'Cancelled', 'Closed', 'Delivered'].includes(String(j.status || ''))
    ).length;
    const activeWorkOrders = (workOrders as any[]).filter(
      (w: any) => !['Completed', 'Cancelled', 'Closed'].includes(String(w.status || ''))
    ).length;
    // also check quotations that are approved (in-progress)
    const activeQuotations = (quotations as any[]).filter(
      (q: any) => q.status === 'Approved'
    ).length;
    return activeJobOrders + activeWorkOrders + activeQuotations;
  })();

  // Find latest unpaid invoice for bottom row detail
  const lastUnpaidInvoice = (() => {
    const unpaid = [...(invoices as any[])]
      .filter(inv => inv.status === 'Unpaid' || inv.status === 'Partial' || inv.status === 'Overdue')
      .sort((a, b) => new Date(b.date || b.createdAt || 0).getTime() - new Date(a.date || a.createdAt || 0).getTime());
    return unpaid[0] || null;
  })();

  // Find latest active job for sliding card detail
  const lastActiveJob = (() => {
    const active = [...(jobOrders as any[])]
      .filter(j => !['Completed', 'Cancelled', 'Closed', 'Delivered'].includes(String(j.status || '')))
      .sort((a, b) => new Date(b.date || b.createdAt || 0).getTime() - new Date(a.date || a.createdAt || 0).getTime());
    return active[0] || null;
  })();

  // Count pending queue
  const pendingJobsCount = (jobOrders as any[]).filter(j => String(j.status || '').toLowerCase() === 'pending').length;

  // ── sparkline seeds ───────────────────────────────────────────────────────
  const spark1 = [{ v: 10 }, { v: 15 }, { v: 12 }, { v: 25 }, { v: 18 }, { v: 30 }, { v: 28 }];
  const spark2 = [{ v: 20 }, { v: 18 }, { v: 25 }, { v: 22 }, { v: 35 }, { v: 30 }, { v: 40 }];
  const spark3 = [{ v: 30 }, { v: 25 }, { v: 35 }, { v: 20 }, { v: 15 }, { v: 25 }, { v: 20 }];
  const spark4 = [{ v: 15 }, { v: 25 }, { v: 20 }, { v: 35 }, { v: 45 }, { v: 30 }, { v: 50 }];

  // ── sliding slides ────────────────────────────────────────────────────────

  const activeSubscriptionsCount = (subscriptions as any[]).filter(s => String(s.status || '').toLowerCase() === 'active').length;
  const activeJobsCount = (jobOrders as any[]).filter(j => !['Completed', 'Cancelled', 'Closed', 'Delivered'].includes(String(j.status || ''))).length;

  const nextSubscription = (() => {
    const activeSubs = (subscriptions as any[]).filter(s => String(s.status || '').toLowerCase() === 'active');
    if (activeSubs.length === 0) return null;
    const enriched = activeSubs.map((sub) => {
      const lastGeneratedInvoice = [...(invoices as any[])]
        .filter(inv => inv.customerName === sub.customerName && String(inv.id || '').includes('REC'))
        .sort((a, b) => new Date(b.date || b.createdAt || 0).getTime() - new Date(a.date || a.createdAt || 0).getTime())[0] || null;
      const nextRunAt = sub.nextRunDate || sub.nextDueDate || sub.nextBillingDate || sub.dueDate || null;
      const amountDue = toSafeNumber(sub.total ?? sub.totalAmount ?? lastGeneratedInvoice?.totalAmount);

      return {
        ...sub,
        nextRunAt,
        nextDueDate: nextRunAt,
        nextBillingDate: nextRunAt,
        dueDate: nextRunAt,
        totalAmount: amountDue,
        amountDue,
        lastGeneratedInvoice
      };
    });

    const sorted = [...enriched].sort((a, b) => {
      const dateA = new Date(a.nextRunAt || '9999-12-31').getTime();
      const dateB = new Date(b.nextRunAt || '9999-12-31').getTime();
      return dateA - dateB;
    });
    const next = sorted[0];
    if (!next || (!next.customerName && !next.planName && !next.frequency)) return null;
    return next;
  })();

  const formatSubName = (name: string) => {
    if (!name) return '';
    return name.trim();
  };

  const infoSlides = [
    {
      label: 'Subscription',
      color: '#f59e0b',
      icon: <Star size={20} />,
      render: (compact: boolean) => (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, height: '100%' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', letterSpacing: '0.05em', textTransform: 'uppercase' }}>
              SUBSCRIPTION
            </div>
            <div style={{ width: 32, height: 32, borderRadius: 8, background: '#fffbeb', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#f59e0b', flexShrink: 0 }}>
              <Star size={16} fill="currentColor" />
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <div style={{ fontSize: 28, fontWeight: 800, color: '#f59e0b', letterSpacing: '-0.02em', lineHeight: 1 }}>
              {nextSubscription ? formatSubName(nextSubscription.customerName || nextSubscription.planName || 'Active') : 'Enterprise'}
            </div>
            <div style={{ fontSize: 11, color: '#64748b', fontWeight: 500, marginTop: 4 }}>
              {nextSubscription ? `${nextSubscription.customerName || 'Company account'} · ${nextSubscription.frequency || 'Pro'}` : 'Prime ERP Management System'}
            </div>
          </div>
          <div style={{ height: '1px', backgroundColor: 'rgba(0,0,0,0.06)', width: '100%', margin: '2px 0' }} />
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ fontSize: 11, color: '#64748b' }}>Next billing</div>
            <div style={{ fontSize: 11, color: '#0f172a', fontWeight: 700 }}>
              {nextSubscription ? format(new Date(nextSubscription.nextDueDate || nextSubscription.nextBillingDate || nextSubscription.dueDate), 'MMM d, yyyy') : '—'}
            </div>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ fontSize: 11, color: '#64748b' }}>Amount due</div>
            <div style={{ fontSize: 10, fontWeight: 700, color: '#b45309', backgroundColor: '#fffbeb', padding: '1px 8px', borderRadius: 6 }}>
              {formatShortCurrency(currency, toSafeNumber(nextSubscription?.amountDue))}
            </div>
          </div>
        </div>
      )
    },
    {
      label: 'Active Jobs',
      color: '#a855f7',
      icon: <Briefcase size={20} />,
      render: (compact: boolean) => (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, height: '100%' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', letterSpacing: '0.05em', textTransform: 'uppercase' }}>
              ACTIVE JOBS
            </div>
            <div style={{ width: 32, height: 32, borderRadius: 8, background: '#f3e8ff', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#a855f7', flexShrink: 0 }}>
              <Briefcase size={16} />
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <div style={{ fontSize: 28, fontWeight: 800, color: '#0f172a', letterSpacing: '-0.02em', lineHeight: 1 }}>
              {activeJobs || '0'}
            </div>
            <div style={{ fontSize: 11, color: '#64748b', fontWeight: 500, marginTop: 4 }}>
              Production in progress
            </div>
          </div>
          <div style={{ height: '1px', backgroundColor: 'rgba(0,0,0,0.06)', width: '100%', margin: '2px 0' }} />
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: '#1e293b' }}>
              <div style={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: '#a855f7' }} />
              {lastActiveJob ? `${lastActiveJob.jobNo || lastActiveJob.orderNo || 'Job Order'}` : 'No active jobs'}
            </div>
            <div style={{ fontSize: 10, fontWeight: 700, color: '#7c3aed', backgroundColor: '#f5f3ff', padding: '1px 8px', borderRadius: 6 }}>
              {lastActiveJob ? (lastActiveJob.status || 'Active') : 'Stable'}
            </div>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ fontSize: 11, color: '#64748b' }}>Queue</div>
            <div style={{ fontSize: 11, color: '#0f172a', fontWeight: 700 }}>
              {pendingJobsCount} pending
            </div>
          </div>
        </div>
      )
    },
    {
      label: `Weather · ${companyConfig?.city || 'Blantyre'}`,
      color: '#0ea5e9',
      icon: <Sun size={20} />,
      render: (compact: boolean) => (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, height: '100%' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#64748b', letterSpacing: '0.05em', textTransform: 'uppercase' }}>
              WEATHER · {companyConfig?.city?.toUpperCase() || 'BLANTYRE'}
            </div>
            <div style={{ width: 32, height: 32, borderRadius: 8, background: '#e0f2fe', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#0ea5e9', flexShrink: 0 }}>
              <Sun size={16} fill="currentColor" />
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <div style={{ fontSize: 28, fontWeight: 800, color: '#0f172a', letterSpacing: '-0.02em', lineHeight: 1 }}>
              {weather.temp}
            </div>
            <div style={{ fontSize: 11, color: '#64748b', fontWeight: 500, marginTop: 4 }}>
              {weather.cond} · {companyConfig?.city || 'Local area'}
            </div>
          </div>
          <div style={{ height: '1px', backgroundColor: 'rgba(0,0,0,0.06)', width: '100%', margin: '2px 0' }} />
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ fontSize: 11, color: '#64748b' }}>Afternoon</div>
            <div style={{ fontSize: 11, color: '#0f172a', fontWeight: 700 }}>
              {weather.temp} · High
            </div>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ fontSize: 11, color: '#64748b' }}>Condition</div>
            <div style={{ fontSize: 10, fontWeight: 700, color: '#16a34a', backgroundColor: '#f0fdf4', padding: '1px 8px', borderRadius: 6 }}>
              Stable
            </div>
          </div>
        </div>
      )
    },
  ];

  const kpiCards: KpiData[] = [
    {
      label: 'Revenue (This Month)',
      value: formatShortCurrency(currency, revenueThisMonth),
      rawValue: revenueThisMonth,
      trend: revenueTrend,
      trendLabel: 'vs last month',
      icon: <DollarSign size={22} color="#fff" />,
      gradient: ['#0d7c71', '#129a8e'],
      sparkData: spark1,
    },
    {
      label: "Today's Collection",
      value: formatShortCurrency(currency, todaysCollection),
      rawValue: todaysCollection,
      trend: collectionTrend,
      trendLabel: 'vs yesterday',
      icon: <Clock size={22} color="#fff" />,
      gradient: ['#5ebd69', '#45a750'],
      sparkData: spark2,
    },
    {
      label: 'Receivables',
      value: formatShortCurrency(currency, receivables),
      rawValue: receivables,
      trend: null,
      trendLabel: overdueCount > 0 ? `${overdueCount} overdue invoice${overdueCount > 1 ? 's' : ''}` : 'Outstanding balance',
      icon: <Users size={22} color="#fff" />,
      gradient: ['#d9663b', '#e67a4d'],
      sparkData: spark3,
    },
    {
      label: 'Active Jobs',
      value: formatNumber(activeJobs),
      rawValue: activeJobs,
      trend: null,
      trendLabel: 'In progress',
      icon: <Briefcase size={22} color="#fff" />,
      gradient: ['#177db8', '#2094d0'],
      sparkData: spark4,
    },
  ];

  // ── chart data load ───────────────────────────────────────────────────────

  const loadChartData = useCallback(() => {
    setIsLoading(true);
    try {
      const now  = new Date();
      const cData: Record<string, { income: number; expenses: number; day: string }> = {};

      if (activePeriod === 'Year') {
        const finYearRaw = (companyConfig as any)?.financialYearStart || (companyConfig as any)?.financialYearStartMonth;
        let finMonth = 0;
        if (typeof finYearRaw === 'number') finMonth = finYearRaw;
        else if (typeof finYearRaw === 'string' && finYearRaw.includes('-')) {
            const m = parseInt(finYearRaw.split('-')[1] || '1', 10);
            if (!isNaN(m)) finMonth = m - 1;
        }

        let startYear = now.getFullYear();
        if (now.getMonth() < finMonth) {
            startYear -= 1;
        }

        for (let i = 0; i < 12; i++) {
            const d = new Date(startYear, finMonth + i, 1);
            const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
            const label = d.toLocaleDateString('en-US', { month: 'short' });
            cData[key] = { income: 0, expenses: 0, day: label };
        }
      } else {
        const days = PERIOD_DAYS[activePeriod] ?? 30;
        for (let i = days - 1; i >= 0; i--) {
          const d = new Date(now);
          d.setDate(d.getDate() - i);
          let key: string;
          let label: string;

          if (activePeriod === 'Week') {
            key   = d.toISOString().split('T')[0];
            label = d.toLocaleDateString('en-US', { weekday: 'short' });
          } else {
            key   = d.toISOString().split('T')[0];
            label = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
          }

          if (!cData[key]) cData[key] = { income: 0, expenses: 0, day: label };
        }
      }

      const getChartKey = (dRaw: string) => {
          if (!dRaw) return null;
          const dt = new Date(dRaw);
          return activePeriod === 'Year' ? `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}` : dRaw.split('T')[0];
      };

      // Aggregate posted invoices
      (invoices as any[]).forEach((inv: any) => {
        const key = getChartKey(String(inv.date || inv.createdAt || ''));
        if (key && cData[key]) cData[key].income += getInvoiceRevenueAmount(inv);
      });

      // Aggregate sales
      // Note: Income from sales is already aggregated via 'invoices' as every sale creates a corresponding invoice record. 
      // We only count COGS/Expenses from the sales objects here.
      (sales as any[]).forEach((s: any) => {
        const key = getChartKey(String(s.date || s.createdAt || ''));
        if (key && cData[key]) {
          cData[key].expenses += toSafeNumber(s.cost ?? s.expense ?? 0);
        }
      });

      // Aggregate purchases (expenses)
      (purchases as any[]).forEach((p: any) => {
        const isPaid = p.status === 'Paid' || p.paymentStatus === 'Paid' || toSafeNumber(p.paidAmount) > 0 || p.paymentStatus === 'Partial';
        if (!isPaid) return;
        const key = getChartKey(String(p.date || p.orderDate || p.createdAt || ''));
        if (key && cData[key]) {
          cData[key].expenses += toSafeNumber(p.paidAmount ?? p.totalAmount ?? p.total);
        }
      });

      // Aggregate General Expenses (Rent, Utilities, etc.)
      (expenses as any[]).forEach((e: any) => {
        const key = getChartKey(String(e.date || e.createdAt || ''));
        if (key && cData[key]) {
          cData[key].expenses += toSafeNumber(e.amount);
        }
      });

      let formattedData = Object.values(cData);

      if (!hasChartValues(formattedData)) {
        // fallback zero data shaped to chosen period
        if (activePeriod === 'Year') {
          formattedData = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'].map((month) => ({
            day: month, income: 0, expenses: 0
          }));
        } else if (activePeriod === 'Week') {
          formattedData = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].map(d => ({
            day: d, income: 0, expenses: 0
          }));
        } else {
          formattedData = Array.from({ length: 30 }, (_, i) => ({
            day: `${i + 1}`, income: 0, expenses: 0
          }));
        }
      }

      setChartData(formattedData);
    } catch (err) {
      console.error('Error building chart data', err);
    } finally {
      setIsLoading(false);
    }
  }, [invoices, sales, purchases, activePeriod, companyConfig]);

  useEffect(() => { loadChartData(); }, [loadChartData]);



  // ─── render ─────────────────────────────────────────────────────────────

  return (
    <div
      className="animate-in fade-in slide-in-from-bottom-4 duration-700"
      style={{
        minHeight: '100vh',
        background: 'radial-gradient(circle at top left, #dfebfc, transparent 40%), radial-gradient(circle at bottom right, #ece1fa, transparent 40%), linear-gradient(135deg, #a7b5f5 0%, #d1c5f4 50%, #9db6f2 100%)',
        backgroundPosition: 'center top',
        backgroundRepeat: 'no-repeat',
        padding: isMobile ? '8px' : isTablet ? '16px' : '24px',
        fontFamily: "'Inter', -apple-system, sans-serif",
        color: '#1e293b',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: isMobile ? 8 : 16,
      }}
    >
      <DashboardStyleInjector />
      {/* ── Main Dashboard Card ──────────────────────────────────────── */}
      <div
        style={{
          background: 'rgba(255,255,255,0.45)',
          backdropFilter: 'blur(36px)',
          WebkitBackdropFilter: 'blur(36px)',
          borderRadius: isMobile ? 20 : 28,
          boxShadow: '0 8px 32px rgba(31, 38, 135, 0.12)',
          border: '1px solid rgba(255,255,255,0.6)',
          maxWidth: 1520,
          width: '100%',
          overflow: 'hidden',
          flex: 1,
        }}
      >
        {/* ── Top Bar: glassmorphism ──────────────────── */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: isMobile ? '8px 16px' : isTablet ? '16px 24px' : '16px 32px',
          borderBottom: '1px solid rgba(255,255,255,0.3)',
          background: 'rgba(255,255,255,0.25)',
          backdropFilter: 'blur(10px)',
          WebkitBackdropFilter: 'blur(10px)',
          flexWrap: 'wrap',
          gap: isMobile ? 8 : 16,
          position: 'relative',
          zIndex: 100,
        }}>
           {/* Left: Greeting & Company Dropdown */}
           <div style={{ display: 'flex', alignItems: 'center', position: 'relative' }}>
             <h1 
               onClick={() => setShowCompanyMenu(!showCompanyMenu)}
               style={{ fontSize: isMobile ? 14 : 16, fontWeight: 700, margin: 0, display: 'flex', alignItems: 'center', gap: 10, color: '#2e2a5d', cursor: 'pointer' }}
             >
               {getGreeting()}, <span style={{ fontWeight: 400, color: '#5b578c' }}>{displayCompanyName}</span>
               <ChevronDown size={18} color="#5b578c" style={{ transform: showCompanyMenu ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
             </h1>
            
            {showCompanyMenu && (
              <div style={{
                  position: 'absolute',
                  top: '100%',
                  left: 0,
                  marginTop: 12,
                  backgroundColor: '#ffffff',
                  borderRadius: 16,
                  boxShadow: '0 10px 40px rgba(0,0,0,0.12)',
                  border: '1px solid rgba(0,0,0,0.05)',
                  overflow: 'hidden',
                  zIndex: 60,
                  minWidth: 220,
              }}>
                <div 
                  onClick={handleCreateCompany}
                  style={{ padding: '12px 16px', fontSize: 13, fontWeight: 500, color: '#1e293b', cursor: 'pointer', borderBottom: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', gap: 8 }}
                  onMouseEnter={e => e.currentTarget.style.backgroundColor = '#f8fafc'}
                  onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}
                >
                  <Building2 size={16} color="#6366f1" /> Create New Company
                </div>
                <div 
                  onClick={() => restoreInputRef.current?.click()}
                  style={{ padding: '12px 16px', fontSize: 13, fontWeight: 500, color: '#1e293b', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8 }}
                  onMouseEnter={e => e.currentTarget.style.backgroundColor = '#f8fafc'}
                  onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}
                >
                  <Database size={16} color="#f59e0b" /> Restore a Company
                </div>
              </div>
            )}
            <input type="file" ref={restoreInputRef} style={{ display: 'none' }} accept=".json" onChange={handleRestoreBackupFile} />
          </div>

          {/* Search — pill style, hidden on mobile */}
          {!isMobile && (
            <div style={{ position: 'relative', width: isTablet ? 220 : 300 }}>
              <Search
                size={16}
                color="#94a3b8"
                style={{ position: 'absolute', left: 16, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}
              />
              <input
                type="text"
                placeholder="Search transactions, clients..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                style={{
                  width: '100%',
                  padding: '10px 18px 10px 42px',
                  borderRadius: 999,
                  border: '1px solid rgba(255,255,255,0.8)',
                  backgroundColor: 'rgba(255,255,255,0.6)',
                  fontSize: 13,
                  fontWeight: 500,
                  outline: 'none',
                  color: '#2e2a5d',
                  boxShadow: '0 4px 12px rgba(31,38,135,0.05)',
                  transition: 'border-color 0.15s, box-shadow 0.15s, background-color 0.15s',
                  boxSizing: 'border-box',
                }}
                onFocus={e => {
                  setIsSearchFocused(true);
                  e.target.style.borderColor = '#93c5fd';
                  e.target.style.boxShadow = '0 0 0 3px rgba(59,130,246,0.1)';
                  e.target.style.backgroundColor = 'rgba(255,255,255,0.9)';
                }}
                onBlur={e => {
                  setTimeout(() => setIsSearchFocused(false), 200);
                  e.target.style.borderColor = 'rgba(255,255,255,0.8)';
                  e.target.style.boxShadow = '0 4px 12px rgba(31,38,135,0.05)';
                  e.target.style.backgroundColor = 'rgba(255,255,255,0.6)';
                }}
              />

              {/* Live Preview Dropdown */}
              {isSearchFocused && searchResults.length > 0 && (
                <div style={{
                  position: 'absolute',
                  top: '100%',
                  left: 0,
                  right: 0,
                  marginTop: 8,
                  backgroundColor: '#ffffff',
                  borderRadius: 16,
                  boxShadow: '0 10px 40px rgba(0,0,0,0.12)',
                  border: '1px solid rgba(0,0,0,0.05)',
                  overflow: 'hidden',
                  zIndex: 50,
                }}>
                  {searchResults.map((res, i) => (
                    <div
                      key={i}
                      onClick={() => navigate(res.link)}
                      style={{
                        padding: '10px 16px',
                        borderBottom: i === searchResults.length - 1 ? 'none' : '1px solid #f1f5f9',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                      }}
                      onMouseEnter={e => e.currentTarget.style.backgroundColor = '#f8fafc'}
                      onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}
                    >
                      <span style={{ fontSize: 13, fontWeight: 500, color: '#1e293b' }}>{res.text}</span>
                      <span style={{ fontSize: 10, fontWeight: 700, color: '#6366f1', textTransform: 'uppercase', backgroundColor: '#eef2ff', padding: '2px 6px', borderRadius: 6 }}>{res.type}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Right side group */}
          <div style={{ display: 'flex', alignItems: 'center', gap: isMobile ? 8 : 12 }}>
            {/* Action Buttons — icon only on mobile */}
            <div style={{ display: 'flex', alignItems: 'center', gap: isMobile ? 6 : 8 }}>
              <button
                onClick={() => navigate('/smart-operations/pricing')}
                style={{
                  padding: isMobile ? '8px' : '8px 16px',
                  borderRadius: 999,
                  backgroundColor: 'rgba(255,255,255,0.6)',
                  border: '1px solid rgba(255,255,255,0.8)',
                  boxShadow: '0 4px 12px rgba(31,38,135,0.05)',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#2e2a5d',
                  transition: 'all 0.15s ease',
                }}
                onMouseEnter={e => { e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.9)'; e.currentTarget.style.color = '#3b82f6'; e.currentTarget.style.borderColor = '#bfdbfe'; }}
                onMouseLeave={e => { e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.6)'; e.currentTarget.style.color = '#2e2a5d'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.8)'; }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Calculator size={16} />
                  {!isMobile && <span style={{ fontWeight: 600, fontSize: 13 }}>Calculator</span>}
                </div>
              </button>

              <button
                onClick={() => setIsWhatsAppModalOpen(true)}
                style={{
                  padding: isMobile ? '8px' : '8px 16px',
                  borderRadius: 999,
                  backgroundColor: 'rgba(255,255,255,0.6)',
                  border: '1px solid rgba(255,255,255,0.8)',
                  boxShadow: '0 4px 12px rgba(31,38,135,0.05)',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  color: '#2e2a5d',
                  position: 'relative',
                  transition: 'all 0.15s ease',
                }}
                onMouseEnter={e => { e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.9)'; e.currentTarget.style.color = '#3b82f6'; e.currentTarget.style.borderColor = '#bfdbfe'; }}
                onMouseLeave={e => { e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.6)'; e.currentTarget.style.color = '#2e2a5d'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.8)'; }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <MessageSquare size={16} />
                  {!isMobile && <span style={{ fontWeight: 600, fontSize: 13 }}>Messages</span>}
                </div>
              </button>

              <button
                onClick={() => setShowNotifications(!showNotifications)}
                style={{
                  padding: isMobile ? '8px' : '8px 16px',
                  borderRadius: 999,
                  backgroundColor: showNotifications ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.6)',
                  border: `1px solid ${showNotifications ? '#bfdbfe' : 'rgba(255,255,255,0.8)'}`,
                  boxShadow: '0 4px 12px rgba(31,38,135,0.05)',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  color: showNotifications ? '#2563EB' : '#2e2a5d',
                  position: 'relative',
                  transition: 'all 0.15s ease',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <div style={{ position: 'relative' }}>
                    <Bell size={16} />
                    {unreadCount > 0 && (
                      <span style={{
                        position: 'absolute', top: -7, right: -7,
                        width: 14, height: 14,
                        backgroundColor: '#ef4444',
                        borderRadius: '50%',
                        fontSize: 8, fontWeight: 800,
                        color: '#fff',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        border: '1.5px solid #fff',
                        animation: 'subtle-pulse 2s infinite'
                      }}>{unreadCount > 99 ? '99+' : unreadCount}</span>
                    )}
                  </div>
                  {!isMobile && <span style={{ fontWeight: 600, fontSize: 13 }}>Notifications</span>}
                </div>
              </button>
            </div>

            {/* User Profile */}
            <div 
              style={{ display: 'flex', alignItems: 'center', gap: 10, marginLeft: isMobile ? 0 : 4, paddingLeft: isMobile ? 0 : 8, borderLeft: isMobile ? 'none' : '1px solid rgba(255,255,255,0.3)', position: 'relative', cursor: 'pointer' }}
              onClick={() => setShowUserMenu(!showUserMenu)}
            >
              <div style={{
                width: isMobile ? 34 : 38, height: isMobile ? 34 : 38,
                borderRadius: 999,
                background: 'linear-gradient(135deg, #a7b5f5, #d1c5f4)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: '#2e2a5d', fontWeight: 700, fontSize: 13, flexShrink: 0,
                boxShadow: '0 4px 10px rgba(31,38,135,0.1)',
                border: '2px solid rgba(255,255,255,0.8)'
              }}>
                {(user?.fullName || user?.name || 'A').charAt(0).toUpperCase()}
              </div>
              {!isMobile && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#2e2a5d' }}>{user?.role || 'User'}</div>
                  <ChevronDown size={14} color="#5b578c" style={{ transform: showUserMenu ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
                </div>
              )}

              {showUserMenu && (
                <div style={{
                  position: 'absolute',
                  top: '100%',
                  right: 0,
                  marginTop: 12,
                  backgroundColor: '#ffffff',
                  borderRadius: 16,
                  boxShadow: '0 10px 40px rgba(0,0,0,0.12)',
                  border: '1px solid rgba(0,0,0,0.05)',
                  overflow: 'hidden',
                  zIndex: 60,
                  minWidth: 160,
                }}>
                  <div 
                    onClick={() => navigate('/settings', { state: { tab: 'Security' } })}
                    style={{ padding: '12px 16px', fontSize: 13, fontWeight: 500, color: '#1e293b', cursor: 'pointer', borderBottom: '1px solid #f1f5f9', display: 'flex', alignItems: 'center', gap: 8 }}
                    onMouseEnter={e => e.currentTarget.style.backgroundColor = '#f8fafc'}
                    onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}
                  >
                    <User size={16} color="#6366f1" /> User Profile
                  </div>
                  <div 
                    onClick={() => {
                        logout();
                        window.location.href = '/login';
                    }}
                    style={{ padding: '12px 16px', fontSize: 13, fontWeight: 500, color: '#ef4444', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8 }}
                    onMouseEnter={e => e.currentTarget.style.backgroundColor = '#fef2f2'}
                    onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}
                  >
                    <X size={16} color="#ef4444" /> Log out
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Mobile full-width search row */}
          {isMobile && (
            <div style={{ width: '100%', position: 'relative' }}>
              <Search size={16} color="#3b82f6" style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)' }} />
              <input
                type="text"
                placeholder="Search..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                style={{
                  width: '100%',
                  padding: '9px 12px 9px 36px',
                  borderRadius: 999,
                  border: '1px solid #e8effc',
                  backgroundColor: '#f8faff',
                  fontSize: 13,
                  fontWeight: 500,
                  outline: 'none',
                  color: '#1e293b',
                  boxSizing: 'border-box',
                }}
              />
            </div>
          )}
        </div>

        {/* ── Date, Greeting and Reports Button ──────────────────────────────── */}
        <div style={{
          marginBottom: isMobile ? 12 : 24,
          padding: isMobile ? '12px 16px 0' : isTablet ? '12px 24px 0' : '24px 32px 12px',
        }}>
          <h2 style={{ fontSize: isMobile ? 18 : isTablet ? 22 : 26, fontWeight: 800, color: '#2e2a5d', margin: '0 0 8px', letterSpacing: '-0.02em' }}>
            {format(new Date(), isMobile ? 'EEE, MMM d' : 'EEEE, MMMM d, yyyy')}
          </h2>

          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: 12
          }}>
            <p style={{ margin: 0, fontSize: 14, color: '#5b578c', fontWeight: 500 }}>
              Here's what's happening with your business today.
            </p>

            <button
              onClick={() => navigate('/reports')}
              style={{
                background: 'linear-gradient(135deg, #2563EB, #6366f1)',
                color: '#fff',
                padding: isMobile ? '8px 16px' : '9px 18px',
                borderRadius: 999,
                border: 'none',
                fontSize: isMobile ? 12 : 13,
                fontWeight: 600,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                transition: 'all 0.2s ease',
                boxShadow: '0 4px 12px rgba(37,99,235,0.25)',
                whiteSpace: 'nowrap',
                letterSpacing: '-0.01em',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.boxShadow = '0 8px 20px rgba(37,99,235,0.35)';
                e.currentTarget.style.transform = 'translateY(-1px) scale(1.015)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.boxShadow = '0 4px 12px rgba(37,99,235,0.25)';
                e.currentTarget.style.transform = 'translateY(0) scale(1)';
              }}
            >
              {isMobile ? 'Reports' : 'View Detailed Reports'}
              <ArrowRight size={14} />
            </button>
          </div>
        </div>

        {/* ── Main Content: KPIs + Chart ────────────────────────────────── */}
        <div
          style={{
            display: 'grid',
            // Desktop: KPIs left, chart right | Tablet: stacked | Mobile: stacked
            gridTemplateColumns: isDesktop ? '1fr 1.6fr' : '1fr',
            gap: isDesktop ? 32 : 24,
            marginBottom: isMobile ? 24 : 32,
            padding: isMobile ? '0 16px 24px' : isTablet ? '0 24px 32px' : '0 32px 48px',
          }}
        >
          {/* Left Column: KPI Cards Grid — 2×2 */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: isMobile ? 12 : 24, minWidth: 0 }}>
            {/* Card 1 — Company Overview (Sliding) */}
            <SlidingInfoCard
              slides={infoSlides}
              compact={isMobile}
              animDelay={8000}
            />
            {/* Card 2 — Today's Collection */}
            <PremiumKpiCard
              title="Today's Collection"
              icon={<Clock size={isMobile ? 16 : 20} />}
              iconBg="rgba(16, 185, 129, 0.12)"
              iconColor="#10B981"
              accentColor="#10B981"
              compact={isMobile}
              animDelay={2000}
              onClick={() => navigate('/sales-flow/payments')}
            >
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {/* CARD TITLE Row */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{
                    fontSize: 11,
                    fontWeight: 700,
                    color: '#64748b',
                    letterSpacing: '0.05em',
                    textTransform: 'uppercase',
                  }}>
                    TODAY'S COLLECTION
                  </div>
                  <div style={{
                    width: 32,
                    height: 32,
                    borderRadius: 8,
                    background: '#ecfdf5',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#10b981',
                    flexShrink: 0,
                  }}>
                    <Clock size={16} />
                  </div>
                </div>

                {/* MAIN VALUE */}
                <KpiValueAnimator animDelay={2000}>
                  <div style={{
                    fontSize: 28,
                    fontWeight: 800,
                    color: '#059669',
                    letterSpacing: '-0.02em',
                    lineHeight: 1,
                  }}>
                    {formatShortCurrency(currency, todaysCollection)}
                  </div>
                </KpiValueAnimator>

                {/* ROW BELOW MAIN VALUE */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{
                    fontSize: 12,
                    fontWeight: 500,
                    color: '#64748b',
                  }}>
                    {collectionAccount || 'Cash + Mobile'}
                  </div>
                  <div style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 3,
                    fontSize: 11,
                    fontWeight: 700,
                    color: collectionTrend >= 0 ? '#16a34a' : '#dc2626',
                    backgroundColor: collectionTrend >= 0 ? '#f0fdf4' : '#fef2f2',
                    padding: '2px 7px',
                    borderRadius: 6,
                    letterSpacing: '-0.01em',
                  }}>
                    {collectionTrend >= 0
                      ? <TrendingUp size={10} />
                      : <TrendingDown size={10} />}
                    {collectionTrend >= 0 ? '+' : ''}{collectionTrend.toFixed(1)}% vs yest
                  </div>
                </div>

                {/* BOTTOM SECTION: Sparkline */}
                <div style={{ width: '100%', marginTop: 4, height: 48, minWidth: 0 }}>
                   <ResponsiveContainer width="100%" height={48} minHeight={48} minWidth={0}>
                      <AreaChart data={spark2}>
                        <Area
                          type="monotone"
                          dataKey="v"
                          stroke="#10b981"
                          fill="#10b981"
                          fillOpacity={0.1}
                          strokeWidth={2}
                          isAnimationActive={false}
                          dot={false}
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                </div>
              </div>
            </PremiumKpiCard>
            {/* Card 3 — Revenue */}
            <PremiumKpiCard
              title="Revenue"
              icon={<DollarSign size={isMobile ? 16 : 20} />}
              iconBg="rgba(37, 99, 235, 0.12)"
              iconColor="#2563EB"
              accentColor="#2563EB"
              compact={isMobile}
              animDelay={4000}
              onClick={() => navigate('/sales-flow/invoices')}
            >
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {/* CARD TITLE Row */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{
                    fontSize: 11,
                    fontWeight: 700,
                    color: '#64748b',
                    letterSpacing: '0.05em',
                    textTransform: 'uppercase',
                  }}>
                    REVENUE
                  </div>
                  <div style={{
                    width: 32,
                    height: 32,
                    borderRadius: 8,
                    background: revenueThisMonth >= (companyConfig?.monthlyRevenueTarget || 50000) ? '#ecfdf5' : '#eef2ff',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: revenueThisMonth >= (companyConfig?.monthlyRevenueTarget || 50000) ? '#10b981' : '#4f46e5',
                    flexShrink: 0,
                    transition: 'all 0.3s ease',
                  }}>
                    {revenueThisMonth >= (companyConfig?.monthlyRevenueTarget || 50000) ? <TrendingUp size={16} /> : <DollarSign size={16} />}
                  </div>
                </div>

                {/* MAIN VALUE */}
                <KpiValueAnimator animDelay={4000}>
                  <div style={{
                    fontSize: 28,
                    fontWeight: 800,
                    color: '#0f172a',
                    letterSpacing: '-0.02em',
                    lineHeight: 1,
                  }}>
                    {formatShortCurrency(currency, revenueThisMonth)}
                  </div>
                </KpiValueAnimator>

                {/* PROGRESS BAR ROW */}
                <div style={{ position: 'relative', marginTop: 4 }}>
                  <div style={{ width: '100%', height: 6, backgroundColor: '#f1f5f9', borderRadius: 999, overflow: 'hidden' }}>
                    <div style={{
                      width: `${Math.max(2, Math.min(100, (revenueThisMonth / (companyConfig?.monthlyRevenueTarget || 50000)) * 100))}%`,
                      height: '100%',
                      backgroundColor: revenueThisMonth >= (companyConfig?.monthlyRevenueTarget || 50000) ? '#10b981' : '#4f46e5',
                      borderRadius: 999,
                      transition: 'width 1.5s cubic-bezier(0.34, 1.56, 0.64, 1)',
                      boxShadow: revenueThisMonth >= (companyConfig?.monthlyRevenueTarget || 50000) ? '0 0 12px rgba(16, 185, 129, 0.4)' : '0 0 12px rgba(79, 70, 229, 0.3)',
                    }} />
                  </div>
                  {/* Indicator for goal if needed (optional subtle marker) */}
                </div>

                {/* ROW BELOW PROGRESS BAR */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ fontSize: 11, color: '#64748b', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4 }}>
                    <Calendar size={12} />
                    {(() => {
                      const now = new Date();
                      const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
                      const remaining = lastDay - now.getDate();
                      return remaining === 0 ? 'Last day!' : `${remaining} days left`;
                    })()}
                  </div>
                  <div style={{ fontSize: 11, color: '#64748b', fontWeight: 700 }}>
                    Goal: <span style={{ color: '#0f172a' }}>{formatShortCurrency(currency, companyConfig?.monthlyRevenueTarget || 50000)}</span>
                  </div>
                </div>

                {/* STATUS ROW */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: -4 }}>
                  <div style={{ 
                    fontSize: 10, 
                    fontWeight: 800, 
                    color: revenueThisMonth >= (companyConfig?.monthlyRevenueTarget || 50000) ? '#059669' : '#4f46e5',
                    backgroundColor: revenueThisMonth >= (companyConfig?.monthlyRevenueTarget || 50000) ? '#f0fdf4' : '#f5f3ff',
                    padding: '2px 8px',
                    borderRadius: 6,
                    textTransform: 'uppercase',
                    letterSpacing: '0.02em'
                  }}>
                    {Math.round((revenueThisMonth / (companyConfig?.monthlyRevenueTarget || 50000)) * 100)}% {revenueThisMonth >= (companyConfig?.monthlyRevenueTarget || 50000) ? 'ACHIEVED' : 'COMPLETE'}
                  </div>
                  <div style={{ 
                    fontSize: 11, 
                    color: revenueTrend >= 0 ? '#16a34a' : '#dc2626', 
                    fontWeight: 700, 
                    display: 'flex', 
                    alignItems: 'center', 
                    gap: 3 
                  }}>
                    {revenueTrend >= 0 ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
                    {revenueTrend >= 0 ? '+' : ''}{revenueTrend.toFixed(1)}%
                  </div>
                </div>
              </div>
            </PremiumKpiCard>
            {/* Card 4 — Unpaid Invoices */}
            <PremiumKpiCard
              title="Unpaid Invoices"
              icon={<FileText size={isMobile ? 16 : 20} />}
              iconBg="rgba(239, 68, 68, 0.1)"
              iconColor="#EF4444"
              accentColor="#EF4444"
              compact={isMobile}
              animDelay={6000}
              onClick={() => navigate('/sales-flow/invoices')}
            >
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {/* CARD TITLE Row */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{
                    fontSize: 11,
                    fontWeight: 700,
                    color: '#64748b',
                    letterSpacing: '0.05em',
                    textTransform: 'uppercase',
                  }}>
                    UNPAID INVOICES
                  </div>
                  <div style={{
                    width: 32,
                    height: 32,
                    borderRadius: 8,
                    background: '#fef2f2',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#dc2626',
                    flexShrink: 0,
                  }}>
                    <FileText size={16} />
                  </div>
                </div>

                {/* MAIN VALUE */}
                <KpiValueAnimator animDelay={6000}>
                  <div style={{
                    fontSize: 28,
                    fontWeight: 800,
                    color: '#dc2626',
                    letterSpacing: '-0.02em',
                    lineHeight: 1,
                  }}>
                    {formatShortCurrency(currency, receivables)}
                  </div>
                </KpiValueAnimator>

                {/* ROW BELOW MAIN VALUE */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div style={{
                    fontSize: 12,
                    fontWeight: 500,
                    color: '#64748b',
                    maxWidth: '100px',
                    lineHeight: 1.25,
                  }}>
                    {overdueCount + (invoices.filter(i => i.status === 'Unpaid' || i.status === 'Partial').length - overdueCount)} outstanding invoices
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2 }}>
                    <div style={{
                      fontSize: 13,
                      fontWeight: 800,
                      color: '#16a34a',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 2,
                    }}>
                      ↑ {formatShortCurrency(currency, receivables)}
                    </div>
                    <div style={{
                      fontSize: 10,
                      fontWeight: 700,
                      color: '#b45309',
                      backgroundColor: '#fffbeb',
                      padding: '1px 6px',
                      borderRadius: 6,
                      textTransform: 'lowercase',
                    }}>
                      new
                    </div>
                  </div>
                </div>

                {/* DIVIDER LINE */}
                <div style={{ height: '1px', backgroundColor: 'rgba(0,0,0,0.06)', width: '100%' }} />

                {/* BOTTOM ROW */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ fontSize: 12, color: '#1e293b', fontWeight: 500 }}>
                    {lastUnpaidInvoice ? (lastUnpaidInvoice.clientName || lastUnpaidInvoice.customerName) : 'No high debt'}
                  </div>
                  <div style={{ fontSize: 12, color: '#dc2626', fontWeight: 600 }}>
                    {formatShortCurrency(currency, lastUnpaidInvoice ? (toSafeNumber(lastUnpaidInvoice.totalAmount) - toSafeNumber(lastUnpaidInvoice.paidAmount)) : 0)}
                  </div>
                  <div style={{ fontSize: 11, color: '#94a3b8', fontWeight: 500 }}>
                    {lastUnpaidInvoice ? format(new Date(lastUnpaidInvoice.date || lastUnpaidInvoice.createdAt), 'MMM d') : '—'}
                  </div>
                </div>
              </div>
            </PremiumKpiCard>
          </div>

          {/* Right Column: Premium Chart */}
          <div style={{
            background: 'rgba(255,255,255,0.65)',
            backdropFilter: 'blur(16px)',
            WebkitBackdropFilter: 'blur(16px)',
            borderRadius: 24,
            padding: isMobile ? '20px' : '32px',
            border: '1px solid rgba(255,255,255,0.8)',
            boxShadow: '0 8px 32px rgba(31,38,135,0.08)',
            display: 'flex',
            flexDirection: 'column',
            minWidth: 0,
          }}>
            {/* Chart Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: isMobile ? 16 : 24, flexWrap: 'wrap', gap: 8 }}>
              <div>
                <h3 style={{ fontSize: isMobile ? 18 : 20, fontWeight: 800, color: '#2e2a5d', margin: 0, letterSpacing: '-0.02em' }}>
                  Financial performance
                </h3>
                {!isMobile && (
                  <div style={{ fontSize: 13, color: '#5b578c', fontWeight: 500, marginTop: 3 }}>
                    Revenue & Expenditures
                  </div>
                )}
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: isMobile ? 10 : 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <div style={{ width: 10, height: 10, borderRadius: '50%', backgroundColor: '#16a34a' }} />
                  <span style={{ fontSize: 12, fontWeight: 600, color: '#5b578c' }}>Revenue</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <div style={{ width: 10, height: 10, borderRadius: '50%', backgroundColor: '#dc2626' }} />
                  <span style={{ fontSize: 12, fontWeight: 600, color: '#5b578c' }}>Expenses</span>
                </div>
                {!isMobile && (
                  <div style={{ marginLeft: 4 }}>
                    <PeriodDropdown value={activePeriod} onChange={setActivePeriod} />
                  </div>
                )}
              </div>
            </div>

            <div
              style={{
                width: '100%',
                height: isMobile ? 220 : isTablet ? 280 : 316,
                minWidth: 0,
                minHeight: 150,
                overflow: 'hidden',
              }}
            >
              {chartData.length > 0 ? (
                <ResponsiveContainer width="100%" height={isMobile ? 220 : isTablet ? 280 : 316} minWidth={0} minHeight={150}>
                  <AreaChart data={chartData} margin={{ top: 8, right: isMobile ? 4 : 16, left: isMobile ? -24 : -8, bottom: 0 }}>
                    <defs>
                      <linearGradient id="gradRevenue" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#16a34a" stopOpacity={0.6} />
                        <stop offset="60%" stopColor="#22c55e" stopOpacity={0.15} />
                        <stop offset="100%" stopColor="#bbf7d0" stopOpacity={0} />
                      </linearGradient>
                      <linearGradient id="gradExpenses" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#dc2626" stopOpacity={0.3} />
                        <stop offset="100%" stopColor="#fecaca" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="4 4" vertical={false} stroke="rgba(148,163,184,0.18)" />
                    <XAxis
                      dataKey="day"
                      axisLine={false}
                      tickLine={false}
                      tick={{ fill: '#94a3b8', fontSize: isMobile ? 10 : 11, fontWeight: 500 }}
                      dy={8}
                      interval="preserveStartEnd"
                    />
                    <YAxis
                      axisLine={false}
                      tickLine={false}
                      tick={{ fill: '#cbd5e1', fontSize: isMobile ? 10 : 11, fontWeight: 500 }}
                      tickFormatter={(val) => val === 0 ? '0' : val >= 1000 ? `${(val / 1000).toFixed(0)}k` : String(val)}
                      dx={-4}
                      width={isMobile ? 36 : 48}
                    />
                    <Tooltip
                      contentStyle={{
                        borderRadius: 12,
                        border: 'none',
                        boxShadow: '0 8px 32px rgba(31,38,135,0.25)',
                        fontSize: isMobile ? 12 : 14,
                        padding: isMobile ? '10px 14px' : '14px 20px',
                        background: '#5b578c',
                        color: '#ffffff',
                      }}
                      labelStyle={{ fontWeight: 600, color: '#e0e7ff', marginBottom: 6, fontSize: 12 }}
                      itemStyle={{ fontWeight: 800, color: '#ffffff', fontVariantNumeric: 'tabular-nums', padding: '2px 0' }}
                      cursor={{ stroke: 'rgba(79,70,229,0.3)', strokeWidth: 1.5, strokeDasharray: '4 4' }}
                    />
                    <Area
                      type="monotone"
                      dataKey="income"
                      name="Revenue"
                      stroke="#16a34a"
                      strokeWidth={2}
                      fillOpacity={1}
                      fill="url(#gradRevenue)"
                      dot={false}
                      activeDot={{ r: 6, fill: '#ffffff', stroke: '#16a34a', strokeWidth: 3, filter: 'drop-shadow(0 4px 8px rgba(22,163,74,0.4))' }}
                    />
                    <Area
                      type="monotone"
                      dataKey="expenses"
                      name="Expense"
                      stroke="#dc2626"
                      strokeWidth={2}
                      fillOpacity={1}
                      fill="url(#gradExpenses)"
                      dot={false}
                      activeDot={{ r: 5, fill: '#ffffff', stroke: '#dc2626', strokeWidth: 2 }}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              ) : (
                <div
                  style={{
                    height: '100%',
                    minHeight: 150,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    textAlign: 'center',
                    color: '#94a3b8',
                    fontSize: isMobile ? 12 : 13,
                    fontWeight: 600,
                    border: '1px dashed rgba(148,163,184,0.28)',
                    borderRadius: 18,
                    background: 'rgba(248,250,252,0.7)',
                    padding: '16px 20px',
                  }}
                >
                  No financial activity is available for the selected period yet.
                </div>
              )}
            </div>
          </div>
        </div>
      </div>



      <WhatsAppMarketingModal 
        open={isWhatsAppModalOpen} 
        onOpenChange={setIsWhatsAppModalOpen} 
        companyName={companyConfig?.companyName || 'Prime ERP'}
      />

      {showNotifications && (
        <div 
          onClick={() => setShowNotifications(false)}
          style={{
            position: 'fixed', inset: 0, zIndex: 1000,
            backgroundColor: 'rgba(0,0,0,0.05)',
            display: 'flex', justifyContent: 'flex-end', paddingTop: 80, paddingRight: isMobile ? 10 : 30
          }}
        >
          <div 
            onClick={e => e.stopPropagation()}
            style={{
              width: isMobile ? 'calc(100vw - 20px)' : 400,
              maxHeight: '70vh',
              backgroundColor: '#fff',
              borderRadius: 24,
              boxShadow: '0 20px 50px rgba(15,23,42,0.15)',
              border: '1px solid rgba(15,23,42,0.08)',
              padding: 24,
              display: 'flex', flexDirection: 'column',
              gap: 16,
              overflow: 'hidden',
              animation: 'kpi-slide-in 0.3s ease-out'
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#0f172a' }}>Notifications</h3>
                {unreadCount > 0 && (
                  <span style={{ padding: '2px 8px', borderRadius: 99, backgroundColor: '#eff6ff', color: '#2563EB', fontSize: 11, fontWeight: 700 }}>{unreadCount} New</span>
                )}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                {unreadCount > 0 && (
                  <button 
                    onClick={() => markAllAsRead()}
                    title="Mark all as read"
                    style={{ border: 'none', background: 'none', color: '#2563EB', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, fontWeight: 600 }}
                  >
                    <CheckCircle2 size={16} /> Mark all read
                  </button>
                )}
                <button 
                  onClick={() => setShowNotifications(false)}
                  style={{ border: 'none', background: 'none', color: '#94a3b8', cursor: 'pointer', width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 8 }}
                  onMouseEnter={e => e.currentTarget.style.backgroundColor = '#f1f5f9'}
                  onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}
                ><X size={20} /></button>
              </div>
            </div>

            <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 10, paddingRight: 4 }}>
              {globalNotifications.length === 0 ? (
                <div style={{ padding: '60px 0', textAlign: 'center', color: '#94a3b8' }}>
                  <Bell size={48} style={{ opacity: 0.1, marginBottom: 16 }} />
                  <p style={{ fontSize: 14, fontWeight: 500, margin: 0 }}>All caught up!</p>
                  <p style={{ fontSize: 12, marginTop: 4 }}>No notifications for you right now.</p>
                </div>
              ) : (
                globalNotifications.map((notif: any) => (
                  <div 
                    key={notif.id}
                    onClick={() => {
                      if (!notif.is_read) markAsRead(notif.id);
                      if (notif.actionUrl) {
                        setShowNotifications(false);
                        navigate(notif.actionUrl);
                      }
                    }}
                    style={{
                      padding: '16px', borderRadius: 20, border: '1px solid rgba(15,23,42,0.05)',
                      backgroundColor: notif.is_read ? '#fff' : '#f8fafc', 
                      position: 'relative',
                      cursor: 'pointer',
                      transition: 'all 0.2s ease',
                      boxShadow: notif.is_read ? 'none' : '0 4px 12px rgba(37,99,235,0.04)'
                    }}
                    onMouseEnter={e => e.currentTarget.style.borderColor = 'rgba(37,99,235,0.2)'}
                    onMouseLeave={e => e.currentTarget.style.borderColor = 'rgba(15,23,42,0.05)'}
                  >
                    {!notif.is_read && (
                      <div style={{ position: 'absolute', top: 18, left: 6, width: 6, height: 6, borderRadius: '50%', backgroundColor: '#2563EB' }} />
                    )}
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                      <span style={{ 
                        fontSize: 10, fontWeight: 800, 
                        color: notif.priority === 'High' || notif.priority === 'Urgent' ? '#ef4444' : '#2563EB', 
                        textTransform: 'uppercase', letterSpacing: '0.05em' 
                      }}>
                        {notif.module?.toUpperCase()} | {notif.type?.replace(/_/g, ' ')}
                      </span>
                      <button 
                        onClick={(e) => { e.stopPropagation(); dismissNotification(notif.id); }}
                        style={{ border: 'none', background: 'none', color: '#cbd5e1', cursor: 'pointer', padding: 4, borderRadius: 6 }}
                        onMouseEnter={e => e.currentTarget.style.color = '#ef4444'}
                        onMouseLeave={e => e.currentTarget.style.color = '#cbd5e1'}
                      ><Trash2 size={14} /></button>
                    </div>
                    <h4 style={{ margin: '0 0 4px', fontSize: 13, fontWeight: 700, color: '#0f172a' }}>{notif.title}</h4>
                    <p style={{ margin: 0, fontSize: 12, color: '#64748b', lineHeight: 1.5 }}>{notif.message}</p>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 10 }}>
                      <span style={{ fontSize: 10, color: '#94a3b8', fontWeight: 500 }}>{format(new Date(notif.created_at || notif.date), 'MMM d, h:mm a')}</span>
                      {notif.actionUrl && (
                        <div style={{ fontSize: 10, color: '#2563EB', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 3 }}>
                          View Details <ArrowRight size={10} />
                        </div>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>

            <div style={{ borderTop: '1px solid #f1f5f9', paddingTop: 16, display: 'flex', justifyContent: 'center' }}>
              <button 
                onClick={() => { setShowNotifications(false); navigate('/audit'); }}
                style={{ 
                  border: 'none', background: 'none', color: '#64748b', fontSize: 12, fontWeight: 600, 
                  cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', borderRadius: 12
                }}
                onMouseEnter={e => e.currentTarget.style.backgroundColor = '#f1f5f9'}
                onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}
              >
                <ExternalLink size={14} /> View full activity log
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const Dashboard: React.FC = () => (
  <DashboardContent />
);

export default Dashboard;

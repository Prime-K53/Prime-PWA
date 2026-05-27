import React, { useMemo, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Building2, CheckCircle2, ShieldCheck, UserPlus, Loader2, Sparkles, Receipt, CalendarDays, Mail, Phone, MapPin, Globe, User, Key, Lock, Plus, Upload, AlertCircle, CheckCircle } from 'lucide-react';
import { Input } from '../../components/Input';
import AuthLayout from './AuthLayout';
import { useAuth } from '../../context/AuthContext';
import { dbService } from '../../services/db';
import { isPasswordComplexityEnabled, isPasswordProtectionEnabled, withNormalizedSecurityConfig } from '../../utils/securitySettings';

const SetupWizard: React.FC = () => {
  const navigate = useNavigate();
  const { companyConfig, completeSetup, validatePasswordStrength } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [setupMode, setSetupMode] = useState<'create' | 'restore' | null>(null);
  const [isRestoringBackup, setIsRestoringBackup] = useState(false);
  const [restoredCompanyData, setRestoredCompanyData] = useState<any>(null);

  const [company, setCompany] = useState({
    companyName: companyConfig?.companyName || '',
    email: companyConfig?.email || '',
    phone: companyConfig?.phone || '',
    addressLine1: companyConfig?.addressLine1 || '',
    city: companyConfig?.city || '',
    country: companyConfig?.country || '',
    currencySymbol: companyConfig?.currencySymbol || 'K',
    dateFormat: companyConfig?.dateFormat || 'DD/MM/YYYY',
    financialYearStart: (companyConfig as any)?.financialYearStart || 'January',
    fiscalYearEndMonth: (companyConfig as any)?.fiscalYearEndMonth || 'December',
    vatPricingMode: (companyConfig as any)?.vat?.pricingMode || 'VAT',
    passwordRequired: isPasswordProtectionEnabled(companyConfig),
    enforceComplexity: isPasswordComplexityEnabled(companyConfig),
  });

  const [admin, setAdmin] = useState({
    fullName: '',
    username: '',
    email: '',
    password: '',
    confirmPassword: '',
  });

  const passwordValidation = useMemo(
    () => validatePasswordStrength(admin.password),
    [admin.password, validatePasswordStrength]
  );

  const canContinueCompany = [
    company.companyName,
    company.phone,
    company.addressLine1,
  ].every(value => value.trim().length > 0);

  const canContinueUser = [
    admin.fullName,
    admin.email,
  ].every(value => value.trim().length > 0);

  const canSubmitAdmin = [
    admin.fullName,
    admin.email,
  ].every(value => value.trim().length > 0)
    && (
      !(company as any).passwordRequired
      || (
        admin.password.length > 0
        && admin.password === admin.confirmPassword
        && (
          !(company as any).enforceComplexity
          || passwordValidation.valid
        )
      )
    );

  const handleRestoreBackupFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsRestoringBackup(true);
    setError(null);

    try {
      const fileContent = await file.text();
      const backupData = JSON.parse(fileContent);

      if (!backupData || typeof backupData !== 'object' || !backupData.data) {
        throw new Error('Invalid backup file format. Expected backup to contain meta and data sections.');
      }

      let companyConfigJson = backupData.settings?.['nexus_company_config'];
      if (!companyConfigJson && Array.isArray(backupData.data?.settings)) {
        const settingsEntry = backupData.data.settings.find((entry: any) =>
          entry?.id === 'nexus_company_config' || entry?.key === 'nexus_company_config'
        );
        if (settingsEntry?.value) {
          companyConfigJson = typeof settingsEntry.value === 'string'
            ? settingsEntry.value
            : JSON.stringify(settingsEntry.value);
        }
      }

      if (!companyConfigJson) {
        throw new Error('No company configuration found in backup file.');
      }

      const restoredConfig = JSON.parse(companyConfigJson);

      await dbService.importDatabase(fileContent);
      localStorage.setItem('nexus_company_config', companyConfigJson);
      localStorage.setItem('nexus_initialized', backupData.settings?.['nexus_initialized'] || 'true');
      localStorage.setItem('prime_erp_backup_restored', JSON.stringify({
        restoredAt: new Date().toISOString(),
        filename: file.name,
        snapshotDate: backupData.meta?.date
      }));

      setRestoredCompanyData(restoredConfig);
      
      setCompany({
        companyName: restoredConfig.companyName || '',
        email: restoredConfig.email || '',
        phone: restoredConfig.phone || '',
        addressLine1: restoredConfig.addressLine1 || '',
        city: restoredConfig.city || '',
        country: restoredConfig.country || '',
        currencySymbol: restoredConfig.currencySymbol || 'K',
        dateFormat: restoredConfig.dateFormat || 'DD/MM/YYYY',
        financialYearStart: restoredConfig.financialYearStart || 'January',
        fiscalYearEndMonth: restoredConfig.fiscalYearEndMonth || 'December',
        vatPricingMode: restoredConfig.vat?.pricingMode || 'VAT',
        passwordRequired: isPasswordProtectionEnabled(restoredConfig),
        enforceComplexity: isPasswordComplexityEnabled(restoredConfig),
      });

      setStep(3);
      event.target.value = '';
      
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to restore backup file.');
      console.error('Restore error:', err);
      event.target.value = '';
    } finally {
      setIsRestoringBackup(false);
    }
  };

  const handleSetup = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!canSubmitAdmin) return;

    setSubmitting(true);
    setError(null);

    try {
      if ((company as any).passwordRequired && !admin.password) {
        throw new Error('Set an access password or turn off password protection.');
      }
      if (admin.password && admin.password !== admin.confirmPassword) {
        throw new Error("Passwords don't match.");
      }
      if ((company as any).passwordRequired && (company as any).enforceComplexity && admin.password && !passwordValidation.valid) {
        throw new Error(passwordValidation.errors[0] || 'Password does not meet the required complexity.');
      }

      const baseConfig = {
        ...companyConfig,
        ...company,
      } as any;

      const finalConfig = withNormalizedSecurityConfig({
        ...baseConfig,
        financialYearStart: company.financialYearStart,
        fiscalYearEndMonth: company.fiscalYearEndMonth,
        securitySettings: {
          ...(baseConfig.securitySettings || {}),
          passwordProtectionEnabled: (company as any).passwordRequired,
          enforcePasswordComplexity: (company as any).enforceComplexity,
        },
        vat: {
          ...(baseConfig.vat || {
            enabled: true,
            rate: 16.5,
            filingFrequency: 'Monthly',
            pricingMode: 'VAT',
          }),
          pricingMode: company.vatPricingMode,
        },
      });

      const autoUsername = admin.username.trim() || admin.email.trim().split('@')[0] || 'admin';
      await completeSetup(
        finalConfig,
        {
          id: '',
          username: autoUsername,
          fullName: admin.fullName.trim(),
          name: admin.fullName.trim(),
          email: admin.email.trim(),
          password: admin.password,
          role: 'Admin',
          status: 'Active',
          active: true,
          isSuperAdmin: true,
          mfaEnabled: false,
          groupIds: ['GRP-ADMIN'],
        } as any
      );

      navigate('/', { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Setup failed.');
    } finally {
      setSubmitting(false);
    }
  };

  const goToStep = (newStep: number) => {
    if (newStep === step || isTransitioning || newStep < 0 || newStep >= steps.length) return;
    setIsTransitioning(true);
    setTimeout(() => {
      setStep(newStep);
      setIsTransitioning(false);
    }, 150);
  };

  const steps = [
    { label: 'Setup Mode', icon: Building2 },
    { label: 'Company', icon: Building2 },
    { label: 'Financial', icon: CalendarDays },
    { label: 'User Account', icon: UserPlus },
    { label: 'Password Setup', icon: Key },
  ];

  const progress = ((step + 1) / steps.length) * 100;

  return (
    <AuthLayout title="Get Started" subtitle="Choose how to set up Prime ERP" showBrand>
      <div className="relative z-10 flex flex-col flex-1 w-full px-3">
        <div className="pt-4 pb-1 flex items-center justify-between">
          {step > 0 ? (
            <button
              type="button"
              onClick={() => goToStep(step - 1)}
              disabled={submitting}
              className="flex items-center gap-1.5 text-sm font-medium text-slate-400 hover:text-white transition-colors disabled:opacity-0 disabled:pointer-events-none"
            >
              <ArrowLeft size={16} />
              Back
            </button>
          ) : (
            <div />
          )}
          <span className="text-xs font-medium text-slate-500">{step + 1} / {steps.length}</span>
        </div>

        <div className="h-1 bg-white/10 rounded-full overflow-hidden mb-6">
          <div
            className="h-full bg-gradient-to-r from-blue-500 to-indigo-500 rounded-full transition-all duration-500 ease-out"
            style={{ width: `${progress}%` }}
          />
        </div>

        <div className="flex-1 flex flex-col">
          <div className={`flex-1 transition-all duration-200 ${isTransitioning ? 'opacity-0 translate-y-3' : 'opacity-100 translate-y-0'}`}>
            {step === 0 && (
              <div className="pt-4 animate-fade-in">
                <h1 className="text-xl lg:text-2xl font-semibold text-slate-100 mb-1">Get Started</h1>
                <p className="text-sm text-slate-400 mb-6">Choose how to set up Prime ERP</p>

                <div className="space-y-3">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".db,.json,application/octet-stream,application/json"
                    onChange={handleRestoreBackupFile}
                    className="hidden"
                  />

                  <button
                    type="button"
                    onClick={() => {
                      setSetupMode('create');
                      setError(null);
                      goToStep(1);
                    }}
                    className={`w-full flex items-center gap-4 p-4 rounded-2xl border-2 transition-all duration-200 text-left ${
                      setupMode === 'create'
                        ? 'border-blue-500/50 bg-blue-500/10'
                        : 'border-white/10 bg-white/5 hover:border-blue-500/30 hover:bg-blue-500/5'
                    }`}
                  >
                    <div className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 transition-all duration-200 ${
                      setupMode === 'create'
                        ? 'bg-blue-500/20'
                        : 'bg-white/10'
                    }`}>
                      <Plus size={22} className={setupMode === 'create' ? 'text-blue-400' : 'text-slate-400'} />
                    </div>
                    <div className="flex-1 min-w-0">
                    <div className="text-slate-100 font-semibold">Create New Company</div>
                    <div className="text-xs text-slate-400 mt-0.5">Set up a fresh Prime ERP instance</div>
                    </div>
                    <div className={`w-5 h-5 rounded-full border-2 transition-all duration-200 shrink-0 ${
                      setupMode === 'create' ? 'border-blue-400 bg-blue-500' : 'border-white/20'
                    }`}>
                      {setupMode === 'create' && <CheckCircle size={14} className="text-white w-full h-full" />}
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setSetupMode('restore');
                      setError(null);
                      fileInputRef.current?.click();
                    }}
                    disabled={isRestoringBackup}
                    className={`w-full flex items-center gap-4 p-4 rounded-2xl border-2 transition-all duration-200 text-left disabled:opacity-50 disabled:cursor-not-allowed ${
                      setupMode === 'restore'
                        ? 'border-purple-500/50 bg-purple-500/10'
                        : 'border-white/10 bg-white/5 hover:border-purple-500/30 hover:bg-purple-500/5'
                    }`}
                  >
                    <div className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 transition-all duration-200 ${
                      setupMode === 'restore' ? 'bg-purple-500/20' : 'bg-white/10'
                    }`}>
                      {isRestoringBackup ? (
                        <Loader2 size={22} className="text-purple-400 animate-spin" />
                      ) : (
                        <Upload size={22} className={setupMode === 'restore' ? 'text-purple-400' : 'text-slate-400'} />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                    <div className="text-slate-100 font-semibold">Restore Existing Company</div>
                    <div className="text-xs text-slate-400 mt-0.5">Upload a backup file to restore</div>
                    </div>
                    <div className={`w-5 h-5 rounded-full border-2 transition-all duration-200 shrink-0 ${
                      setupMode === 'restore' ? 'border-purple-400 bg-purple-500' : 'border-white/20'
                    }`}>
                      {setupMode === 'restore' && <CheckCircle size={14} className="text-white w-full h-full" />}
                    </div>
                  </button>
                </div>
              </div>
            )}

            {step === 1 && (
              <div className="pt-4 animate-fade-in">
                <h1 className="text-xl lg:text-2xl font-semibold text-slate-100 mb-1">Company Profile</h1>
                <p className="text-sm text-slate-400 mb-6">Tell us about your organization</p>

                {error && (
                  <div className="mb-5 p-3 bg-rose-500/10 border border-rose-500/20 rounded-xl flex items-start gap-2">
                    <AlertCircle size={14} className="text-rose-400 shrink-0 mt-0.5" />
                    <p className="text-xs text-rose-300">{error}</p>
                  </div>
                )}

                <div className="space-y-4">
                  <div>
                    <label className="text-xs font-semibold text-slate-300 mb-1.5 block">Company Name *</label>
                    <Input
                      value={company.companyName}
                      onChange={e => setCompany(prev => ({ ...prev, companyName: e.target.value }))}
                      className="w-full px-3.5 py-2.5 bg-white/5 border border-white/10 rounded-xl focus:bg-white/10 focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50 text-white text-sm transition-all placeholder:text-slate-500"
                      placeholder="Acme Corporation"
                      required
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs font-semibold text-slate-300 mb-1.5 block">Phone *</label>
                      <Input
                        value={company.phone}
                        onChange={e => setCompany(prev => ({ ...prev, phone: e.target.value }))}
                        className="w-full px-3.5 py-2.5 bg-white/5 border border-white/10 rounded-xl focus:bg-white/10 focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50 text-white text-sm transition-all placeholder:text-slate-500"
                        placeholder="+1 (555) 000-0000"
                        required
                      />
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-slate-300 mb-1.5 block">Email</label>
                      <Input
                        type="email"
                        value={company.email}
                        onChange={e => setCompany(prev => ({ ...prev, email: e.target.value }))}
                        className="w-full px-3.5 py-2.5 bg-white/5 border border-white/10 rounded-xl focus:bg-white/10 focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50 text-white text-sm transition-all placeholder:text-slate-500"
                        placeholder="contact@co.com"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="text-xs font-semibold text-slate-300 mb-1.5 block">Address *</label>
                    <Input
                      value={company.addressLine1}
                      onChange={e => setCompany(prev => ({ ...prev, addressLine1: e.target.value }))}
                      className="w-full px-3.5 py-2.5 bg-white/5 border border-white/10 rounded-xl focus:bg-white/10 focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50 text-white text-sm transition-all placeholder:text-slate-500"
                      placeholder="123 Business Way, Suite 100"
                      required
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs font-semibold text-slate-300 mb-1.5 block">City</label>
                      <Input
                        value={company.city}
                        onChange={e => setCompany(prev => ({ ...prev, city: e.target.value }))}
                        className="w-full px-3.5 py-2.5 bg-white/5 border border-white/10 rounded-xl focus:bg-white/10 focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50 text-white text-sm transition-all placeholder:text-slate-500"
                        placeholder="New York"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-slate-300 mb-1.5 block">Currency</label>
                      <select
                        value={company.currencySymbol}
                        onChange={e => setCompany(prev => ({ ...prev, currencySymbol: e.target.value }))}
                        className="w-full px-3.5 py-2.5 bg-white/5 border border-white/10 rounded-xl focus:bg-white/10 focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50 text-white text-sm transition-all outline-none appearance-none cursor-pointer"
                      >
                        <option value="K" className="bg-slate-900">K - Kwacha</option>
                        <option value="MWK" className="bg-slate-900">MWK - Malawi</option>
                        <option value="$" className="bg-slate-900">$ - US Dollar</option>
                        <option value="£" className="bg-slate-900">£ - Pound</option>
                        <option value="€" className="bg-slate-900">€ - Euro</option>
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="text-xs font-semibold text-slate-300 mb-1.5 block">Date Format</label>
                    <select
                      value={company.dateFormat}
                      onChange={e => setCompany(prev => ({ ...prev, dateFormat: e.target.value }))}
                      className="w-full px-3.5 py-2.5 bg-white/5 border border-white/10 rounded-xl focus:bg-white/10 focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50 text-white text-sm transition-all outline-none appearance-none cursor-pointer"
                    >
                      <option value="DD/MM/YYYY" className="bg-slate-900">DD/MM/YYYY</option>
                      <option value="MM/DD/YYYY" className="bg-slate-900">MM/DD/YYYY</option>
                      <option value="YYYY-MM-DD" className="bg-slate-900">YYYY-MM-DD</option>
                    </select>
                  </div>
                </div>
              </div>
            )}

            {step === 2 && (
              <div className="pt-4 animate-fade-in">
                <h1 className="text-xl lg:text-2xl font-semibold text-slate-100 mb-1">Financial Setup</h1>
                <p className="text-sm text-slate-400 mb-6">Configure financial year and pricing</p>

                <div className="space-y-5">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs font-semibold text-slate-300 mb-1.5 block">Year Start</label>
                      <select
                        value={company.financialYearStart}
                        onChange={e => setCompany(prev => ({ ...prev, financialYearStart: e.target.value }))}
                        className="w-full px-3.5 py-2.5 bg-white/5 border border-white/10 rounded-xl focus:bg-white/10 focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50 text-white text-sm transition-all outline-none appearance-none cursor-pointer"
                      >
                        {['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'].map(month => (
                          <option key={month} value={month} className="bg-slate-900">{month}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-slate-300 mb-1.5 block">Year End</label>
                      <select
                        value={company.fiscalYearEndMonth}
                        onChange={e => setCompany(prev => ({ ...prev, fiscalYearEndMonth: e.target.value }))}
                        className="w-full px-3.5 py-2.5 bg-white/5 border border-white/10 rounded-xl focus:bg-white/10 focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50 text-white text-sm transition-all outline-none appearance-none cursor-pointer"
                      >
                        {['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'].map(month => (
                          <option key={month} value={month} className="bg-slate-900">{month}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="text-xs font-semibold text-slate-300 mb-3 block">Pricing Mode</label>
                    <div className="grid grid-cols-2 gap-3">
                      <button
                        type="button"
                        onClick={() => setCompany(prev => ({ ...prev, vatPricingMode: 'VAT' }))}
                        className={`p-4 rounded-2xl border-2 text-left transition-all duration-200 ${
                          company.vatPricingMode === 'VAT'
                            ? 'bg-blue-500/10 border-blue-500/50'
                            : 'bg-white/5 border-white/10 hover:bg-white/10 hover:border-white/20'
                        }`}
                      >
                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center mb-3 transition-all ${
                          company.vatPricingMode === 'VAT' ? 'bg-blue-500/20' : 'bg-white/10'
                        }`}>
                          <Receipt size={20} className={company.vatPricingMode === 'VAT' ? 'text-blue-400' : 'text-slate-400'} />
                        </div>
                        <div className="text-slate-100 font-semibold text-sm">Tax (VAT)</div>
                        <div className="text-xs text-slate-400 mt-0.5">Standard pricing</div>
                      </button>
                      <button
                        type="button"
                        onClick={() => setCompany(prev => ({ ...prev, vatPricingMode: 'MarketAdjustment' }))}
                        className={`p-4 rounded-2xl border-2 text-left transition-all duration-200 ${
                          company.vatPricingMode === 'MarketAdjustment'
                            ? 'bg-purple-500/10 border-purple-500/50'
                            : 'bg-white/5 border-white/10 hover:bg-white/10 hover:border-white/20'
                        }`}
                      >
                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center mb-3 transition-all ${
                          company.vatPricingMode === 'MarketAdjustment' ? 'bg-purple-500/20' : 'bg-white/10'
                        }`}>
                          <Sparkles size={20} className={company.vatPricingMode === 'MarketAdjustment' ? 'text-purple-400' : 'text-slate-400'} />
                        </div>
                        <div className="text-slate-100 font-semibold text-sm">Market Adj.</div>
                        <div className="text-xs text-slate-400 mt-0.5">Dynamic pricing</div>
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {step === 3 && (
              <div className="pt-4 animate-fade-in">
                <h1 className="text-xl lg:text-2xl font-semibold text-slate-100 mb-1">Admin Account</h1>
                <p className="text-sm text-slate-400 mb-6">Create your primary user account</p>

                {error && (
                  <div className="mb-5 p-3 bg-rose-500/10 border border-rose-500/20 rounded-xl flex items-start gap-2">
                    <AlertCircle size={14} className="text-rose-400 shrink-0 mt-0.5" />
                    <p className="text-xs text-rose-300">{error}</p>
                  </div>
                )}

                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs font-semibold text-slate-300 mb-1.5 block">Full Name *</label>
                      <Input
                        value={admin.fullName}
                        onChange={e => setAdmin(prev => ({ ...prev, fullName: e.target.value }))}
                        className="w-full px-3.5 py-2.5 bg-white/5 border border-white/10 rounded-xl focus:bg-white/10 focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50 text-white text-sm transition-all placeholder:text-slate-500"
                        placeholder="John Doe"
                        required
                      />
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-slate-300 mb-1.5 block">Email <span className="text-rose-400">*</span></label>
                      <Input
                        type="email"
                        value={admin.email}
                        onChange={e => setAdmin(prev => ({ ...prev, email: e.target.value }))}
                        className="w-full px-3.5 py-2.5 bg-white/5 border border-white/10 rounded-xl focus:bg-white/10 focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50 text-white text-sm transition-all placeholder:text-slate-500"
                        placeholder="admin@company.com"
                        required
                      />
                    </div>
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-slate-300 mb-1.5 block">Username <span className="text-slate-500">(optional)</span></label>
                    <Input
                      value={admin.username}
                      onChange={e => setAdmin(prev => ({ ...prev, username: e.target.value }))}
                      className="w-full px-3.5 py-2.5 bg-white/5 border border-white/10 rounded-xl focus:bg-white/10 focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50 text-white text-sm transition-all placeholder:text-slate-500"
                      placeholder="Auto-generated from email"
                    />
                  </div>
                </div>
              </div>
            )}

            {step === 4 && (
              <div className="pt-4 animate-fade-in">
                <div className="flex items-center gap-3 mb-1">
                  <h1 className="text-xl lg:text-2xl font-semibold text-slate-100">Security</h1>
                  <span className="px-2 py-0.5 bg-white/10 border border-white/10 rounded-md text-[10px] font-semibold text-slate-400 uppercase tracking-wide">Optional</span>
                </div>
                <p className="text-sm text-slate-400 mb-6 leading-[1.45]">Configure account access settings</p>

                <div className="p-3 bg-blue-500/10 border border-blue-500/20 rounded-xl flex items-start gap-2 mb-6">
                  <AlertCircle size={14} className="text-blue-400 shrink-0 mt-0.5" />
                  <p className="text-xs text-blue-300">Password is optional. Enable it later in settings if you skip now.</p>
                </div>

                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs font-semibold text-slate-300 mb-1.5 block">Password</label>
                      <Input
                        type="password"
                        value={admin.password}
                        onChange={e => setAdmin(prev => ({ ...prev, password: e.target.value }))}
                        className="w-full px-3.5 py-2.5 bg-white/5 border border-white/10 rounded-xl focus:bg-white/10 focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50 text-white text-sm transition-all placeholder:text-slate-500"
                        placeholder="Leave blank to skip"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-slate-300 mb-1.5 block">Confirm</label>
                      <Input
                        type="password"
                        value={admin.confirmPassword}
                        onChange={e => setAdmin(prev => ({ ...prev, confirmPassword: e.target.value }))}
                        className="w-full px-3.5 py-2.5 bg-white/5 border border-white/10 rounded-xl focus:bg-white/10 focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50 text-white text-sm transition-all placeholder:text-slate-500"
                        placeholder="Repeat password"
                      />
                    </div>
                  </div>

                  {admin.password && (
                    <div className="p-4 bg-white/5 rounded-xl border border-white/10 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-slate-300">Strength</span>
                        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                          passwordValidation.valid ? 'bg-emerald-500/20 text-emerald-300' : 'bg-slate-500/20 text-slate-300'
                        }`}>
                          {passwordValidation.valid ? 'Strong' : 'Basic'}
                        </span>
                      </div>
                      <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
                        <div className={`h-full transition-all duration-500 rounded-full ${
                          passwordValidation.valid
                            ? 'w-full bg-gradient-to-r from-emerald-500 to-teal-500'
                            : 'w-1/3 bg-gradient-to-r from-slate-500 to-slate-600'
                        }`} />
                      </div>
                      {!passwordValidation.valid && (
                        <p className="text-xs text-slate-400">{passwordValidation.errors.length > 0 ? 'Tip: ' + passwordValidation.errors[0] : 'Basic password strength'}</p>
                      )}
                      {admin.confirmPassword && admin.password !== admin.confirmPassword && (
                        <p className="text-xs text-rose-300">Passwords don't match</p>
                      )}
                    </div>
                  )}

                  <div className="pt-3 border-t border-white/10 space-y-3">
                    <h3 className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Security Settings</h3>
                    
                    <div className="flex items-center justify-between p-3.5 bg-white/5 rounded-xl border border-white/10">
                      <div>
                        <div className="text-sm font-medium text-slate-100">Password Protection</div>
                        <div className="text-xs text-slate-400 mt-0.5">Require password for logins</div>
                      </div>
                      <button
                        type="button"
                        onClick={() => setCompany(prev => ({ ...prev, passwordRequired: !(prev as any).passwordRequired }))}
                        className={`relative w-11 h-6 rounded-full transition-all duration-200 ${
                          (company as any).passwordRequired ? 'bg-blue-600' : 'bg-slate-700'
                        }`}
                      >
                        <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all duration-200 shadow-sm ${
                          (company as any).passwordRequired ? 'left-6' : 'left-1'
                        }`} />
                      </button>
                    </div>

                    <div className="flex items-center justify-between p-3.5 bg-white/5 rounded-xl border border-white/10">
                      <div>
                        <div className="text-sm font-medium text-slate-100">Complex Passwords</div>
                        <div className="text-xs text-slate-400 mt-0.5">Enforce minimum complexity</div>
                      </div>
                      <button
                        type="button"
                        onClick={() => setCompany(prev => ({ ...prev, enforceComplexity: !(prev as any).enforceComplexity }))}
                        className={`relative w-11 h-6 rounded-full transition-all duration-200 ${
                          (company as any).enforceComplexity ? 'bg-blue-600' : 'bg-slate-700'
                        }`}
                      >
                        <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all duration-200 shadow-sm ${
                          (company as any).enforceComplexity ? 'left-6' : 'left-1'
                        }`} />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="py-4">
            {step < steps.length - 1 ? (
              <button
                type="button"
                onClick={() => {
                  if (step === 1 && !canContinueCompany) {
                    setError('Please complete all required fields.');
                    return;
                  }
                  if (step === 3 && !canContinueUser) {
                    setError('Please complete all required user information.');
                    return;
                  }
                  setError(null);
                  goToStep(step + 1);
                }}
                disabled={step === 0 && !setupMode}
                className="w-full py-2 bg-gradient-to-r from-blue-500 to-indigo-500 hover:from-blue-600 hover:to-indigo-600 disabled:from-slate-700 disabled:to-slate-700 disabled:text-slate-500 text-white font-semibold rounded-xl shadow-lg shadow-blue-500/25 transition-all duration-200 active:scale-[0.98] flex items-center justify-center gap-2 text-sm"
              >
                Continue
                <ArrowRight size={16} />
              </button>
            ) : (
              <button
                type="button"
                onClick={handleSetup}
                disabled={!canSubmitAdmin || submitting}
                className="w-full py-2 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 disabled:from-slate-700 disabled:to-slate-700 disabled:text-slate-500 text-white font-semibold rounded-xl shadow-lg shadow-emerald-500/25 transition-all duration-200 active:scale-[0.98] flex items-center justify-center gap-2 text-sm"
              >
                {submitting ? (
                  <>
                    <Loader2 size={16} className="animate-spin" />
                    Setting up...
                  </>
                ) : (
                  <>
                    Complete Setup
                    <CheckCircle2 size={16} />
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      </div>
    </AuthLayout>
  );
};

export default SetupWizard;

import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useExamination } from '../../context/ExaminationContext';
import { useInventory } from '../../context/InventoryContext';
import { PricingRoundingMethod } from '../../types';
import { useAuth } from '../../context/AuthContext';
import SubjectTable from './SubjectTable';
import PricingSummaryPanel from './PricingSummaryPanel';
import OverrideDialog from './components/OverrideDialog';
import StatusBadge from './components/StatusBadge';
import { Button } from '../../components/Button';
import { Input } from '../../components/Input';
import { Select } from '../../components/Select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../../components/Dialog';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/Card';
import { toast } from '../../components/Toast';
import { ROUNDING_METHOD_OPTIONS } from '../../services/pricingRoundingService';
import {
  getExamRoundingFromEngineMethod,
  getEngineMethodFromExamRounding
} from '../../services/examinationJobService';
import { isMarketAdjustmentActive } from '../../utils/marketAdjustmentUtils';
import { 
  Save, Calculator, DollarSign, Users, FileText, Plus, 
  CheckCircle, AlertTriangle, Loader2, ArrowLeft, Lock, Unlock, Info, Settings, X, ShieldCheck 
} from 'lucide-react';

export const calculateExaminationPricing = (
  bom: number,
  adjustmentRate: number,
  profitMargin: number,
  learners: number
) => {
  const adjustedCost = bom + (bom * adjustmentRate);
  const total = adjustedCost * (1 + profitMargin);
  const rawFeePerLearner = learners > 0 ? total / learners : 0;
  
  const precisionFee = Number(rawFeePerLearner.toFixed(2));
  const roundedFeePerLearner = Math.ceil(precisionFee / 50) * 50;
  const roundedTotal = learners > 0 ? roundedFeePerLearner * learners : total;
  
  return {
    Total: Number(roundedTotal.toFixed(2)),
    FeePerLearner: roundedFeePerLearner
  };
};

interface ExaminationJobFormProps {
  isModal?: boolean;
  onClose?: () => void;
  initialData?: any;
}

const ExaminationJobForm: React.FC<ExaminationJobFormProps> = ({ isModal: propIsModal, onClose: propOnClose, initialData: propInitialData }) => {
  const params = useParams();
  const navigate = useNavigate();
  const isModal = propIsModal || false;
  const id = params.id || propInitialData?.id;
  const { companyConfig } = useAuth();
  const { inventory } = useInventory();
  const examinationContext = useExamination();
  const { 
    jobs, schools, customers, marketAdjustments, loading, jobLoading,
    createJob, updateJob, recalculateJob, approveJob, deleteJob,
    getJobWithSubjects
  } = examinationContext;

  const [isEditing, setIsEditing] = useState(false);
  const [showOverrideDialog, setShowOverrideDialog] = useState(false);
  const defaultEngineMethod = ((companyConfig?.pricingSettings?.defaultMethod || 'ALWAYS_UP_50') as PricingRoundingMethod);
  const defaultEngineCustomStep = Number(companyConfig?.pricingSettings?.customStep || 50);
  const defaultRoundingFromEngine = getExamRoundingFromEngineMethod(defaultEngineMethod, defaultEngineCustomStep);

  // Form state
  const [formData, setFormData] = useState({
    exam_name: '',
    school_id: '',
    sub_account_name: '',
    class_name: '',
    number_of_learners: 0,
    bom_id: '',
    adjustment_id: '',
    adjustment_type: 'fixed' as 'fixed' | 'percentage',
    adjustment_value: 0,
    rounding_method: defaultEngineMethod,
    rounding_rule_type: defaultRoundingFromEngine.roundingRuleType as 'none' | 'nearest_10' | 'nearest_50' | 'nearest_100' | 'custom',
    rounding_value: defaultRoundingFromEngine.roundingValue,
    override_enabled: false,
    manual_price_per_learner: 0,
    override_reason: '',
    pricing_locked: false,
    subjects: [] as Array<{
      id?: string;
      subject_name: string;
      pages_per_paper: number;
      extra_copies: number;
    }>
  });

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSaving, setIsSaving] = useState(false);
  
  // Settings panel state
  const [showSettings, setShowSettings] = useState(false);
  const [pricingConfig, setPricingConfig] = useState({
    paperId: '',
    tonerId: '',
    paperName: '',
    tonerName: '',
    marketAdjustment: 0,
    marketAdjustmentId: '',
    finishingOptions: []
  });

  const paperMaterials = useMemo(() => {
    const base = (inventory || []).filter(
      (i: any) =>
        i.type === 'Raw Material' &&
        (String(i.category || '').toLowerCase() === 'paper' || i.name?.toLowerCase().includes('paper'))
    );
    const selected = (inventory || []).find((i: any) => String(i.id) === String(pricingConfig.paperId));
    if (selected && !base.some((item: any) => String(item.id) === String(selected.id))) {
      return [selected, ...base];
    }
    return base;
  }, [inventory, pricingConfig.paperId]);

  const tonerMaterials = useMemo(() => {
    const base = (inventory || []).filter(
      (i: any) =>
        i.type === 'Raw Material' &&
        (String(i.category || '').toLowerCase() === 'toner' || i.name?.toLowerCase().includes('toner'))
    );
    const selected = (inventory || []).find((i: any) => String(i.id) === String(pricingConfig.tonerId));
    if (selected && !base.some((item: any) => String(item.id) === String(selected.id))) {
      return [selected, ...base];
    }
    return base;
  }, [inventory, pricingConfig.tonerId]);

  const autoPaper = useMemo(() => {
    return (inventory || []).find(
      (i: any) =>
        i.type === 'Raw Material' &&
        (i.name?.toLowerCase().includes('paper') || String(i.category || '').toLowerCase() === 'paper')
    );
  }, [inventory]);

  const autoToner = useMemo(() => {
    return (inventory || []).find(
      (i: any) =>
        i.type === 'Raw Material' &&
        (i.name?.toLowerCase().includes('toner') || String(i.category || '').toLowerCase() === 'toner')
    );
  }, [inventory]);

  const [globalMargin, setGlobalMargin] = useState<any>(null);

  useEffect(() => {
    import('../../utils/getEffectiveMargin').then(({ getEffectiveMargin }) => {
      getEffectiveMargin(null, null, false).then(setGlobalMargin);
    });
  }, []);

  useEffect(() => {
    if (!inventory || inventory.length === 0) return;
    setPricingConfig(prev => {
      const nextPaperId = prev.paperId || autoPaper?.id || '';
      const nextTonerId = prev.tonerId || autoToner?.id || '';
      if (nextPaperId === prev.paperId && nextTonerId === prev.tonerId) {
        return prev;
      }
      return {
        ...prev,
        paperId: nextPaperId,
        tonerId: nextTonerId
      };
    });
  }, [inventory, autoPaper, autoToner]);

  // Automatic calculations for sheets and pages
  const { totalSheets, totalPages } = useMemo(() => {
    if (!formData.subjects || formData.subjects.length === 0 || formData.number_of_learners <= 0) {
      return { totalSheets: 0, totalPages: 0 };
    }
    
    let sheets = 0;
    let pages = 0;
    
    formData.subjects.forEach(subject => {
      if (!subject.subject_name.trim()) return;
      const totalCopies = Math.max(0, Math.floor(Number(formData.number_of_learners) || 0))
        + Math.max(0, Math.floor(Number(subject.extra_copies) || 0));
      const subjectPages = subject.pages_per_paper * totalCopies;
      const subjectSheets = Math.ceil(subjectPages / 2); // duplex printing

      pages += subjectPages;
      sheets += subjectSheets;
    });
    
    return { totalSheets: sheets, totalPages: pages };
  }, [formData.subjects, formData.number_of_learners]);

  // Calculate BOM cost based on selected materials
  const { totalBOMCost, selectedPaper, selectedToner } = useMemo(() => {
    const paper = (inventory || []).find(i => i.id === pricingConfig.paperId);
    const toner = (inventory || []).find(i => i.id === pricingConfig.tonerId);
    
    // Paper: sheets needed (considering 500 sheets per ream)
    const paperCost = paper ? (totalSheets / 500) * paper.cost : 0;
    
    // Toner: 20 pages per gram
    const tonerKg = totalPages / 20000; // 20 pages per gram, 1000 grams per kg
    const tonerCost = toner ? tonerKg * toner.cost : 0;
    
    return {
      totalBOMCost: paperCost + tonerCost,
      selectedPaper: paper,
      selectedToner: toner
    };
  }, [pricingConfig.paperId, pricingConfig.tonerId, totalSheets, totalPages, inventory]);

  // Calculate total adjustments (legacy, kept for reference if needed elsewhere)
  const totalAdjustments = useMemo(() => {
    if (!pricingConfig.marketAdjustmentId || !pricingConfig.marketAdjustment) return 0;
    return pricingConfig.marketAdjustment;
  }, [pricingConfig.marketAdjustmentId, pricingConfig.marketAdjustment]);

  // Manual fee override state
  const [feeOverrideEnabled, setFeeOverrideEnabled] = useState(false);
  const [manualFeePerLearner, setManualFeePerLearner] = useState(0);
  


  // adjustmentOptions must be defined BEFORE adjustmentInfo
  const adjustmentOptions = useMemo(() => {
    return marketAdjustments
      .filter(isMarketAdjustmentActive)
      .sort((a, b) => {
      const sortA = Number(a.sortOrder || 0);
      const sortB = Number(b.sortOrder || 0);
      if (sortA !== sortB) return sortA - sortB;
      return String(a.displayName || a.name || '').localeCompare(String(b.displayName || b.name || ''));
    });
  }, [marketAdjustments]);

  // Combined customer/school options for dropdown
  const customerOptions = useMemo(() => {
    const unique = new Map<string, { id: string; name: string; isCustomer: boolean }>();

    // First add customers
    customers.forEach(customer => {
      if (!customer?.id) return;
      unique.set(customer.id, {
        id: customer.id,
        name: customer.name || customer.id,
        isCustomer: true
      });
    });

    // Then add schools that aren't already added as customers
    schools.forEach((school) => {
      if (!school?.id) return;
      if (!unique.has(school.id)) {
        unique.set(school.id, {
          id: school.id,
          name: school.name || school.id,
          isCustomer: false
        });
      }
    });

    return Array.from(unique.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [customers, schools]);

  // Get the current rounding method display info
  const currentRoundingMethodInfo = useMemo(() => {
    const method = formData.rounding_method || defaultEngineMethod;
    const option = ROUNDING_METHOD_OPTIONS.find(o => o.value === method);
    return {
      label: option?.label || method,
      method: method,
      step: formData.rounding_value || defaultRoundingFromEngine.roundingValue
    };
  }, [formData.rounding_method, formData.rounding_value, defaultEngineMethod, defaultRoundingFromEngine]);

  // Calculate combined adjustment info for all active adjustments (uses adjustmentOptions defined above)
  const adjustmentInfo = useMemo(() => {
    if (adjustmentOptions.length === 0) {
      return { hasAdjustments: false, display: 'No active adjustments', total: 0 };
    }
    
    const totalPercentage = adjustmentOptions
      .filter(adj => adj.type === 'PERCENTAGE' || adj.type === 'PERCENT' || adj.type === 'percentage')
      .reduce((sum, adj) => sum + (adj.percentage ?? adj.value ?? 0), 0);
    
    const totalFixed = adjustmentOptions
      .filter(adj => adj.type === 'FIXED' || adj.type === 'fixed')
      .reduce((sum, adj) => sum + (adj.value ?? 0), 0);
    
    const names = adjustmentOptions.map(adj => adj.displayName || adj.name).join(', ');
    
    return {
      hasAdjustments: true,
      display: names,
      totalPercentage,
      totalFixed,
      count: adjustmentOptions.length,
      adjustments: adjustmentOptions
    };
  }, [adjustmentOptions]);

  // Calculate total cost and fee per learner using the new formula
  const { totalCost, feePerLearner } = useMemo(() => {
    const bom = totalBOMCost;
    const adjustmentRate = (adjustmentInfo.totalPercentage || 0) / 100;
    const profitMargin = globalMargin ? (globalMargin.margin_value / 100) : 0;
    const learners = formData.number_of_learners;

    const result = calculateExaminationPricing(bom, adjustmentRate, profitMargin, learners);

    return {
      totalCost: result.Total,
      feePerLearner: result.FeePerLearner
    };
  }, [totalBOMCost, adjustmentInfo.totalPercentage, globalMargin, formData.number_of_learners]);

  // Final fee per learner (auto or manual)
  const finalFeePerLearner = feeOverrideEnabled ? manualFeePerLearner : feePerLearner;
  const finalTotalAmount = finalFeePerLearner * formData.number_of_learners;

  const selectedCustomer = useMemo(() => {
    return customers.find(customer => customer.id === formData.school_id) || null;
  }, [customers, formData.school_id]);

  const selectedCustomerSubAccounts = useMemo(() => {
    return selectedCustomer?.subAccounts || [];
  }, [selectedCustomer]);

  // Load existing job if editing
  useEffect(() => {
    if (id) {
      setIsEditing(true);
      loadJob(id);
    }
  }, [id]);

  useEffect(() => {
    if (isEditing) return;
    if (formData.adjustment_id) return;

    const preferred = adjustmentOptions.find(isMarketAdjustmentActive);
    if (preferred?.id) {
      setFormData(prev => ({ ...prev, adjustment_id: preferred.id }));
    }
  }, [isEditing, adjustmentOptions, formData.adjustment_id]);

  useEffect(() => {
    if (isEditing) return;
    const mapped = getExamRoundingFromEngineMethod(defaultEngineMethod, defaultEngineCustomStep);

    setFormData(prev => {
      if (prev.rounding_method === defaultEngineMethod && prev.rounding_rule_type === mapped.roundingRuleType) {
        return prev;
      }
      return {
        ...prev,
        rounding_method: defaultEngineMethod,
        rounding_rule_type: mapped.roundingRuleType,
        rounding_value: mapped.roundingValue
      };
    });
  }, [isEditing, defaultEngineMethod, defaultEngineCustomStep]);

  useEffect(() => {
    if (!formData.school_id) {
      if (formData.sub_account_name) {
        setFormData(prev => ({ ...prev, sub_account_name: '' }));
      }
      return;
    }

    if (selectedCustomerSubAccounts.length === 0) return;
    const hasSelectedSubAccount = selectedCustomerSubAccounts.some(sub => sub.name === formData.sub_account_name);
    if (!hasSelectedSubAccount) {
      setFormData(prev => ({
        ...prev,
        sub_account_name: selectedCustomerSubAccounts[0]?.name || ''
      }));
    }
  }, [formData.school_id, formData.sub_account_name, selectedCustomerSubAccounts]);

  const loadJob = async (jobId: string) => {
    try {
      const result = await getJobWithSubjects(jobId);
      const job = result.job;
      const subjects = result.subjects;
      const persistedRuleType = job.rounding_rule_type || 'none';
      const resolvedRoundingMethod = (
        persistedRuleType === 'none'
          ? (job.rounding_method || defaultEngineMethod)
          : (job.rounding_method || getEngineMethodFromExamRounding(job.rounding_rule_type, job.rounding_value))
      ) as PricingRoundingMethod;
      const resolvedRounding = persistedRuleType === 'none'
        ? { roundingRuleType: 'none' as const, roundingValue: 0 }
        : getExamRoundingFromEngineMethod(resolvedRoundingMethod, job.rounding_value);

      setFormData({
        exam_name: job.exam_name,
        school_id: job.school_id,
        sub_account_name: job.sub_account_name || '',
        class_name: job.class_name,
        number_of_learners: job.number_of_learners,
        bom_id: job.bom_id,
        adjustment_id: job.adjustment_id || '',
        adjustment_type: job.adjustment_type,
        adjustment_value: job.adjustment_value,
        rounding_method: resolvedRoundingMethod,
        rounding_rule_type: resolvedRounding.roundingRuleType,
        rounding_value: resolvedRounding.roundingValue,
        override_enabled: job.override_enabled,
        manual_price_per_learner: job.manual_price_per_learner || 0,
        override_reason: job.override_reason || '',
        subjects: subjects.map(s => ({
          id: s.id,
          subject_name: s.subject_name,
          pages_per_paper: s.pages_per_paper,
          extra_copies: s.extra_copies
        }))
      });
    } catch (error) {
      console.error('Error loading job:', error);
      toast.error('Failed to load examination job');
      navigate('/examination');
    }
  };

  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!formData.exam_name.trim()) newErrors.exam_name = 'Exam name is required';
    if (!formData.school_id) newErrors.school_id = 'School is required';
    if (selectedCustomerSubAccounts.length > 0 && !formData.sub_account_name) {
      newErrors.sub_account_name = 'Sub-account is required for this customer';
    }
    if (!formData.class_name.trim()) newErrors.class_name = 'Class name is required';
    if (formData.number_of_learners <= 0) newErrors.number_of_learners = 'Number of learners must be greater than 0';
    if (adjustmentOptions.length === 0) {
      newErrors.adjustment_id = 'No active market adjustments found. Configure one in Market Adjustments.';
    } else if (!formData.adjustment_id) {
      newErrors.adjustment_id = 'Adjustment is required';
    }
    if (!formData.rounding_method) newErrors.rounding_method = 'Rounding rule is required';
    if (formData.subjects.length === 0) newErrors.subjects = 'At least one subject is required';

    // Validate subjects
    formData.subjects.forEach((subject, index) => {
      if (!subject.subject_name.trim()) newErrors[`subject_${index}_name`] = 'Subject name is required';
      if (subject.pages_per_paper <= 0) newErrors[`subject_${index}_pages`] = 'Pages must be greater than 0';
    });

    // Validate rounding
    if (formData.rounding_rule_type === 'custom' && formData.rounding_value <= 0) {
      newErrors.rounding_value = 'Custom rounding value must be greater than 0';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleInputChange = (field: string, value: any) => {
    setFormData(prev => {
      const next = { ...prev, [field]: value } as typeof prev;

      if (field === 'school_id') {
        next.sub_account_name = '';
      }

      if (field === 'adjustment_id') {
        const selectedAdjustment = adjustmentOptions.find(adjustment => adjustment.id === value);
        if (selectedAdjustment) {
          const isPercentage =
            selectedAdjustment.type === 'PERCENTAGE' ||
            selectedAdjustment.type === 'PERCENT' ||
            selectedAdjustment.type === 'percentage';
          next.adjustment_type = isPercentage ? 'percentage' : 'fixed';
          next.adjustment_value = Number(selectedAdjustment.percentage ?? selectedAdjustment.value ?? 0);
        }
      }

      if (field === 'rounding_method') {
        const mapped = getExamRoundingFromEngineMethod(
          value as PricingRoundingMethod,
          Number(companyConfig?.pricingSettings?.customStep || 50)
        );
        next.rounding_method = value as PricingRoundingMethod;
        next.rounding_rule_type = mapped.roundingRuleType;
        next.rounding_value = mapped.roundingValue;
      }

      return next;
    });
    
    // Clear error when user starts typing
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: '' }));
    }
  };

  const handleSubjectChange = (index: number, field: string, value: any) => {
    setFormData(prev => ({
      ...prev,
      subjects: prev.subjects.map((subject, i) => 
        i === index ? { ...subject, [field]: value } : subject
      )
    }));
    
    // Clear error when user starts typing
    const errorKey = `subject_${index}_${field}`;
    if (errors[errorKey]) {
      setErrors(prev => ({ ...prev, [errorKey]: '' }));
    }
  };

  const addSubject = () => {
    setFormData(prev => ({
      ...prev,
      subjects: [...prev.subjects, {
        subject_name: '',
        pages_per_paper: 0,
        extra_copies: 0
      }]
    }));
  };

  const removeSubject = (index: number) => {
    setFormData(prev => ({
      ...prev,
      subjects: prev.subjects.filter((_, i) => i !== index)
    }));
  };

  const handleSave = async () => {
    if (!validateForm()) {
      toast.error('Please fix the errors below');
      return;
    }

    setIsSaving(true);
    try {
      const payload = {
        ...formData,
        sub_account_name: formData.sub_account_name || undefined,
        number_of_learners: Number(formData.number_of_learners),
        adjustment_id: String(formData.adjustment_id || '').trim(),
        adjustment_value: Number(formData.adjustment_value),
        rounding_method: formData.rounding_method as PricingRoundingMethod,
        rounding_value: Number(formData.rounding_value),
        manual_price_per_learner: Number(formData.manual_price_per_learner),
      };

      if (isEditing && id) {
        await updateJob(id, payload);
        toast.success('Examination job updated successfully');
      } else {
        await createJob(payload);
        toast.success('Examination job created successfully');
        navigate('/examination');
      }
    } catch (error) {
      console.error('Error saving job:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to save examination job');
    } finally {
      setIsSaving(false);
    }
  };

  const handleRecalculate = async () => {
    if (!isEditing || !id) return;

    try {
      await recalculateJob(id);
      toast.success('Job recalculated successfully');
    } catch (error) {
      console.error('Error recalculating job:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to recalculate job');
    }
  };

  const handleApprove = async () => {
    if (!isEditing || !id) return;

    try {
      await approveJob(id);
      toast.success('Job approved successfully');
      // Reload the job to get updated status
      await loadJob(id);
    } catch (error) {
      console.error('Error approving job:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to approve job');
    }
  };

  const handleDelete = async () => {
    if (!isEditing || !id) return;

    if (!confirm('Are you sure you want to delete this examination job? This action cannot be undone.')) {
      return;
    }

    try {
      await deleteJob(id);
      toast.success('Examination job deleted successfully');
      navigate('/examination');
    } catch (error) {
      console.error('Error deleting job:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to delete examination job');
    }
  };

  const handleOverridePrice = () => {
    setShowOverrideDialog(true);
  };

  const handleOverrideSubmit = async (manualPrice: number, reason: string) => {
    if (!isEditing || !id) return;

    try {
      await updateJob(id, {
        override_enabled: true,
        manual_price_per_learner: manualPrice,
        override_reason: reason
      });
      setShowOverrideDialog(false);
      toast.success('Manual price override applied');
      // Reload to get updated pricing
      await loadJob(id);
    } catch (error) {
      console.error('Error applying override:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to apply manual price override');
    }
  };

  // Get current job for display
  const currentJob = jobs.find(j => j.id === id);

  return (
    <div className="h-full overflow-y-auto">
      <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <Button
            variant="ghost"
            onClick={() => navigate('/examination')}
            className="flex items-center space-x-2"
          >
            <ArrowLeft className="h-4 w-4" />
            <span>Back to Jobs</span>
          </Button>
          <div>
            <h1 className="text-2xl font-bold">
              {isEditing ? 'Edit Examination Job' : 'Create Examination Job'}
            </h1>
            {isEditing && currentJob && (
              <div className="flex items-center space-x-2 mt-1">
                <StatusBadge status={currentJob.status} />
                <span className="text-sm text-gray-600">
                  {currentJob.exam_name} - {currentJob.class_name}
                </span>
              </div>
            )}
          </div>
        </div>
        
        {/* Header Right Side - Actions */}
        <div className="flex items-center space-x-2">
          {/* Settings Button - always visible */}
          <Button
            variant="outline"
            onClick={() => setShowSettings(true)}
            className="flex items-center space-x-2"
          >
            <Settings className="h-4 w-4" />
            <span>Settings</span>
          </Button>
          
          {isEditing && currentJob && (
            <>
              <Button
                variant="outline"
                onClick={handleRecalculate}
                disabled={jobLoading}
                className="flex items-center space-x-2"
              >
                <Calculator className="h-4 w-4" />
                <span>Recalculate</span>
              </Button>
              
              {!currentJob.override_enabled && (
                <Button
                  variant="outline"
                  onClick={handleOverridePrice}
                  className="flex items-center space-x-2"
                >
                  <DollarSign className="h-4 w-4" />
                  <span>Override Price</span>
                </Button>
              )}

              {currentJob.status === 'Draft' && (
                <Button
                  onClick={handleApprove}
                  disabled={jobLoading}
                  className="flex items-center space-x-2 bg-green-600 hover:bg-green-700"
                >
                  <CheckCircle className="h-4 w-4" />
                  <span>Approve</span>
                </Button>
              )}

              {currentJob.status !== 'Invoiced' && (
                <Button
                  variant="destructive"
                  onClick={handleDelete}
                  disabled={jobLoading}
                  className="flex items-center space-x-2"
                >
                  <AlertTriangle className="h-4 w-4" />
                  <span>Delete</span>
                </Button>
              )}
            </>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Form */}
        <div className="lg:col-span-2 space-y-6 max-h-[calc(100vh-200px)] overflow-y-auto examination-scrollbar">
          {/* Basic Information */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center space-x-2">
                <FileText className="h-5 w-5" />
                <span>Basic Information</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Input
                    label="Exam Name"
                    value={formData.exam_name}
                    onChange={(e) => handleInputChange('exam_name', e.target.value)}
                    error={errors.exam_name}
                    placeholder="e.g., Mid-Term Exams"
                  />
                </div>
                <div>
                  <Select
                    label="School / Customer"
                    value={formData.school_id}
                    onChange={(e) => handleInputChange('school_id', e.target.value)}
                    error={errors.school_id}
                    disabled={loading}
                  >
                    <option value="">
                      {loading ? 'Loading customers...' : customerOptions.length === 0 ? 'No customers available' : 'Select a customer...'}
                    </option>
                    {customerOptions.map((customer) => (
                      <option key={customer.id} value={customer.id}>
                        {customer.name}
                      </option>
                    ))}
                  </Select>
                  {customerOptions.length === 0 && !loading && (
                    <p className="text-xs text-amber-600 mt-1">
                      No customers found. Add customers in the Customers module.
                    </p>
                  )}
                </div>
              </div>

              {formData.school_id && selectedCustomerSubAccounts.length > 0 && (
                <div>
                  <Select
                    label="Sub Account"
                    value={formData.sub_account_name}
                    onChange={(e) => handleInputChange('sub_account_name', e.target.value)}
                    error={errors.sub_account_name}
                  >
                    <option value="">Select a sub-account...</option>
                    {selectedCustomerSubAccounts.map((subAccount) => (
                      <option key={subAccount.id} value={subAccount.name}>
                        {subAccount.name}
                      </option>
                    ))}
                  </Select>
                </div>
              )}
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Input
                    label="Class Name"
                    value={formData.class_name}
                    onChange={(e) => handleInputChange('class_name', e.target.value)}
                    error={errors.class_name}
                    placeholder="e.g., Form 1A"
                  />
                </div>
                <div>
                  <Input
                    label="Number of Learners"
                    type="number"
                    min="1"
                    value={formData.number_of_learners}
                    onChange={(e) => handleInputChange('number_of_learners', parseInt(e.target.value) || 0)}
                    error={errors.number_of_learners}
                  />
                </div>
              </div>

              <div className="rounded-lg border border-blue-200 bg-blue-50 p-3">
                <p className="text-sm font-medium text-blue-900">Pricing Materials</p>
                <p className="text-xs text-blue-700 mt-1">
                  Paper and toner defaults are configured globally in batch-level Pricing Settings.
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Pricing Configuration */}
          <Card>
            <CardHeader className="flex flex-col sm:flex-row sm:items-center sm:justify-between">
              <CardTitle className="flex items-center space-x-2">
                <Calculator className="h-5 w-5" />
                <span>Pricing Configuration</span>
              </CardTitle>
              {isEditing && (
                <div className="flex items-center space-x-2">
                  <Button
                    variant={formData.pricing_locked ? "outline" : "default"}
                    onClick={() => setFormData(prev => ({ ...prev, pricing_locked: !prev.pricing_locked }))}
                    className="flex items-center space-x-2"
                  >
                    {formData.pricing_locked ? (
                      <>
                        <Unlock className="h-4 w-4" />
                        <span>Unlock Pricing</span>
                      </>
                    ) : (
                      <>
                        <Lock className="h-4 w-4" />
                        <span>Lock Pricing</span>
                      </>
                    )}
                  </Button>
                  {formData.pricing_locked && (
                    <div className="flex items-center space-x-2 text-xs text-green-600 bg-green-50 border border-green-200 px-2 py-1 rounded">
                      <ShieldCheck className="h-3 w-3" />
                      <span>Pricing locked</span>
                    </div>
                  )}
                </div>
              )}
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Active Market Adjustments - Read Only */}
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
                <div className="flex items-center justify-between mb-2">
                  <label className="text-sm font-medium text-amber-800 flex items-center gap-2">
                    <Lock className="h-4 w-4" />
                    Market Adjustments (System Applied)
                  </label>
                  <span className="text-xs bg-amber-200 text-amber-800 px-2 py-0.5 rounded">
                    {adjustmentInfo.count || 0} active
                  </span>
                </div>
                {adjustmentInfo.hasAdjustments ? (
                  <div className="space-y-2">
                    {adjustmentInfo.adjustments?.map((adj) => (
                      <div key={adj.id} className="flex items-center justify-between text-sm">
                        <span className="text-slate-700">{adj.displayName || adj.name}</span>
                        <span className="font-medium text-slate-900">
                          {adj.type === 'PERCENTAGE' || adj.type === 'PERCENT' || adj.type === 'percentage'
                            ? `${adj.percentage ?? adj.value}%`
                            : `$${adj.value}`}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-sm text-red-600 flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4" />
                    No active market adjustments found. Please configure in Market Adjustments module.
                  </div>
                )}
                <p className="text-xs text-amber-600 mt-2">
                  All active adjustments from Market Adjustments module are automatically applied
                </p>
              </div>

              {/* Rounding Rule - Read Only from Engine Config */}
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <div className="flex items-center justify-between mb-2">
                  <label className="text-sm font-medium text-blue-800 flex items-center gap-2">
                    <Lock className="h-4 w-4" />
                    Rounding Rule (Engine Config)
                  </label>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs text-blue-600">Method</label>
                    <div className="text-sm font-medium text-slate-900">
                      {currentRoundingMethodInfo.label}
                    </div>
                  </div>
                  <div>
                    <label className="text-xs text-blue-600">Step Value</label>
                    <div className="text-sm font-medium text-slate-900">
                      {currentRoundingMethodInfo.step}
                    </div>
                  </div>
                </div>
                <p className="text-xs text-blue-600 mt-2">
                  Rounding is sourced from Engine Configuration and cannot be modified
                </p>
              </div>

              {/* Show applied values */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Input
                    label="Total Adjustment Applied"
                    value={adjustmentInfo.hasAdjustments 
                      ? (adjustmentInfo.totalPercentage > 0 
                          ? `${adjustmentInfo.totalPercentage}%`
                          : `$${adjustmentInfo.totalFixed}`)
                      : 'N/A'}
                    readOnly
                    disabled
                    className="bg-slate-100"
                  />
                </div>
                <div>
                  <Input
                    label="Rounding Method Applied"
                    value={currentRoundingMethodInfo.label}
                    readOnly
                    disabled
                    className="bg-slate-100"
                  />
                </div>
              </div>
              
              {/* Error display for adjustments */}
              {errors.adjustment_id && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-md">
                  <p className="text-red-600 text-sm flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4" />
                    {errors.adjustment_id}
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Subjects Table */}
          <Card>
            <CardHeader className="flex flex-col sm:flex-row sm:items-center sm:justify-between">
              <CardTitle className="flex items-center space-x-2">
                <Users className="h-5 w-5" />
                <span>Subjects</span>
              </CardTitle>
              <Button
                onClick={addSubject}
                className="flex items-center space-x-2"
              >
                <Plus className="h-4 w-4" />
                <span>Add Subject</span>
              </Button>
            </CardHeader>
            <CardContent>
              {errors.subjects && (
                <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-md">
                  <p className="text-red-600 text-sm">{errors.subjects}</p>
                </div>
              )}
              
              <SubjectTable
                subjects={formData.subjects}
                onSubjectChange={handleSubjectChange}
                onRemoveSubject={removeSubject}
                errors={errors}
                learners={formData.number_of_learners}
              />
            </CardContent>
          </Card>
        </div>

        {/* Summary Panel */}
        <div className="lg:col-span-1 max-h-[calc(100vh-200px)] overflow-y-auto examination-scrollbar">
          <PricingSummaryPanel
            job={currentJob}
            subjects={formData.subjects}
            learners={formData.number_of_learners}
            isLoading={loading || jobLoading}
          />
        </div>
      </div>

      {/* Footer Actions */}
      <div className="flex justify-between items-center">
        <div className="flex items-center space-x-2">
          {isEditing && currentJob && (
            <span className="text-sm text-gray-600">
              Last updated: {new Date(currentJob.updated_at || currentJob.created_at).toLocaleString()}
            </span>
          )}
        </div>
        
        <div className="flex items-center space-x-2">
          <Button
            variant="outline"
            onClick={() => navigate('/examination')}
          >
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            disabled={isSaving || loading}
            className="flex items-center space-x-2"
          >
            {isSaving ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>Saving...</span>
              </>
            ) : (
              <>
                <Save className="h-4 w-4" />
                <span>{isEditing ? 'Update Job' : 'Create Job'}</span>
              </>
            )}
          </Button>
        </div>
      </div>

      {/* Settings Dialog - Advanced Pricing Configuration */}
      <Dialog open={showSettings} onOpenChange={setShowSettings}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Settings className="h-5 w-5" />
              Pricing Settings
            </DialogTitle>
          </DialogHeader>
          
          <div className="space-y-6 py-4">
            {/* Hidden BOM Section - Automatic Cost Calculation */}
            <div className="bg-slate-50 p-4 rounded-lg border border-slate-200">
              <h4 className="text-sm font-medium text-slate-700 mb-3">
                Hidden BOM (Automatic Cost Calculation)
              </h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">
                    Paper Material
                  </label>
                  <select
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
                    value={pricingConfig.paperId}
                    onChange={(e) => setPricingConfig(prev => ({ ...prev, paperId: e.target.value }))}
                  >
                    <option value="">Select Paper...</option>
                    {paperMaterials.map((m: any) => (
                      <option key={m.id} value={m.id}>
                        {m.name} (${m.cost}/unit)
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1">
                    Toner Material
                  </label>
                  <select
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm"
                    value={pricingConfig.tonerId}
                    onChange={(e) => setPricingConfig(prev => ({ ...prev, tonerId: e.target.value }))}
                  >
                    <option value="">Select Toner...</option>
                    {tonerMaterials.map((m: any) => (
                      <option key={m.id} value={m.id}>
                        {m.name} (${m.cost}/unit)
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            {/* Active Market Adjustments Section */}
            <div className="bg-indigo-50 p-4 rounded-lg border border-indigo-200">
              <h4 className="text-sm font-bold text-indigo-900 mb-2">
                Active Market Adjustments
              </h4>
              <p className="text-xs text-indigo-600 mb-3">
                Automated system-wide pricing adjustments
              </p>
              
              <div className="flex flex-wrap gap-2 mb-4">
                {marketAdjustments.filter(isMarketAdjustmentActive).map(rule => (
                  <div 
                    key={rule.id} 
                    className={`px-3 py-1.5 border rounded-lg text-xs font-medium flex items-center gap-2 cursor-pointer ${
                      pricingConfig.marketAdjustmentId === rule.id 
                        ? 'bg-indigo-200 border-indigo-400 text-indigo-900' 
                        : 'bg-indigo-100 border-indigo-200 text-indigo-900'
                    }`}
                    onClick={() => setPricingConfig(prev => ({ 
                      ...prev, 
                      marketAdjustmentId: rule.id,
                      marketAdjustment: rule.type === 'PERCENTAGE' || rule.type === 'PERCENT' 
                        ? Number(rule.percentage ?? rule.value) 
                        : Number(rule.value)
                    }))}
                  >
                    {rule.name}
                    <span className="bg-white px-1.5 py-0.5 rounded text-[10px]">
                      {rule.type === 'PERCENTAGE' || rule.type === 'PERCENT' || rule.type === 'percentage'
                        ? `+${rule.value}%`
                        : `+${rule.value}`}
                    </span>
                  </div>
                ))}
                {marketAdjustments.filter(isMarketAdjustmentActive).length === 0 && (
                  <span className="text-slate-500 italic text-sm">No active market adjustments found</span>
                )}
              </div>
              
              <div className="flex items-center justify-between border-t border-indigo-100 pt-4">
                <span className="text-sm font-medium text-indigo-900">Total Adjustment Value</span>
                <div className="relative w-32">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-indigo-500">$</span>
                  <input
                    type="number"
                    step="0.01"
                    value={pricingConfig.marketAdjustment?.toFixed(2) || 0}
                    readOnly
                    className="w-full pl-8 pr-4 py-2 border border-indigo-200 rounded-lg text-indigo-900 bg-indigo-50 font-bold"
                  />
                </div>
              </div>
            </div>

            {/* Cost Summary */}
            <div className="mt-4 p-4 bg-slate-800 rounded-lg text-white">
              <h4 className="text-sm font-semibold mb-3">Cost Summary</h4>
              <div className="grid grid-cols-3 gap-4 text-center">
                <div>
                  <div className="text-xs text-slate-400">Total Sheets</div>
                  <div className="text-lg font-bold">{totalSheets.toLocaleString()}</div>
                </div>
                <div>
                  <div className="text-xs text-slate-400">Total Pages</div>
                  <div className="text-lg font-bold">{totalPages.toLocaleString()}</div>
                </div>
                <div>
                  <div className="text-xs text-slate-400">Total BOM Cost</div>
                  <div className="text-lg font-bold">${totalBOMCost.toFixed(2)}</div>
                </div>
              </div>
              <div className="mt-3 pt-3 border-t border-slate-600 grid grid-cols-3 gap-4 text-center">
                <div>
                  <div className="text-xs text-slate-400">Adjustments</div>
                  <div className="text-lg font-bold">${totalAdjustments.toFixed(2)}</div>
                </div>
                <div className="flex items-center justify-center text-slate-500">+</div>
                <div>
                  <div className="text-xs text-slate-400">Total Cost</div>
                  <div className="text-lg font-bold text-green-400">${totalCost.toFixed(2)}</div>
                </div>
              </div>
              <div className="mt-3 pt-3 border-t border-slate-600 grid grid-cols-2 gap-4 text-center">
                <div>
                  <div className="text-xs text-slate-400">Fee Per Learner</div>
                  <div className="text-xl font-bold text-blue-400">${feePerLearner.toFixed(2)}</div>
                </div>
                <div>
                  <div className="text-xs text-slate-400">Total Amount</div>
                  <div className="text-xl font-bold text-green-400">${(feePerLearner * formData.number_of_learners).toFixed(2)}</div>
                </div>
              </div>
              {(() => {
                const revenue = feePerLearner * formData.number_of_learners;
                const profit = revenue - totalCost;
                if (profit > 0) {
                  return (
                    <div className="mt-3 pt-3 border-t border-slate-600 flex justify-between items-center">
                      <div className="text-xs text-emerald-400 font-semibold">Profit Margin</div>
                      <div className="text-lg font-bold text-emerald-400">${profit.toFixed(2)}</div>
                    </div>
                  );
                }
                return null;
              })()}
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowSettings(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Override Dialog */}
      <OverrideDialog
        isOpen={showOverrideDialog}
        onClose={() => setShowOverrideDialog(false)}
        onSubmit={handleOverrideSubmit}
        currentPrice={currentJob?.auto_price_per_learner || 0}
      />
      </div>
    </div>
  );
};

export default ExaminationJobForm;

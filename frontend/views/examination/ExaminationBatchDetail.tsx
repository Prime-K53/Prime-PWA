import React, { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useExamination } from '../../context/ExaminationContext';
import { useFinance } from '../../context/FinanceContext';
import { useAuth } from '../../context/AuthContext';
import { examinationBatchService } from '../../services/examinationBatchService';
import { ExaminationBatch, ExaminationClass, ExaminationSubject } from '../../types';
import { toast } from '../../components/Toast';
import { ConfirmDialog } from '../../components/ConfirmDialog';
import { ArrowLeft, Plus, Trash2, CheckCircle, BookOpen, Users, BookText, FileText, ChevronDown, ChevronUp, Eye, EyeOff, RefreshCw, Repeat, Printer } from 'lucide-react';
import { AddClassDialog } from './components/AddClassDialog';
import { ManageSubjectsDialog } from './components/ManageSubjectsDialog';
import { buildRecurringDraftFromExaminationBatch } from '../../utils/recurringConversion';

const ExaminationBatchDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { calculateBatch, deleteBatch, approveBatch, generateInvoice, createBatch, schools, loadAllData, convertBatchToJobTicket } = useExamination();
  const { fetchFinanceData } = useFinance();
  const { notify, checkPermission } = useAuth();
  const [batch, setBatch] = useState<ExaminationBatch | null>(null);
  const [loading, setLoading] = useState(true);
  const [isApproving, setIsApproving] = useState(false);
  const [isGeneratingInvoice, setIsGeneratingInvoice] = useState(false);

  // Dialog States
  const [isAddClassOpen, setIsAddClassOpen] = useState(false);
  const [isManageSubjectsOpen, setIsManageSubjectsOpen] = useState(false);
  const [selectedClass, setSelectedClass] = useState<ExaminationClass | null>(null);
  const [hiddenClasses, setHiddenClasses] = useState<Set<string>>(new Set());
  const canOverrideExamCost = checkPermission('examination.cost.override');

  // Confirmation Dialog States
  const [confirmDialog, setConfirmDialog] = useState<{
    open: boolean;
    title: string;
    message: string;
    type: 'warning' | 'danger' | 'info' | 'question';
    onConfirm: () => void;
  }>({
    open: false,
    title: '',
    message: '',
    type: 'question',
    onConfirm: () => {}
  });

  // Separate state for class removal confirmation
  const [classRemoveConfirm, setClassRemoveConfirm] = useState<{
    open: boolean;
    classId: string | null;
  }>({ open: false, classId: null });

  // Separate state for job ticket conversion
  const [jobTicketConfirm, setJobTicketConfirm] = useState<{
    open: boolean;
  }>({ open: false });

  const fetchBatch = async () => {
    if (!id) return;
    try {
      const data = await examinationBatchService.getBatch(id);
      setBatch(data);
      // If we have a selected class, update it with fresh data
      if (selectedClass) {
        const updatedClass = data.classes?.find(c => c.id === selectedClass.id);
        if (updatedClass) {
          setSelectedClass(updatedClass);
        }
      }
    } catch (error) {
      console.error('Error fetching batch:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchBatch();
    // Ensure schools are loaded (needed for school name lookup on direct deep-link)
    if (schools.length === 0) {
      loadAllData();
    }
  }, [id]);


  const handleApprove = async () => {
    if (!batch) return;
    setConfirmDialog({
      open: true,
      title: 'Approve Batch',
      message: 'Are you sure you want to approve this batch? This will deduct inventory and lock the batch.',
      type: 'warning',
      onConfirm: async () => {
        setIsApproving(true);
        try {
          const { batch: updatedBatch, warnings } = await approveBatch(batch.id);
          setBatch(updatedBatch);
          if (warnings && warnings.length > 0) {
            warnings.forEach(w => notify(w.message, 'warning'));
            notify('Batch approved with inventory warnings.', 'warning');
          } else {
            notify('Batch approved successfully!', 'success');
          }
        } catch (error) {
          console.error('Error approving batch:', error);
          notify('Failed to approve batch. Please check inventory levels.', 'error');
        } finally {
          setIsApproving(false);
        }
      }
    });
  };

  const handleGenerateInvoice = async () => {
    if (!batch) return;
    setConfirmDialog({
      open: true,
      title: 'Generate Invoice',
      message: 'Generate invoice for this batch?',
      type: 'question',
      onConfirm: async () => {
        setIsGeneratingInvoice(true);
        try {
          const result = await generateInvoice(batch.id);
          await fetchBatch();
          await fetchFinanceData();

          const syncedInvoiceId = result?.sync?.invoiceId || result?.invoice?.id || null;
          const syncFailed = Boolean(result?.invoice) && Boolean(result?.sync) && !result.sync.synced;

          if (syncFailed) {
            notify(
              result.sync?.message || 'Invoice generated in backend, but local Sales Invoice sync failed.',
              'error'
            );
            return;
          }

          notify(
            result?.idempotent
              ? 'Invoice already existed. Opened Sales Invoices.'
              : 'Invoice generated successfully. Opened Sales Invoices.',
            'success'
          );

          if (syncedInvoiceId) {
            navigate('/sales-flow/invoices', {
              state: {
                action: 'view',
                type: 'Invoice',
                id: syncedInvoiceId,
                filterInvoiceId: syncedInvoiceId,
                source: 'examination'
              }
            });
          } else {
            navigate('/sales-flow/invoices');
          }
        } catch (error) {
          console.error('Error generating invoice:', error);
          notify('Failed to generate invoice.', 'error');
        } finally {
          setIsGeneratingInvoice(false);
        }
      }
    });
  };

  const handleCreatePatch = async () => {
    if (!batch) return;
    setConfirmDialog({
      open: true,
      title: 'Create Patch',
      message: 'Create a patch for this batch? This will create a new batch linked to this one.',
      type: 'info',
      onConfirm: async () => {
        try {
          const newBatch = await createBatch({
            school_id: batch.school_id,
            name: `Patch for ${batch.name}`,
            academic_year: batch.academic_year,
            term: batch.term,
            exam_type: batch.exam_type,
            type: 'Patch',
            parent_batch_id: batch.id,
          });
          const batchRef = String(newBatch.batch_number || newBatch.batchNumber || newBatch.id || '').trim();
          navigate(`/examination/batches/${newBatch.id}`, { state: { name: batchRef } });
        } catch (error) {
          console.error('Error creating patch:', error);
          notify('Failed to create patch.', 'error');
        }
      }
    });
  };

  const handleDelete = async () => {
    if (!batch) return;
    setConfirmDialog({
      open: true,
      title: 'Delete Batch',
      message: 'Are you sure you want to delete this batch?',
      type: 'danger',
      onConfirm: async () => {
        try {
          await deleteBatch(batch.id);
          navigate('/examination/batches');
        } catch (error) {
          console.error('Error deleting batch:', error);
          notify('Failed to delete batch.', 'error');
        }
      }
    });
  };

  const handleRecalculate = async () => {
    if (!batch) return;
    setConfirmDialog({
      open: true,
      title: 'Recalculate Batch',
      message: 'Recalculate this batch with current material prices and adjustments?',
      type: 'question',
      onConfirm: async () => {
        try {
          const updatedBatch = await examinationBatchService.recalculateBatch(batch.id);
          setBatch(updatedBatch);
          notify('Batch recalculated successfully!', 'success');
        } catch (error) {
          console.error('Error recalculating batch:', error);
          notify('Failed to recalculate batch.', 'error');
        }
      }
    });
  };

  const handleConvertToJobTicket = async () => {
    if (!batch) return;
    try {
      await convertBatchToJobTicket(batch.id);
      navigate('/sales-flow/job-tickets');
    } catch (err) {
      // Error handled in context
    }
    setJobTicketConfirm({ open: false });
  };

  const handleConvertToRecurring = () => {
    if (!batch) return;
    const recurringDraft = buildRecurringDraftFromExaminationBatch(batch, schoolName);
    navigate('/sales-flow/subscriptions', {
      state: {
        action: 'create',
        recurringDraft
      }
    });
  };

  const handleAddClass = async (data: { class_name: string; number_of_learners: number }) => {
    if (!batch) {
      throw new Error('Batch not loaded');
    }
    try {
      if (!data.class_name || !data.class_name.trim()) {
        throw new Error('Class name is required');
      }
      if (!data.number_of_learners || data.number_of_learners <= 0) {
        throw new Error('Number of learners must be greater than 0');
      }

      const createdClass = await examinationBatchService.addClass(batch.id, {
        ...data,
        currency: batch.currency
      });

      setBatch((prev) => {
        if (!prev) return prev;
        const currentClasses = Array.isArray(prev.classes) ? prev.classes : [];
        const alreadyExists = currentClasses.some((cls) => cls.id === createdClass.id);
        return {
          ...prev,
          classes: alreadyExists
            ? currentClasses
            : [...currentClasses, { ...createdClass, subjects: createdClass.subjects || [] }]
        };
      });

      notify(`Class "${data.class_name}" added successfully`, 'success');

      void fetchBatch().catch((refreshError) => {
        console.warn('Class added, but batch refresh failed:', refreshError);
      });
    } catch (error: any) {
      let errorMessage = 'Failed to add class';
      let debugInfo = '';
      
      if (error instanceof Error) {
        errorMessage = error.message || 'Failed to add class';
        
        // Add detailed debug information for batch not found errors
        if (errorMessage.includes('not found') || errorMessage.includes('create the batch first')) {
          debugInfo = `
            
            ──────────────────────────────
            🔍 Debug Information:
            • Batch ID: ${batch.id}
            • Batch Number: ${batch.batch_number || batch.batchNumber || 'N/A'}
            • Batch Name: ${batch.name}
            • Batch Status: ${batch.status}
            • Is Local ID: ${String(batch.id).startsWith('local-') ? 'Yes' : 'No'}
            
            Possible causes:
            1. Backend server not running
            2. Network/CORS issue
            3. Batch not synced to backend yet
            4. Wrong batch ID in URL (manual navigation?)
          `;
        }
      } else if (typeof error === 'string') {
        errorMessage = error;
      }

      console.error('Error adding class:', error);
      notify(errorMessage, 'error');
      throw new Error(errorMessage);
    }
  };

  const handleManageSubjects = (cls: ExaminationClass) => {
    setSelectedClass(cls);
    setIsManageSubjectsOpen(true);
  };

  const handleAddSubject = async (data: Partial<ExaminationSubject>) => {
    if (!selectedClass || !batch) return;
    try {
      await examinationBatchService.addSubject(selectedClass.id, data);
      // Auto-recalculate to keep values synchronized, but do not fail the mutation if recalc fails.
      try {
        const updatedBatch = await calculateBatch(batch.id);
        setBatch(updatedBatch);

        if (updatedBatch && updatedBatch.classes) {
          const updatedCls = updatedBatch.classes.find(c => c.id === selectedClass.id);
          if (updatedCls) setSelectedClass(updatedCls);
        }
      } catch (recalcError) {
        console.warn('Recalculation failed after adding subject; refreshing batch instead.', recalcError);
        await fetchBatch();
      }
    } catch (error) {
      console.error('Error adding subject:', error);
      throw error; // Re-throw to be handled by the dialog
    }
  };

  const handleUpdateSubject = async (subjectId: string, data: Partial<ExaminationSubject>) => {
    if (!selectedClass || !batch) return;
    try {
      await examinationBatchService.updateSubject(subjectId, data);
      // Auto-recalculate to keep values synchronized, but do not fail the mutation if recalc fails.
      try {
        const updatedBatch = await calculateBatch(batch.id);
        setBatch(updatedBatch);

        if (updatedBatch && updatedBatch.classes) {
          const updatedCls = updatedBatch.classes.find(c => c.id === selectedClass.id);
          if (updatedCls) setSelectedClass(updatedCls);
        }
      } catch (recalcError) {
        console.warn('Recalculation failed after updating subject; refreshing batch instead.', recalcError);
        await fetchBatch();
      }
    } catch (error) {
      console.error('Error updating subject:', error);
      throw error;
    }
  };

  const handleRemoveSubject = async (subjectId: string) => {
    if (!selectedClass || !batch) return;
    try {
      await examinationBatchService.deleteSubject(subjectId);
      // Auto-recalculate to keep values synchronized, but do not fail the mutation if recalc fails.
      try {
        const updatedBatch = await calculateBatch(batch.id);
        setBatch(updatedBatch);

        if (updatedBatch && updatedBatch.classes) {
          const updatedCls = updatedBatch.classes.find(c => c.id === selectedClass.id);
          if (updatedCls) setSelectedClass(updatedCls);
        }
      } catch (recalcError) {
        console.warn('Recalculation failed after removing subject; refreshing batch instead.', recalcError);
        await fetchBatch();
      }
    } catch (error) {
      console.error('Error removing subject:', error);
      throw error;
    }
  };

  // Helper to ensure numeric values are valid finite numbers (not NaN or Infinity)
  const sanitizeNumeric = (value: number | undefined | null): number => {
    if (value === undefined || value === null) return 0;
    if (!Number.isFinite(value)) return 0;
    return value;
  };

  const handleSaveClassPricing = async (
    classId: string,
    totals: {
      material_total_cost: number;
      adjustment_total_cost: number;
      market_adjustment_total?: number;
      rounding_adjustment?: number;
      calculated_total_cost: number;
      expected_fee_per_learner: number;
    }
  ) => {
    if (!batch) return;
    try {
      const classRef = batch.classes?.find(cls => cls.id === classId);
      const learnerCount = Math.max(0, Math.floor(Number(classRef?.number_of_learners) || 0));

      // Sanitize all numeric values to prevent NaN/Infinity from causing 500 errors
      const sanitizedMaterialTotalCost = sanitizeNumeric(totals.material_total_cost);
      const sanitizedAdjustmentTotalCost = sanitizeNumeric(totals.adjustment_total_cost);
      const sanitizedMarketAdjustmentTotal = sanitizeNumeric(totals.market_adjustment_total ?? totals.adjustment_total_cost);
      const sanitizedRoundingAdjustment = sanitizeNumeric(totals.rounding_adjustment ?? 0);
      const sanitizedCalculatedTotalCost = sanitizeNumeric(totals.calculated_total_cost);
      const sanitizedExpectedFeePerLearner = sanitizeNumeric(totals.expected_fee_per_learner);

      const expectedFee = Number(sanitizedExpectedFeePerLearner ?? 0) || 0;
      const hasManualOverride = Boolean(Number(classRef?.is_manual_override || 0))
        && Number(classRef?.manual_cost_per_learner ?? 0) > 0;
      const manualFee = Number(classRef?.manual_cost_per_learner ?? 0);
      const finalFee = hasManualOverride ? manualFee : expectedFee;
      const liveTotalPreview = hasManualOverride
        ? Math.round(finalFee * learnerCount * 100) / 100
        : (sanitizedCalculatedTotalCost ?? Math.round(expectedFee * learnerCount * 100) / 100);

      const updatedClass = await examinationBatchService.updateClassFinancialMetrics(classId, {
        expected_fee_per_learner: expectedFee,
        final_fee_per_learner: finalFee,
        live_total_preview: liveTotalPreview,
        financial_metrics_source: hasManualOverride ? 'MANUAL_OVERRIDE' : 'SYSTEM_CALCULATION',
        material_total_cost: sanitizedMaterialTotalCost,
        adjustment_total_cost: sanitizedAdjustmentTotalCost,
        market_adjustment_total: sanitizedMarketAdjustmentTotal,
        rounding_adjustment: sanitizedRoundingAdjustment,
        calculated_total_cost: sanitizedCalculatedTotalCost
      });

      setBatch(prev => {
        if (!prev?.classes) return prev;
        return {
          ...prev,
          classes: prev.classes.map(cls => (
            cls.id === classId
              ? { ...cls, ...updatedClass, subjects: cls.subjects }
              : cls
          ))
        };
      });

      if (selectedClass?.id === classId) {
        setSelectedClass(prev => prev ? { ...prev, ...updatedClass, subjects: prev.subjects } : prev);
      }
    } catch (error) {
      console.error('Error saving class pricing:', error);
      throw error;
    }
  };

  const handleRemoveClass = async (classId: string) => {
    setClassRemoveConfirm({ open: true, classId });
  };

  const confirmHandleRemoveClass = async () => {
    if (!classRemoveConfirm.classId) return;
    try {
      await examinationBatchService.deleteClass(classRemoveConfirm.classId);
      await fetchBatch();
      notify('Class removed successfully.', 'success');
    } catch (error) {
      console.error('Error removing class:', error);
      notify('Failed to remove class.', 'error');
    } finally {
      setClassRemoveConfirm({ open: false, classId: null });
    }
  };

  const toggleClassVisibility = (classId: string) => {
    setHiddenClasses(prev => {
      const next = new Set(prev);
      if (next.has(classId)) next.delete(classId);
      else next.add(classId);
      return next;
    });
  };

  const handleApplyClassOverridePricing = async (classId: string, manualPrice: number, reason: string) => {
    try {
      const updatedBatch = await examinationBatchService.updateClassPricing(classId, {
        cost_per_learner: manualPrice,
        is_manual_override: true,
        override_reason: reason
      }, canOverrideExamCost);
      if (updatedBatch) {
        setBatch(updatedBatch);
        if (selectedClass) {
          const refreshedClass = updatedBatch.classes?.find(cls => cls.id === selectedClass.id);
          if (refreshedClass) {
            setSelectedClass(refreshedClass);
          }
        }
      } else {
        await fetchBatch();
      }
    } catch (error) {
      console.error('Error applying override:', error);
      throw error;
    }
  };

  const handleUpdateClass = async (classId: string, data: Partial<ExaminationClass>) => {
    try {
      await examinationBatchService.updateClass(classId, data);
      await fetchBatch();
      
      // Update selectedClass to keep dialog in sync
      if (selectedClass && selectedClass.id === classId) {
         setSelectedClass(prev => prev ? { ...prev, ...data } : null);
      }
    } catch (error) {
      console.error('Error updating class:', error);
      throw error;
    }
  };

  const isLocked = batch?.status === 'Approved' || batch?.status === 'Invoiced';
  const { customers } = useExamination();
  const schoolName = schools.find((school) => String(school.id) === String(batch?.school_id))?.name 
    || customers.find(c => String(c.id) === String(batch?.school_id))?.name 
    || 'Unknown School';
  const totalSubjects = batch?.classes?.reduce((count, cls) => count + (cls.subjects?.length || 0), 0) || 0;
  const statusBadgeClass =
    batch?.status === 'Invoiced'
      ? 'bg-green-50 text-green-700 border border-green-100'
      : batch?.status === 'Approved'
        ? 'bg-emerald-50 text-emerald-700 border border-emerald-100'
        : batch?.status === 'Calculated'
          ? 'bg-blue-50 text-blue-700 border border-blue-100'
          : 'bg-slate-100 text-slate-700 border border-slate-200';
  const isCalculationStale = useMemo(() => {
    if (!batch?.classes || batch.classes.length === 0) return false;
    const batchCalculatedAtMs = batch.last_calculated_at
      ? new Date(batch.last_calculated_at).getTime()
      : 0;
    if (!Number.isFinite(batchCalculatedAtMs) || batchCalculatedAtMs <= 0) return true;

    return batch.classes.some(cls => {
      const classCalculatedAtMs = cls.cost_last_calculated_at
        ? new Date(cls.cost_last_calculated_at).getTime()
        : batchCalculatedAtMs;
      const freshnessBoundary = Math.max(
        batchCalculatedAtMs,
        Number.isFinite(classCalculatedAtMs) ? classCalculatedAtMs : 0
      );

      const classUpdatedAtMs = cls.updated_at ? new Date(cls.updated_at).getTime() : 0;
      if (Number.isFinite(classUpdatedAtMs) && classUpdatedAtMs > freshnessBoundary) {
        return true;
      }

      return (cls.subjects || []).some(subject => {
        const subjectUpdatedAtMs = subject.updated_at ? new Date(subject.updated_at).getTime() : 0;
        return Number.isFinite(subjectUpdatedAtMs) && subjectUpdatedAtMs > freshnessBoundary;
      });
    });
  }, [batch?.classes, batch?.last_calculated_at]);

  const resolveClassTotalAmount = (cls: ExaminationClass) => {
    const learners = Math.max(0, Math.floor(Number(cls.number_of_learners) || 0));
    const liveTotal = Number(cls.live_total_preview);
    if (Number.isFinite(liveTotal) && liveTotal >= 0) return liveTotal;

    const manualOverride = Boolean(Number(cls.is_manual_override || 0));
    const manualPrice = Number(cls.manual_cost_per_learner ?? 0);
    if (manualOverride && manualPrice > 0 && learners > 0) {
      return Math.round(manualPrice * learners * 100) / 100;
    }

    const finalFee = Number(cls.final_fee_per_learner ?? cls.price_per_learner ?? cls.expected_fee_per_learner ?? 0);
    if (finalFee > 0 && learners > 0) {
      return Math.round(finalFee * learners * 100) / 100;
    }

    return Number(cls.calculated_total_cost ?? cls.total_price ?? cls.total_amount ?? 0) || 0;
  };

  const batchTotals = useMemo(() => {
    if (!batch || !batch.classes) {
      return {
        production: 0,
        adjustment: 0,
        marketAdjustment: 0,
        roundingAdjustment: 0,
        manualOverride: 0,
        total: 0,
        totalPages: 0,
        totalSheets: 0,
        totalCopies: 0,
        totalLearners: 0
      };
    }

    return batch.classes.reduce((acc, cls) => {
      const learners = Math.max(0, Math.floor(Number(cls.number_of_learners) || 0));
      let classTotalCopies = 0;
      let classTotalPages = 0;
      let classTotalSheets = 0;

      (cls.subjects || []).forEach((subject) => {
        const pagesPerPaper = Math.max(0, Math.floor(Number(subject.pages) || 0));
        const extraCopies = Math.max(0, Math.floor(Number(subject.extra_copies) || 0));
        const totalCopies = learners + extraCopies;
        const totalPages = Number(subject.total_pages ?? (pagesPerPaper * totalCopies)) || 0;
        const totalSheets = Number(subject.total_sheets ?? Math.ceil(totalPages / 2)) || 0;

        classTotalCopies += totalCopies;
        classTotalPages += totalPages;
        classTotalSheets += totalSheets;
      });

      return {
        production: acc.production + (Number(cls.material_total_cost) || 0),
        adjustment: acc.adjustment + (Number(cls.adjustment_total_cost) || 0),
        marketAdjustment: acc.marketAdjustment + (Number(cls.market_adjustment_total ?? cls.adjustment_total_cost) || 0),
        roundingAdjustment: acc.roundingAdjustment + (Number(cls.rounding_adjustment) || 0),
        manualOverride: acc.manualOverride + (Number(cls.manual_override_amount) || 0),
        total: acc.total + resolveClassTotalAmount(cls),
        totalPages: acc.totalPages + classTotalPages,
        totalSheets: acc.totalSheets + classTotalSheets,
        totalCopies: acc.totalCopies + classTotalCopies,
        totalLearners: acc.totalLearners + learners
      };
    }, {
      production: 0,
      adjustment: 0,
      marketAdjustment: 0,
      roundingAdjustment: 0,
      manualOverride: 0,
      total: 0,
      totalPages: 0,
      totalSheets: 0,
      totalCopies: 0,
      totalLearners: 0
    });
  }, [batch]);

  const batchAdjustmentTracking = useMemo(() => {
    const snapshots = Array.isArray(batch?.adjustment_snapshots) ? batch.adjustment_snapshots : [];
    if (snapshots.length > 0) {
      const total = snapshots.reduce((sum, snap) => sum + (Number(snap.total_amount) || 0), 0);
      const rounding = snapshots
        .filter(snap => snap.is_rounding)
        .reduce((sum, snap) => sum + (Number(snap.total_amount) || 0), 0);
      return {
        totalAdjustment: total,
        marketAdjustment: total - rounding,
        roundingUplift: rounding,
        adjustmentCount: snapshots.length
      };
    }
    // Fallback to batch-level totals if snapshots not available
    const totalAdjustment = Number(batch?.calculated_adjustment_total ?? batchTotals.adjustment ?? 0) || 0;
    const roundingUplift = Number(batch?.rounding_adjustment_total ?? 0) || 0;
    return {
      totalAdjustment,
      marketAdjustment: Math.max(0, totalAdjustment - roundingUplift),
      roundingUplift,
      adjustmentCount: 0
    };
  }, [batch, batchTotals.adjustment]);

  const batchFinancialKpis = useMemo(() => {
    const materialTotal = Number(batch?.calculated_material_total ?? batchTotals.production ?? 0) || 0;
    const preRoundingTotal = Number(
      batch?.pre_rounding_total_amount ?? Math.max(0, batchTotals.total - batchAdjustmentTracking.roundingUplift)
    ) || 0;
    const classCount = batch?.classes?.length || 0;
    let adjustedSubjects = 0;
    let adjustedClasses = 0;

    (batch?.classes || []).forEach((cls) => {
      const classAdjustment = Number(cls.adjustment_total_cost ?? 0) || 0;
      if (classAdjustment > 0) adjustedClasses += 1;

      (cls.subjects || []).forEach((subject: any) => {
        const subjectAdjustment = Number(
          subject.allocated_adjustment_cost
          ?? subject.allocated_market_adjustment_cost
          ?? 0
        ) || 0;
        if (subjectAdjustment > 0) adjustedSubjects += 1;
      });
    });

    return {
      materialTotal,
      preRoundingTotal,
      adjustedClasses,
      adjustedSubjects,
      averageAdjustmentPerClass: classCount > 0 ? batchAdjustmentTracking.totalAdjustment / classCount : 0,
      averageAdjustmentPerSubject: totalSubjects > 0 ? batchAdjustmentTracking.totalAdjustment / totalSubjects : 0
    };
  }, [batch, batchAdjustmentTracking, batchTotals.production, batchTotals.total, totalSubjects]);


  const softButtonClass =
    'inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-medium border shadow-sm transition-all disabled:opacity-60 disabled:cursor-not-allowed';
  const primaryButtonClass =
    'inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-medium text-white shadow-sm transition-all disabled:opacity-60 disabled:cursor-not-allowed';

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center p-6">
        <div className="bg-white/70 backdrop-blur-xl rounded-2xl border border-white/60 shadow-sm px-8 py-6 text-sm text-slate-600">
          Loading batch details...
        </div>
      </div>
    );
  }

  if (!batch) {
    return (
      <div className="h-full flex items-center justify-center p-6">
        <div className="bg-red-50 rounded-2xl border border-red-100 px-8 py-6 text-sm text-red-700">Batch not found</div>
      </div>
    );
  }

  const batchReference = String(batch.batch_number || batch.batchNumber || batch.id || '').trim();

  return (
    <div className="h-full flex flex-col p-4 md:p-6 max-w-[1600px] mx-auto w-full font-normal overflow-y-auto custom-scrollbar">
      <div className="flex flex-col xl:flex-row xl:items-start justify-between gap-4 mb-4">
        <div className="min-w-0">
          <button
            type="button"
            onClick={() => navigate('/examination/batches')}
            className={`${softButtonClass} mb-3 bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100`}
          >
            <ArrowLeft size={14} />
            Back to Batches
          </button>
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-[22px] font-semibold text-slate-900 tracking-tight">{batch.name}</h1>
            {batchReference && (
              <span className="inline-flex items-center rounded-lg px-2.5 py-1 text-[11px] font-mono bg-slate-100 text-slate-600 border border-slate-200">
                {batchReference}
              </span>
            )}
            {batch.type === 'Patch' && (
              <span className="inline-flex items-center rounded-lg px-2.5 py-1 text-[11px] font-semibold bg-orange-50 text-orange-700 border border-orange-100">
                Patch
              </span>
            )}
            <span
              className={`inline-flex items-center rounded-lg px-2.5 py-1 text-[11px] font-semibold ${statusBadgeClass}`}
            >
              {batch.status}
            </span>
            {isCalculationStale && !isLocked && (
              <span className="inline-flex items-center rounded-lg px-2.5 py-1 text-[11px] font-semibold bg-yellow-50 text-yellow-700 border border-yellow-100">
                Calculation Stale - Recalculate Needed
              </span>
            )}
          </div>
          <p className="text-xs text-slate-500 mt-1">
            {schoolName}
            {batch.sub_account_name && <span className="text-slate-400 ml-1">({batch.sub_account_name})</span>} |{' '}
            {batch.academic_year} Term {batch.term}
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          {!isLocked && (
            <button
              type="button"
              onClick={handleDelete}
              className={`${softButtonClass} bg-red-50 text-red-700 border-red-100 hover:bg-red-100`}
            >
              <Trash2 size={14} />
              Delete
            </button>
          )}

          {!isLocked && isCalculationStale && (
            <button
              type="button"
              onClick={handleRecalculate}
              className={`${softButtonClass} bg-yellow-50 text-yellow-700 border-yellow-100 hover:bg-yellow-100`}
            >
              <RefreshCw size={14} />
              Recalculate
            </button>
          )}

          {(batch.status === 'Approved' || batch.status === 'Invoiced') && (
            <button
              type="button"
              onClick={handleCreatePatch}
              className={`${softButtonClass} bg-orange-50 text-orange-700 border-orange-100 hover:bg-orange-100`}
            >
              <Plus size={14} />
              Create Patch
            </button>
          )}

          <button
            type="button"
            onClick={handleConvertToRecurring}
            className={`${softButtonClass} bg-indigo-50 text-indigo-700 border-indigo-100 hover:bg-indigo-100`}
          >
            <Repeat size={14} />
            Convert to Recurring
          </button>

          {!isLocked && batch.status !== 'Approved' && (
            <button
              type="button"
              onClick={handleApprove}
              disabled={isApproving}
              className={`${primaryButtonClass} bg-emerald-600 hover:bg-emerald-700`}
            >
              <CheckCircle size={14} />
              {isApproving ? 'Approving...' : 'Approve'}
            </button>
          )}

          {batch.status === 'Approved' && (
            <button
              type="button"
              onClick={handleGenerateInvoice}
              disabled={isGeneratingInvoice}
              className={`${primaryButtonClass} bg-purple-600 hover:bg-purple-700`}
            >
              <CheckCircle size={14} />
              {isGeneratingInvoice ? 'Generating...' : 'Generate Invoice'}
            </button>
          )}

          {(batch.status === 'Approved' || batch.status === 'Invoiced') && (
            <button
              type="button"
              onClick={() => setJobTicketConfirm({ open: true })}
              className={`${primaryButtonClass} bg-rose-600 hover:bg-rose-700`}
            >
              <Printer size={14} />
              Convert to Job Ticket
            </button>
          )}

          <button
            type="button"
            onClick={() => setIsAddClassOpen(true)}
            disabled={isLocked}
            className={`${primaryButtonClass} bg-blue-600 hover:bg-blue-700`}
          >
            <Plus size={14} />
            Add Class
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-4 mb-6">
        <div className="bg-white/70 backdrop-blur-xl p-4 rounded-2xl border border-white/60 shadow-sm">
          <div className="text-[10px] font-bold text-slate-400 uppercase tracking-tight mb-1">Total Amount</div>
          <div className="text-xl font-bold text-slate-900 finance-nums">
            {batch.currency || 'MWK'} {batchTotals.total.toLocaleString(undefined, { maximumFractionDigits: 2 })}
          </div>
          <div className="mt-2 space-y-1">
            <div className="flex justify-between text-[10px]">
              <span className="text-slate-400">Production:</span>
              <span className="text-slate-600 font-medium">{batch.currency || 'MWK'} {batchTotals.production.toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
            </div>
            <div className="flex justify-between text-[10px]">
              <span className="text-slate-400">Adjustments:</span>
              <span className="text-emerald-600 font-medium">{batch.currency || 'MWK'} {batchTotals.marketAdjustment.toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
            </div>
            <div className="flex justify-between text-[10px]">
              <span className="text-slate-400">Rounding:</span>
              <span className="text-blue-600 font-medium">{batch.currency || 'MWK'} {batchTotals.roundingAdjustment.toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
            </div>
            {batchTotals.manualOverride !== 0 && (
              <div className="flex justify-between text-[10px]">
                <span className="text-slate-400">Manual Override:</span>
                <span className="text-purple-600 font-medium">{batch.currency || 'MWK'} {batchTotals.manualOverride.toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
              </div>
            )}
          </div>
        </div>
        <div className="bg-white/70 backdrop-blur-xl p-4 rounded-2xl border border-white/60 shadow-sm">
          <div className="text-[10px] font-bold text-slate-400 uppercase tracking-tight mb-1">Academic Info</div>
          <div className="text-xl font-bold text-slate-900">{batch.exam_type}</div>
          <div className="text-[9px] text-slate-400 mt-1">
            {batch.academic_year} | Term {batch.term}
          </div>
        </div>
        <div className="bg-white/70 backdrop-blur-xl p-4 rounded-2xl border border-white/60 shadow-sm">
          <div className="text-[10px] font-bold text-slate-400 uppercase tracking-tight mb-1">Structure</div>
          <div className="text-xl font-bold text-slate-900 finance-nums">{batch.classes?.length || 0} Classes</div>
          <div className="text-[9px] text-slate-400 mt-1">Total Subjects: {totalSubjects}</div>
        </div>
      </div>

      <div className="bg-white/70 backdrop-blur-xl rounded-2xl border border-white/60 shadow-sm p-4 md:p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold text-slate-900 flex items-center gap-2">
            <BookOpen size={16} className="text-blue-600" />
            Classes and Subjects
          </h2>
        </div>

        {!batch.classes || batch.classes.length === 0 ? (
          <div className="text-center py-12 bg-slate-50/80 rounded-2xl border-2 border-dashed border-slate-200">
            <BookOpen className="h-10 w-10 mx-auto text-slate-300 mb-3" />
            <h3 className="text-base font-semibold text-slate-800">No classes added yet</h3>
            <p className="text-sm text-slate-500 mb-4">Add a class to start adding subjects and calculating costs.</p>
            <button
              type="button"
              onClick={() => setIsAddClassOpen(true)}
              disabled={isLocked}
              className={`${primaryButtonClass} bg-blue-600 hover:bg-blue-700`}
            >
              <Plus size={14} />
              Add First Class
            </button>
          </div>
        ) : (
          <div className="space-y-6">
            {batch.classes.map((cls) => {
              const subjectCount = cls.subjects?.length || 0;
              const learners = Math.max(0, Math.floor(Number(cls.number_of_learners) || 0));
              const expectedFeePerLearner = Number(cls.expected_fee_per_learner ?? cls.suggested_cost_per_learner ?? cls.price_per_learner ?? 0);
              const hasManualOverride = Boolean(Number(cls.is_manual_override || 0)) && Number(cls.manual_cost_per_learner ?? 0) > 0;
              const displayedFeePerLearner = hasManualOverride
                ? Number(cls.manual_cost_per_learner ?? expectedFeePerLearner)
                : Number(cls.final_fee_per_learner ?? expectedFeePerLearner);
              const isHidden = hiddenClasses.has(cls.id);

              return (
                <div key={cls.id} className="bg-white/90 rounded-2xl overflow-hidden border border-slate-200/80 shadow-sm flex flex-col">
                  {/* Class Header */}
                  <div className="bg-slate-50/80 border-b border-slate-200 px-6 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="flex items-center gap-4">
                      <button
                        onClick={() => toggleClassVisibility(cls.id)}
                        className="h-8 w-8 flex items-center justify-center rounded-lg bg-white border border-slate-200 text-slate-400 hover:text-blue-600 transition-colors"
                      >
                        {isHidden ? <ChevronDown size={18} /> : <ChevronUp size={18} />}
                      </button>
                      <div>
                        <div className="font-bold text-slate-900 text-lg flex items-center gap-2">
                          {cls.class_name}
                          {isHidden ? <EyeOff size={14} className="text-slate-400" /> : <Eye size={14} className="text-slate-600" />}
                          {isHidden && <span className="text-[10px] bg-slate-200 text-slate-600 px-1.5 py-0.5 rounded uppercase tracking-tighter">Hidden</span>}
                        </div>
                        <div className="text-[11px] text-slate-500 uppercase font-bold flex items-center gap-4 mt-1.5 tracking-wider">
                          <span className="flex items-center gap-1.5"><Users size={14} className="text-slate-400" /> {cls.number_of_learners} Learners</span>
                          <span className="flex items-center gap-1.5"><BookOpen size={14} className="text-slate-400" /> {subjectCount} Subjects</span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-6">
                      <div className="text-right">
                        <div className="text-blue-600 font-black text-xl leading-none mb-1 finance-nums">
                          {batch.currency || 'MWK'} {displayedFeePerLearner.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                        </div>
                        <div className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">
                          {hasManualOverride ? 'Final Fee / Learner (Override)' : 'Expected Fee / Learner'}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 border-l border-slate-200 pl-6">
                        <button
                          onClick={() => handleManageSubjects(cls)}
                          disabled={isLocked}
                          className="h-10 w-10 flex items-center justify-center rounded-xl bg-white border border-slate-200 text-slate-500 hover:text-blue-600 hover:border-blue-200 hover:shadow-sm transition-all"
                          title="Manage Subjects"
                        >
                          <BookText size={18} />
                        </button>
                        {!isLocked && (
                          <button
                            onClick={() => handleRemoveClass(cls.id)}
                            className="h-10 w-10 flex items-center justify-center rounded-xl bg-white border border-red-100 text-red-400 hover:text-red-600 hover:border-red-200 hover:shadow-sm transition-all"
                            title="Remove Class"
                          >
                            <Trash2 size={18} />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Subjects Table */}
                  {!isHidden && (
                    <>
                      {cls.subjects && cls.subjects.length > 0 ? (
                        <div className="overflow-x-auto">
                          <table className="w-full text-left text-[13px]">
                            <thead className="bg-white border-b border-slate-100">
                              <tr>
                                <th className="px-6 py-3 text-left font-bold text-slate-400 text-[11px] uppercase tracking-wider">Subject Name</th>
                                <th className="px-6 py-3 text-center font-bold text-slate-400 text-[11px] uppercase tracking-wider w-24">Pages</th>
                                <th className="px-6 py-3 text-center font-bold text-slate-400 text-[11px] uppercase tracking-wider w-24">Extra Copies</th>
                                <th className="px-6 py-3 text-center font-bold text-slate-400 text-[11px] uppercase tracking-wider w-28">Total Copies</th>
                                <th className="px-6 py-3 text-center font-bold text-slate-400 text-[11px] uppercase tracking-wider w-28">Total Pages</th>
                                <th className="px-6 py-3 text-center font-bold text-slate-400 text-[11px] uppercase tracking-wider w-28">Total Sheets</th>
                                <th className="px-6 py-3 text-right font-bold text-slate-400 text-[11px] uppercase tracking-wider w-40">Paper</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-50 border-b border-slate-100">
                              {cls.subjects.map((subject: any) => {
                                const pagesPerPaper = Math.max(0, Math.floor(Number(subject.pages) || 0));
                                const extraCopies = Math.max(0, Math.floor(Number(subject.extra_copies) || 0));
                                const totalCopies = learners + extraCopies;
                                const totalPages = Number(subject.total_pages ?? (pagesPerPaper * totalCopies)) || 0;
                                const totalSheets = Number(subject.total_sheets ?? Math.ceil(totalPages / 2)) || 0;
                                return (
                                  <tr key={subject.id} className="hover:bg-slate-50/50 transition-colors">
                                    <td className="px-6 py-3.5 flex items-center gap-3">
                                      <div className="bg-blue-50 p-2 rounded-lg text-blue-600">
                                        <FileText size={16} />
                                      </div>
                                      <span className="font-semibold text-slate-700">{subject.subject_name}</span>
                                    </td>
                                    <td className="px-6 py-3.5 text-center font-medium text-slate-600">{pagesPerPaper}</td>
                                    <td className="px-6 py-3.5 text-center font-medium text-slate-600">{extraCopies}</td>
                                    <td className="px-6 py-3.5 text-center font-medium text-slate-600">{totalCopies}</td>
                                    <td className="px-6 py-3.5 text-center font-medium text-slate-600">{totalPages.toLocaleString()}</td>
                                    <td className="px-6 py-3.5 text-center font-medium text-slate-600">{totalSheets.toLocaleString()}</td>
                                    <td className="px-6 py-3.5 text-right font-medium text-slate-500">{subject.paper_size} <span className="text-slate-400 text-xs ml-1">({subject.orientation})</span></td>
                                  </tr>
                                );
                              })}
                            </tbody>
                            <tfoot className="bg-slate-50/50 border-t border-slate-100">
                              <tr>
                                <td colSpan={7} className="px-6 py-4">
                                  <div className="flex items-center justify-end gap-8">
                                    <div className="flex flex-col text-right">
                                      <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Production</span>
                                      <span className="font-bold text-slate-600 finance-nums leading-none mt-1 text-sm">
                                        {batch.currency || 'MWK'} {(Number(cls.material_total_cost) || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}
                                      </span>
                                    </div>
                                    <div className="flex flex-col text-right">
                                      <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Margin</span>
                                      <span className="font-bold text-orange-600 finance-nums leading-none mt-1 text-sm">
                                        {batch.currency || 'MWK'} {(Number(cls.margin_amount) || Math.max(0, (Number(cls.calculated_total_cost) || 0) - (Number(cls.material_total_cost) || 0) - (Number(cls.adjustment_total_cost) || 0))).toLocaleString(undefined, { maximumFractionDigits: 2 })}
                                      </span>
                                    </div>
                                    <div className="flex flex-col text-right">
                                      <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Adjustments</span>
                                      <span className="font-bold text-emerald-600 finance-nums leading-none mt-1 text-sm">
                                        {batch.currency || 'MWK'} {(Number(cls.market_adjustment_total ?? cls.adjustment_total_cost) || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}
                                      </span>
                                    </div>
                                    <div className="flex flex-col text-right">
                                      <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Rounding</span>
                                      <span className="font-bold text-blue-600 finance-nums leading-none mt-1 text-sm">
                                        {batch.currency || 'MWK'} {(Number(cls.rounding_adjustment) || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}
                                      </span>
                                    </div>
                                    {Number(cls.manual_override_amount) !== 0 && (
                                      <div className="flex flex-col text-right">
                                        <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Manual Override</span>
                                        <span className="font-bold text-purple-600 finance-nums leading-none mt-1 text-sm">
                                          {batch.currency || 'MWK'} {(Number(cls.manual_override_amount) || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}
                                        </span>
                                      </div>
                                    )}
                                    <div className="flex flex-col text-right">
                                      <span className="text-xs uppercase font-bold text-slate-600 tracking-widest">Class Total</span>
                                      <span className="font-bold text-indigo-700 finance-nums leading-none mt-1.5 text-base">
                                        {batch.currency || 'MWK'} {resolveClassTotalAmount(cls).toLocaleString(undefined, { maximumFractionDigits: 2 })}
                                      </span>
                                    </div>
                                  </div>
                                </td>
                              </tr>
                            </tfoot>
                          </table>
                        </div>
                      ) : (
                        <div className="px-6 py-8 text-center bg-white flex flex-col items-center justify-center">
                          <BookOpen className="h-8 w-8 text-slate-200 mb-2" />
                          <p className="text-[13px] text-slate-500">No subjects added to this class.</p>
                          <button
                            onClick={() => handleManageSubjects(cls)}
                            className="mt-3 text-xs font-bold text-blue-600 uppercase tracking-widest hover:text-blue-700"
                          >
                            Add Subjects
                          </button>
                        </div>
                      )}
                    </>
                  )}
                </div>
              );
            })}
          </div>
        )}

      </div>

      <AddClassDialog
        open={isAddClassOpen}
        onOpenChange={setIsAddClassOpen}
        onAdd={handleAddClass}
      />

      <ManageSubjectsDialog
        open={isManageSubjectsOpen}
        onOpenChange={setIsManageSubjectsOpen}
        examinationClass={selectedClass}
        onAddSubject={handleAddSubject}
        onRemoveSubject={handleRemoveSubject}
        onUpdateSubject={handleUpdateSubject}
        onUpdateClass={handleUpdateClass}
        onSaveClassPricing={handleSaveClassPricing}
        onApplyOverridePricing={canOverrideExamCost ? handleApplyClassOverridePricing : undefined}
        currencySymbol={batch.currency || 'MWK'}
        isLocked={isLocked}
      />

      <ConfirmDialog
        open={confirmDialog.open}
        onOpenChange={(open) => setConfirmDialog(prev => ({ ...prev, open }))}
        onConfirm={confirmDialog.onConfirm}
        title={confirmDialog.title}
        message={confirmDialog.message}
        type={confirmDialog.type}
      />

      <ConfirmDialog
        open={classRemoveConfirm.open}
        onOpenChange={(open) => setClassRemoveConfirm(prev => ({ ...prev, open }))}
        onConfirm={confirmHandleRemoveClass}
        title="Remove Class"
        message="Are you sure you want to remove this class and all its subjects?"
        type="danger"
      />

      <ConfirmDialog
        open={jobTicketConfirm.open}
        onOpenChange={(open) => setJobTicketConfirm(prev => ({ ...prev, open }))}
        onConfirm={handleConvertToJobTicket}
        title="Convert to Job Ticket"
        message="Convert this batch to a Job Ticket for production?"
        type="info"
      />
    </div>
  );
};

export default ExaminationBatchDetail;

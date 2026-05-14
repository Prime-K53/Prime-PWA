/**
 * Simple script to verify that market adjustments and rounding adjustments are
 * correctly calculated and persisted after the recent fixes.
 *
 * It creates a temporary examination batch, adds a class with a few learners,
 * adds a subject, triggers the calculation, and then prints out the relevant
 * totals for manual inspection.
 */

const examinationService = require('./server/services/examinationService.cjs');

async function run() {
  try {
    // 1. Create a new batch
    const batch = await examinationService.createBatch({
      school_id: 'test-school',
      name: 'Test Batch for Rounding/Adjustment Verification',
      academic_year: '2026',
      term: '1',
      exam_type: 'Mid-Term',
      type: 'Original',
      currency: 'MWK'
    }, 'test-user');

    console.log('Created batch:', batch.id);

    // 2. Add a class with 10 learners
    const cls = await examinationService.createClass(batch.id, {
      class_name: 'Test Class',
      number_of_learners: 10
    });
    console.log('Created class:', cls.id);

    // 3. Add a subject (5 pages, no extra copies)
    const subject = await examinationService.createSubject(cls.id, {
      subject_name: 'Test Subject',
      pages: 5,
      extra_copies: 0,
      paper_size: 'A4',
      orientation: 'Portrait'
    });
    console.log('Created subject:', subject.id);

    // 4. Trigger calculation (should happen automatically on create, but call explicitly)
    const recalculatedBatch = await examinationService.calculateBatch(batch.id, { trigger: 'TEST_RUN', userId: 'test-user' });

    // 5. Output relevant totals
    console.log('--- Calculation Results ---');
    console.log('Total Amount:', recalculatedBatch.total_amount);
    console.log('Material Total:', recalculatedBatch.calculated_material_total);
    console.log('Adjustment Total (pre-rounding):', recalculatedBatch.calculated_adjustment_total);
    console.log('Rounding Adjustment Total:', recalculatedBatch.rounding_adjustment_total);
    console.log('Adjustment Snapshots:', recalculatedBatch.adjustment_snapshots);

    // 6. Clean up – delete the batch (cascades classes & subjects)
    await examinationService.deleteBatch(batch.id, 'test-user');
    console.log('Deleted test batch');
  } catch (err) {
    console.error('Error during test execution:', err);
    process.exit(1);
  }
}

run();

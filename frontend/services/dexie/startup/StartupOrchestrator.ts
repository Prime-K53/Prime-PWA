import { databaseManager } from '../DatabaseManager';

export type StartupPhase = 'critical' | 'dashboard' | 'background' | 'deferred';
export type TaskStatus = 'pending' | 'running' | 'completed' | 'failed';

export interface StartupTask {
  id: string;
  phase: StartupPhase;
  label: string;
  execute: () => Promise<void>;
  timeoutMs: number;
}

export interface TaskResult {
  id: string;
  status: TaskStatus;
  durationMs: number;
  error?: string;
}

export class StartupOrchestrator {
  private tasks: Map<string, StartupTask> = new Map();
  private completed: Map<string, TaskResult> = new Map();
  private _phase: StartupPhase = 'critical';
  private _ready = false;
  private executionPromise: Promise<TaskResult[]> | null = null;

  get phase(): StartupPhase { return this._phase; }
  get ready(): boolean { return this._ready; }
  get progress(): { phase: StartupPhase; total: number; completed: number; failed: number } {
    const all = Array.from(this.completed.values());
    return {
      phase: this._phase,
      total: this.tasks.size,
      completed: all.filter((t) => t.status === 'completed').length,
      failed: all.filter((t) => t.status === 'failed').length,
    };
  }

  addTask(id: string, phase: StartupPhase, execute: () => Promise<void>, label?: string, timeoutMs: number = 15000): void {
    this.tasks.set(id, { id, phase, label: label || id, execute, timeoutMs });
  }

  async execute(): Promise<TaskResult[]> {
    if (this.executionPromise) return this.executionPromise;

    this.executionPromise = (async () => {
      await databaseManager.initialize();
      const phases: StartupPhase[] = ['critical', 'dashboard', 'background', 'deferred'];
      const results: TaskResult[] = [];

      for (const phase of phases) {
        this._phase = phase;
        const phaseTasks = Array.from(this.tasks.values())
          .filter((t) => t.phase === phase)
          .sort((a, b) => a.id.localeCompare(b.id));

        for (const task of phaseTasks) {
          const start = performance.now();
          const result: TaskResult = { id: task.id, status: 'running', durationMs: 0 };

          try {
            const timeoutPromise = new Promise<void>((_, reject) =>
              setTimeout(() => reject(new Error(`Task '${task.id}' timed out after ${task.timeoutMs}ms`)), task.timeoutMs)
            );
            await Promise.race([task.execute(), timeoutPromise]);
            result.status = 'completed';
          } catch (error) {
            result.status = 'failed';
            result.error = error instanceof Error ? error.message : String(error);
          }

          result.durationMs = performance.now() - start;
          this.completed.set(task.id, result);
          results.push(result);
        }
      }

      this._phase = 'deferred';
      this._ready = true;
      return results;
    })();

    return this.executionPromise;
  }

  getTaskResult(id: string): TaskResult | undefined {
    return this.completed.get(id);
  }

  reset(): void {
    this.tasks.clear();
    this.completed.clear();
    this._phase = 'critical';
    this._ready = false;
    this.executionPromise = null;
  }
}

export const startupOrchestrator = new StartupOrchestrator();

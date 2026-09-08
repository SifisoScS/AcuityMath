import {
  StudentAbilityProfile,
  IRTItemResponse,
  AdaptiveEngine
} from '../services/adaptiveEngine';

export interface MonteCarloProjection {
  medianTrajectory: number[];
  lowerBand: number[];
  upperBand: number[];
  projectedFinalTheta: number;
}

class AdaptiveWorkerClient {
  private worker: Worker | null = null;
  private pendingRequests = new Map<
    string,
    {
      resolve: (data: any) => void;
      reject: (err: any) => void;
      timeoutId: NodeJS.Timeout;
    }
  >();
  private reqCounter = 0;
  private isInitialized = false;

  constructor() {
    this.initWorker();
  }

  private initWorker() {
    if (typeof window === 'undefined' || typeof Worker === 'undefined') {
      return;
    }

    try {
      // Create modern Vite worker
      this.worker = new Worker(
        new URL('../workers/adaptiveWorker.ts', import.meta.url),
        { type: 'module' }
      );

      this.worker.onmessage = (event: MessageEvent) => {
        const { id, success, data, error } = event.data || {};
        const pending = this.pendingRequests.get(id);
        if (pending) {
          clearTimeout(pending.timeoutId);
          this.pendingRequests.delete(id);
          if (success) {
            pending.resolve(data);
          } else {
            pending.reject(new Error(error || 'Worker execution failed'));
          }
        }
      };

      this.worker.onerror = (err) => {
        console.warn('[AdaptiveWorker] Worker error fallback active:', err);
      };

      this.isInitialized = true;
    } catch (err) {
      console.warn('[AdaptiveWorker] Worker initialization bypassed, using main thread fallback', err);
      this.worker = null;
    }
  }

  /**
   * Asynchronously updates a student ability profile using the background worker,
   * falling back smoothly to synchronous calculation if workers are unavailable.
   */
  public async updateAbilityAsync(
    current: StudentAbilityProfile,
    response: IRTItemResponse
  ): Promise<StudentAbilityProfile> {
    if (!this.worker) {
      // Main-thread synchronous fallback
      return AdaptiveEngine.updateAbility(current, response);
    }

    const id = `req_${++this.reqCounter}_${Date.now()}`;

    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        this.pendingRequests.delete(id);
        // Fallback to local computation if worker timed out
        resolve(AdaptiveEngine.updateAbility(current, response));
      }, 1000);

      this.pendingRequests.set(id, { resolve, reject, timeoutId });

      this.worker!.postMessage({
        id,
        type: 'UPDATE_ABILITY',
        payload: { current, response }
      });
    });
  }

  /**
   * Simulates 100+ longitudinal cohort practice sessions to project growth
   */
  public async runMonteCarloAsync(
    initialTheta: number,
    sessionsCount = 30,
    simulations = 100
  ): Promise<MonteCarloProjection> {
    if (!this.worker) {
      // Inline lightweight fallback
      const trajectory = Array.from({ length: sessionsCount + 1 }, (_, i) =>
        Math.round((initialTheta + (i * 0.03)) * 100) / 100
      );
      return {
        medianTrajectory: trajectory,
        lowerBand: trajectory.map(t => Math.round((t - 0.2) * 100) / 100),
        upperBand: trajectory.map(t => Math.round((t + 0.2) * 100) / 100),
        projectedFinalTheta: trajectory[sessionsCount]
      };
    }

    const id = `mc_${++this.reqCounter}_${Date.now()}`;

    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        this.pendingRequests.delete(id);
        const trajectory = Array.from({ length: sessionsCount + 1 }, (_, i) =>
          Math.round((initialTheta + (i * 0.03)) * 100) / 100
        );
        resolve({
          medianTrajectory: trajectory,
          lowerBand: trajectory.map(t => Math.round((t - 0.2) * 100) / 100),
          upperBand: trajectory.map(t => Math.round((t + 0.2) * 100) / 100),
          projectedFinalTheta: trajectory[sessionsCount]
        });
      }, 1500);

      this.pendingRequests.set(id, { resolve, reject, timeoutId });

      this.worker!.postMessage({
        id,
        type: 'RUN_MONTE_CARLO',
        payload: { initialTheta, sessionsCount, simulations }
      });
    });
  }
}

export const adaptiveWorkerClient = new AdaptiveWorkerClient();

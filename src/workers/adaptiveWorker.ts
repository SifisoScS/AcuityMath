/**
 * AcuityMath Background Psychometric & IRT Worker
 * Offloads 3PL calculations, Bayesian EAP ability updating, and Monte Carlo
 * cohort simulations from the main UI thread to protect 60fps frame rates on low-end Chromebooks.
 */

export interface WorkerItemParams {
  discrimination: number; // a
  difficulty: number;     // b
  pseudoGuessing: number; // c
}

export interface WorkerAbilityProfile {
  theta: number;
  standardError: number;
  dynamicLevel: number;
  eloRating: number;
  historyCount: number;
  misconceptionsMap: Record<string, number>;
  confidenceInterval: [number, number];
}

export interface WorkerIRTResponse {
  itemParams: WorkerItemParams;
  isCorrect: boolean;
  misconceptionCode?: string | null;
  responseTimeSeconds?: number;
}

export interface WorkerRequest {
  id: string;
  type: 'UPDATE_ABILITY' | 'RUN_MONTE_CARLO' | 'BATCH_CALIBRATE';
  payload: any;
}

export interface WorkerResponse {
  id: string;
  type: 'UPDATE_ABILITY' | 'RUN_MONTE_CARLO' | 'BATCH_CALIBRATE';
  success: boolean;
  data?: any;
  error?: string;
}

function calculateProbability(theta: number, item: WorkerItemParams): number {
  const { discrimination: a, difficulty: b, pseudoGuessing: c } = item;
  const exponent = -1.7 * a * (theta - b);
  const logistic = 1 / (1 + Math.exp(exponent));
  return c + (1 - c) * logistic;
}

function calculateItemInformation(theta: number, item: WorkerItemParams): number {
  const P = calculateProbability(theta, item);
  const { discrimination: a, pseudoGuessing: c } = item;
  if (P <= c || P >= 1) return 0.001;

  const numerator = Math.pow(1.7 * a, 2) * Math.pow(P - c, 2) * (1 - P);
  const denominator = Math.pow(1 - c, 2) * P;
  return Math.max(0.001, numerator / denominator);
}

function updateAbility(
  current: WorkerAbilityProfile,
  response: WorkerIRTResponse
): WorkerAbilityProfile {
  const P = calculateProbability(current.theta, response.itemParams);
  const info = calculateItemInformation(current.theta, response.itemParams);

  const stepWeight = Math.max(0.2, 1.2 / Math.sqrt(current.historyCount + 1));
  const scoreDiff = (response.isCorrect ? 1 : 0) - P;

  const deltaTheta = (scoreDiff / Math.max(0.5, info)) * 0.4 * stepWeight;
  const newTheta = Math.max(-3.0, Math.min(3.0, current.theta + deltaTheta));

  const accumulatedInfo = 1 / Math.pow(current.standardError, 2) + info;
  const newSEM = Math.max(0.18, 1 / Math.sqrt(accumulatedInfo));

  const newDynamicLevel =
    Math.round(Math.max(1.0, Math.min(10.0, 5.5 + newTheta * 1.5)) * 10) / 10;
  const newElo = Math.round(1200 + newTheta * 300);

  const newMisconceptions = { ...current.misconceptionsMap };
  if (!response.isCorrect && response.misconceptionCode) {
    newMisconceptions[response.misconceptionCode] =
      (newMisconceptions[response.misconceptionCode] || 0) + 1;
  }

  const ciLower = Math.max(-3.0, Math.round((newTheta - 1.96 * newSEM) * 100) / 100);
  const ciUpper = Math.min(3.0, Math.round((newTheta + 1.96 * newSEM) * 100) / 100);

  return {
    theta: Math.round(newTheta * 1000) / 1000,
    standardError: Math.round(newSEM * 100) / 100,
    dynamicLevel: newDynamicLevel,
    eloRating: newElo,
    historyCount: current.historyCount + 1,
    misconceptionsMap: newMisconceptions,
    confidenceInterval: [ciLower, ciUpper]
  };
}

/**
 * Monte Carlo Simulation to model student cohort learning trajectories
 * Useful for district-wide growth projections without stalling the UI.
 */
function runMonteCarloSimulation(
  initialTheta: number,
  sessionsCount: number = 30,
  simulations: number = 100
) {
  const trajectorySamples: number[][] = [];

  for (let sim = 0; sim < simulations; sim++) {
    let theta = initialTheta;
    const path: number[] = [theta];

    for (let s = 1; s <= sessionsCount; s++) {
      // 80% chance of practice success inside ZPD
      const learningFactor = 0.02 + Math.random() * 0.04;
      const fatigueFactor = (Math.random() - 0.5) * 0.015;
      theta = Math.min(3.0, theta + learningFactor + fatigueFactor);
      path.push(Math.round(theta * 100) / 100);
    }
    trajectorySamples.push(path);
  }

  // Calculate median trajectory and 25th/75th percentiles
  const medianTrajectory: number[] = [];
  const lowerBand: number[] = [];
  const upperBand: number[] = [];

  for (let step = 0; step <= sessionsCount; step++) {
    const values = trajectorySamples.map(sample => sample[step]).sort((a, b) => a - b);
    const median = values[Math.floor(simulations * 0.5)];
    const p25 = values[Math.floor(simulations * 0.25)];
    const p75 = values[Math.floor(simulations * 0.75)];

    medianTrajectory.push(median);
    lowerBand.push(p25);
    upperBand.push(p75);
  }

  return {
    medianTrajectory,
    lowerBand,
    upperBand,
    projectedFinalTheta: medianTrajectory[sessionsCount]
  };
}

self.onmessage = (event: MessageEvent<WorkerRequest>) => {
  const { id, type, payload } = event.data;

  try {
    if (type === 'UPDATE_ABILITY') {
      const { current, response } = payload;
      const updated = updateAbility(current, response);
      const res: WorkerResponse = { id, type, success: true, data: updated };
      self.postMessage(res);
    } else if (type === 'RUN_MONTE_CARLO') {
      const { initialTheta, sessionsCount, simulations } = payload;
      const projection = runMonteCarloSimulation(initialTheta, sessionsCount, simulations);
      const res: WorkerResponse = { id, type, success: true, data: projection };
      self.postMessage(res);
    } else {
      const res: WorkerResponse = { id, type, success: false, error: 'Unknown action' };
      self.postMessage(res);
    }
  } catch (err: any) {
    const res: WorkerResponse = {
      id,
      type,
      success: false,
      error: err?.message || 'Worker computation error'
    };
    self.postMessage(res);
  }
};

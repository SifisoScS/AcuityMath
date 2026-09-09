/**
 * AcuityMath Psychometric Item Response Theory (IRT) & Adaptive Intelligence Engine
 * Implements 3-Parameter Logistic (3PL) Computer Adaptive Testing (CAT) & Cognitive Diagnostics
 */

import { baseThetaForAge } from './tiers';

export interface ItemParameters {
  discrimination: number; // a parameter (typical range: 0.6 - 2.2)
  difficulty: number;     // b parameter (latent scale: -3.0 to +3.0)
  pseudoGuessing: number; // c parameter (typical 0.25 for 4-choice)
}

export type MisconceptionCode =
  | 'SIGN_ERROR'
  | 'ORDER_OF_OPERATIONS'
  | 'INVERTED_FRACTION'
  | 'ADDITIVE_INSTEAD_OF_MULTIPLICATIVE'
  | 'OFF_BY_ONE_COUNTING'
  | 'RECIPROCAL_MISAPPLIED'
  | 'DISTRIBUTIVE_OMISSION'
  | 'UNIT_CONVERSION_CONFUSION'
  | 'COORDINATE_AXIS_SWAP'
  | 'GENERAL_CALCULATION_SLIP';

export interface StudentAbilityProfile {
  theta: number;              // Latent ability (-3.0 to +3.0)
  standardError: number;      // SEM
  dynamicLevel: number;       // Scaled 1.0 to 10.0
  eloRating: number;          // Scaled 600 to 2400
  historyCount: number;
  misconceptionsMap: Record<MisconceptionCode, number>;
  confidenceInterval: [number, number];
}

export interface IRTItemResponse {
  itemParams: ItemParameters;
  isCorrect: boolean;
  misconceptionCode?: MisconceptionCode | null;
  responseTimeSeconds?: number;
}

export class AdaptiveEngine {
  /**
   * Probability of a correct response according to the 3PL IRT Model:
   * P(theta) = c + (1 - c) / (1 + exp(-1.7 * a * (theta - b)))
   */
  public static calculateProbability(theta: number, item: ItemParameters): number {
    const { discrimination: a, difficulty: b, pseudoGuessing: c } = item;
    const exponent = -1.7 * a * (theta - b);
    const logistic = 1 / (1 + Math.exp(exponent));
    return c + (1 - c) * logistic;
  }

  /**
   * Fisher Information for an item at ability theta:
   * I(theta) = (1.7 * a)^2 * ((P - c)^2 / (1 - c)^2) * ((1 - P) / P)
   */
  public static calculateItemInformation(theta: number, item: ItemParameters): number {
    const P = this.calculateProbability(theta, item);
    const { discrimination: a, pseudoGuessing: c } = item;
    if (P <= c || P >= 1) return 0.001;

    const numerator = Math.pow(1.7 * a, 2) * Math.pow(P - c, 2) * (1 - P);
    const denominator = Math.pow(1 - c, 2) * P;
    return Math.max(0.001, numerator / denominator);
  }

  /**
   * Updates student's ability (theta) using Bayesian Expected A Posteriori (EAP) / Newton Step
   */
  public static updateAbility(
    current: StudentAbilityProfile,
    response: IRTItemResponse
  ): StudentAbilityProfile {
    const P = this.calculateProbability(current.theta, response.itemParams);
    const info = this.calculateItemInformation(current.theta, response.itemParams);

    // Learning rate scales inversely with history count (settling convergence)
    const stepWeight = Math.max(0.2, 1.2 / Math.sqrt(current.historyCount + 1));
    const scoreDiff = (response.isCorrect ? 1 : 0) - P;

    // Delta update with bounds clamping [-3.0, +3.0]
    const deltaTheta = (scoreDiff / Math.max(0.5, info)) * 0.4 * stepWeight;
    let newTheta = Math.max(-3.0, Math.min(3.0, current.theta + deltaTheta));

    // Standard Error of Measurement (SEM) decreases as information accumulates
    const accumulatedInfo = (1 / Math.pow(current.standardError, 2)) + info;
    const newSEM = Math.max(0.18, 1 / Math.sqrt(accumulatedInfo));

    // Map theta to 1.0 - 10.0 dynamic level
    // Theta -3.0 -> 1.0, Theta 0.0 -> 5.5, Theta +3.0 -> 10.0
    const newDynamicLevel = Math.round(Math.max(1.0, Math.min(10.0, 5.5 + (newTheta * 1.5))) * 10) / 10;

    // Map theta to ELO: 0 -> 1200, +3 -> 2100, -3 -> 700
    const newElo = Math.round(1200 + (newTheta * 300));

    // Track misconception if error occurred
    const newMisconceptions = { ...current.misconceptionsMap };
    if (!response.isCorrect && response.misconceptionCode) {
      newMisconceptions[response.misconceptionCode] = (newMisconceptions[response.misconceptionCode] || 0) + 1;
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
   * Initializes a fresh ability profile based on age/tier.
   *
   * The bands come from `services/tiers` rather than being repeated here. They
   * used to be repeated, and the two copies disagreed at 6 and at 14 — a
   * six-year-old was placed in Early Sprouts and given the starting ability of a
   * seven-to-ten year old, so their first questions were pitched a tier above
   * them.
   */
  public static createInitialProfile(age: number): StudentAbilityProfile {
    const baseTheta = baseThetaForAge(age);

    return {
      theta: baseTheta,
      standardError: 0.85,
      dynamicLevel: Math.round((5.5 + baseTheta * 1.5) * 10) / 10,
      eloRating: Math.round(1200 + baseTheta * 300),
      historyCount: 0,
      misconceptionsMap: {
        SIGN_ERROR: 0,
        ORDER_OF_OPERATIONS: 0,
        INVERTED_FRACTION: 0,
        ADDITIVE_INSTEAD_OF_MULTIPLICATIVE: 0,
        OFF_BY_ONE_COUNTING: 0,
        RECIPROCAL_MISAPPLIED: 0,
        DISTRIBUTIVE_OMISSION: 0,
        UNIT_CONVERSION_CONFUSION: 0,
        COORDINATE_AXIS_SWAP: 0,
        GENERAL_CALCULATION_SLIP: 0
      },
      confidenceInterval: [baseTheta - 1.6, baseTheta + 1.6]
    };
  }
}

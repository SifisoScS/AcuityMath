/**
 * AcuityMath Algorithmic Problem Generator
 * Generates infinite parameterized math problems with diagnostic misconception tagging
 * across all four developmental tiers (Ages 3 to 18).
 */

import { MathProblem, AgeTier } from '../types';
import { ItemParameters, MisconceptionCode } from './adaptiveEngine';

export interface GeneratedMathProblem extends Omit<MathProblem, 'tier' | 'topic' | 'title' | 'difficulty' | 'visualType' | 'visualData'> {
  tier?: AgeTier;
  topic?: string;
  title?: string;
  difficulty?: number;
  visualType?: any;
  visualData?: any;
  manipulativeHint?: string;
  irtParameters: ItemParameters;
  distractorDiagnostics: Record<string, MisconceptionCode | string>;
  standardCode: string;
  topicDomain: string;
}

// Random helpers
const randInt = (min: number, max: number): number =>
  Math.floor(Math.random() * (max - min + 1)) + min;

const pickRandom = <T>(arr: T[]): T =>
  arr[Math.floor(Math.random() * arr.length)];

const shuffle = <T>(arr: T[]): T[] => {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
};

export class ProblemGenerator {
  /**
   * Generates a problem matching the target tier and student latent ability (theta).
   */
  public static generate(tier: 'early' | 'elementary' | 'middle' | 'high', targetTheta = 0.0): GeneratedMathProblem {
    let prob: GeneratedMathProblem;
    switch (tier) {
      case 'early':
        prob = this.generateEarly(targetTheta);
        break;
      case 'elementary':
        prob = this.generateElementary(targetTheta);
        break;
      case 'middle':
        prob = this.generateMiddle(targetTheta);
        break;
      case 'high':
        prob = this.generateHigh(targetTheta);
        break;
    }
    prob.tier = tier;
    prob.topic = prob.topicDomain;
    prob.title = `${prob.topicDomain} Practice`;
    prob.difficulty = Math.min(10, Math.max(1, Math.round(5 + targetTheta * 2)));
    return prob;
  }

  // ==========================================
  // TIER 1: EARLY SPROUTS (Ages 3–5)
  // ==========================================
  private static generateEarly(theta: number): GeneratedMathProblem {
    const generators = [
      () => {
        // Bond to 5 or 10
        const total = theta > -0.5 ? 10 : 5;
        const a = randInt(1, total - 1);
        const b = total - a;
        const isFindingPart = Math.random() > 0.4;

        if (isFindingPart) {
          const correct = b.toString();
          const dist1 = (b + 1).toString();
          const dist2 = Math.max(1, b - 1).toString();
          const dist3 = total.toString();

          return {
            id: `gen-early-bond-${Date.now()}-${randInt(100, 999)}`,
            question: `You have ${a} bright stars ⭐ in your basket. How many more do you need to make ${total} stars in total?`,
            visualType: 'ten-frame' as const,
            visualData: { filled: a, target: total, color: 'indigo' },
            options: shuffle([correct, dist1, dist2, dist3]),
            correctAnswer: correct,
            hint: `Start at ${a} and count forward up to ${total} on your fingers!`,
            explanation: `${a} + ${b} = ${total}. We need ${b} more stars to complete the set of ${total}.`,
            manipulativeHint: 'Use the Ten-Frame Counter to see the empty slots!',
            irtParameters: { discrimination: 1.1, difficulty: theta > -0.5 ? -0.8 : -1.8, pseudoGuessing: 0.25 },
            standardCode: 'CCSS.MATH.PK.OA.1',
            topicDomain: 'Number Bonds & Compositions',
            distractorDiagnostics: {
              [dist1]: 'OFF_BY_ONE_COUNTING',
              [dist2]: 'OFF_BY_ONE_COUNTING',
              [dist3]: 'GENERAL_CALCULATION_SLIP'
            }
          };
        } else {
          // Direct addition
          const sum = a + b;
          const correct = sum.toString();
          const dist1 = (sum + 1).toString();
          const dist2 = Math.max(1, sum - 1).toString();
          const dist3 = Math.abs(a - b).toString();

          return {
            id: `gen-early-add-${Date.now()}-${randInt(100, 999)}`,
            question: `What is ${a} apples 🍎 plus ${b} more apples 🍎?`,
            visualType: 'apples' as const,
            visualData: { count: sum, red: a, green: b },
            options: shuffle([correct, dist1, dist2, dist3]),
            correctAnswer: correct,
            hint: `Count the first group of ${a}, then keep counting ${b} more!`,
            explanation: `${a} + ${b} equals ${sum} delicious apples in all!`,
            manipulativeHint: 'Tap each apple one by one to count them.',
            irtParameters: { discrimination: 1.0, difficulty: -1.5, pseudoGuessing: 0.25 },
            standardCode: 'CCSS.MATH.K.OA.2',
            topicDomain: 'Early Addition Concepts',
            distractorDiagnostics: {
              [dist1]: 'OFF_BY_ONE_COUNTING',
              [dist2]: 'OFF_BY_ONE_COUNTING',
              [dist3]: 'SIGN_ERROR'
            }
          };
        }
      },
      () => {
        // Pattern recognition
        const patterns = [
          { seq: ['🔴', '🔵', '🔴', '🔵'], next: '🔴', wrong: ['🔵', '🟢', '🟡'] },
          { seq: ['⭐', '⭐', '🌙', '⭐', '⭐'], next: '🌙', wrong: ['⭐', '☀️', '☁️'] },
          { seq: ['🍎', '🍌', '🍎', '🍌'], next: '🍎', wrong: ['🍌', '🍇', '🍊'] }
        ];
        const p = pickRandom(patterns);
        const correct = p.next;
        const [w1, w2, w3] = p.wrong;

        return {
          id: `gen-early-pat-${Date.now()}-${randInt(100, 999)}`,
          question: `Look closely at the pattern train: ${p.seq.join(' ')} ... What comes next?`,
          visualType: 'apples' as const,
          visualData: { sequence: p.seq },
          options: shuffle([correct, w1, w2, w3]),
          correctAnswer: correct,
          hint: 'Say the symbols out loud from the beginning to hear the rhythm!',
          explanation: `The repeating pattern repeats regularly. The next symbol is ${correct}!`,
          manipulativeHint: 'Listen to the repeating sound pattern.',
          irtParameters: { discrimination: 1.2, difficulty: -1.3, pseudoGuessing: 0.25 },
          standardCode: 'CCSS.MATH.PK.G.1',
          topicDomain: 'Algebraic Thinking & Patterns',
          distractorDiagnostics: {
            [w1]: 'OFF_BY_ONE_COUNTING',
            [w2]: 'GENERAL_CALCULATION_SLIP',
            [w3]: 'GENERAL_CALCULATION_SLIP'
          }
        };
      }
    ];

    return pickRandom(generators)();
  }

  // ==========================================
  // TIER 2: ELEMENTARY EXPLORERS (Ages 6–10)
  // ==========================================
  private static generateElementary(theta: number): GeneratedMathProblem {
    const generators = [
      () => {
        // Fraction Equivalence
        const baseDenom = pickRandom([2, 3, 4]);
        const baseNum = randInt(1, baseDenom - 1);
        const multiplier = randInt(2, 4);
        const eqNum = baseNum * multiplier;
        const eqDenom = baseDenom * multiplier;

        const correct = `${eqNum}/${eqDenom}`;
        const dist1 = `${eqNum + 1}/${eqDenom}`;
        const dist2 = `${eqDenom}/${eqNum}`;
        const dist3 = `${baseNum}/${eqDenom}`;

        return {
          id: `gen-elem-frac-${Date.now()}-${randInt(100, 999)}`,
          question: `Which fraction is strictly equivalent to ${baseNum}/${baseDenom}?`,
          visualType: 'fraction-pizza' as const,
          visualData: { numerator: baseNum, denominator: baseDenom, comparisonNumerator: eqNum, comparisonDenominator: eqDenom },
          options: shuffle([correct, dist1, dist2, dist3]),
          correctAnswer: correct,
          hint: `Multiply both the top (numerator) and bottom (denominator) by ${multiplier}!`,
          explanation: `Multiplying both numerator and denominator by ${multiplier} gives ${eqNum}/${eqDenom}, which represents the exact same portion of the whole.`,
          manipulativeHint: 'Check the Fraction Pizza Lab to see the slices match in size!',
          irtParameters: { discrimination: 1.3, difficulty: -0.2 + (theta * 0.3), pseudoGuessing: 0.25 },
          standardCode: 'CCSS.MATH.4.NF.1',
          topicDomain: 'Fractions & Equivalence',
          distractorDiagnostics: {
            [dist1]: 'OFF_BY_ONE_COUNTING',
            [dist2]: 'INVERTED_FRACTION',
            [dist3]: 'DISTRIBUTIVE_OMISSION'
          }
        };
      },
      () => {
        // Two-digit Multiplication / Regrouping
        const a = randInt(12, 45);
        const b = randInt(3, 9);
        const product = a * b;

        const correct = product.toString();
        const dist1 = (product + b).toString();
        const dist2 = (product - 10).toString();
        const dist3 = (a * 10 - b).toString();

        return {
          id: `gen-elem-mult-${Date.now()}-${randInt(100, 999)}`,
          question: `Calculate: ${a} × ${b} = ?`,
          visualType: 'grid-array' as const,
          visualData: { rows: b, cols: a },
          options: shuffle([correct, dist1, dist2, dist3]),
          correctAnswer: correct,
          hint: `Break ${a} into tens and ones: (${Math.floor(a / 10) * 10} × ${b}) + (${a % 10} × ${b}).`,
          explanation: `${a} × ${b} = (${Math.floor(a / 10) * 10} × ${b}) + (${a % 10} × ${b}) = ${Math.floor(a / 10) * 10 * b} + ${a % 10 * b} = ${product}.`,
          manipulativeHint: 'Use Base-10 blocks to represent the groups.',
          irtParameters: { discrimination: 1.2, difficulty: 0.0 + (theta * 0.2), pseudoGuessing: 0.25 },
          standardCode: 'CCSS.MATH.4.NBT.5',
          topicDomain: 'Multi-Digit Operations & Place Value',
          distractorDiagnostics: {
            [dist1]: 'ADDITIVE_INSTEAD_OF_MULTIPLICATIVE',
            [dist2]: 'GENERAL_CALCULATION_SLIP',
            [dist3]: 'DISTRIBUTIVE_OMISSION'
          }
        };
      },
      () => {
        // Area and Perimeter
        const length = randInt(5, 12);
        const width = randInt(3, 8);
        const area = length * width;
        const perimeter = 2 * (length + width);

        const correct = `${area} sq units`;
        const dist1 = `${perimeter} sq units`; // Common error: confused area with perimeter
        const dist2 = `${area + length} sq units`;
        const dist3 = `${length + width} sq units`;

        return {
          id: `gen-elem-geom-${Date.now()}-${randInt(100, 999)}`,
          question: `A garden has length ${length} m and width ${width} m. What is its total area?`,
          visualType: 'coordinate' as const,
          visualData: { length, width },
          options: shuffle([correct, dist1, dist2, dist3]),
          correctAnswer: correct,
          hint: 'Area is the space inside: Area = length × width.',
          explanation: `Area = ${length} × ${width} = ${area} square meters. (Perimeter would be 2 × (${length} + ${width}) = ${perimeter} m).`,
          manipulativeHint: 'Count the unit tiles filling the garden rectangle.',
          irtParameters: { discrimination: 1.4, difficulty: -0.1, pseudoGuessing: 0.25 },
          standardCode: 'CCSS.MATH.3.MD.7',
          topicDomain: 'Geometric Measurement & Area',
          distractorDiagnostics: {
            [dist1]: 'ADDITIVE_INSTEAD_OF_MULTIPLICATIVE',
            [dist2]: 'OFF_BY_ONE_COUNTING',
            [dist3]: 'DISTRIBUTIVE_OMISSION'
          }
        };
      }
    ];

    return pickRandom(generators)();
  }

  // ==========================================
  // TIER 3: MIDDLE SCHOOL (Ages 11–13)
  // ==========================================
  private static generateMiddle(theta: number): GeneratedMathProblem {
    const generators = [
      () => {
        // Linear Equation: ax + b = c
        const a = pickRandom([2, 3, 4, 5]);
        const xVal = randInt(-5, 8);
        const b = randInt(-12, 15);
        const c = a * xVal + b;

        const correct = `x = ${xVal}`;
        const dist1 = `x = ${-xVal}`; // Sign error
        const dist2 = `x = ${xVal + 1}`;
        const dist3 = `x = ${Math.round((c + b) / a)}`; // Inverted sign on b

        const signStr = b >= 0 ? `+ ${b}` : `- ${Math.abs(b)}`;

        return {
          id: `gen-mid-linear-${Date.now()}-${randInt(100, 999)}`,
          question: `Solve for x:  ${a}x ${signStr} = ${c}`,
          visualType: 'balance-scale' as const,
          visualData: { a, b, c, x: xVal },
          options: shuffle([correct, dist1, dist2, dist3]),
          correctAnswer: correct,
          hint: `First, isolate the term with x by doing the opposite of ${b >= 0 ? `adding ${b}` : `subtracting ${Math.abs(b)}`} on both sides!`,
          explanation: `Step 1: ${a}x = ${c} - (${b}) = ${c - b}. Step 2: Divide both sides by ${a}: x = ${c - b} / ${a} = ${xVal}.`,
          manipulativeHint: 'Think of a balance scale: whatever you do to one side, you must do to the other.',
          irtParameters: { discrimination: 1.5, difficulty: 0.5 + (theta * 0.3), pseudoGuessing: 0.25 },
          standardCode: 'CCSS.MATH.7.EE.4',
          topicDomain: 'Linear Equations & Expressions',
          distractorDiagnostics: {
            [dist1]: 'SIGN_ERROR',
            [dist2]: 'OFF_BY_ONE_COUNTING',
            [dist3]: 'SIGN_ERROR'
          }
        };
      },
      () => {
        // Negative Number Operations & Zero-pairs
        const p = randInt(-15, -2);
        const q = randInt(3, 14);
        const sum = p + q;

        const correct = sum.toString();
        const dist1 = (-(Math.abs(p) + q)).toString(); // Added magnitudes
        const dist2 = (-sum).toString(); // Sign error
        const dist3 = (p - q).toString();

        return {
          id: `gen-mid-integers-${Date.now()}-${randInt(100, 999)}`,
          question: `Evaluate the integer sum: (${p}) + (${q}) = ?`,
          visualType: 'balance-scale' as const,
          visualData: { left: p, right: q },
          options: shuffle([correct, dist1, dist2, dist3]),
          correctAnswer: correct,
          hint: 'Think of zero-pairs or temperatures. Does the positive or negative number have greater absolute value?',
          explanation: `Starting at ${p} on a number line and moving ${q} units to the right lands at ${sum}. Zero-pairs cancel out to leave ${sum}.`,
          manipulativeHint: 'Cancel out pairs of (+1) and (-1) until only the remainder is left.',
          irtParameters: { discrimination: 1.3, difficulty: 0.2, pseudoGuessing: 0.25 },
          standardCode: 'CCSS.MATH.7.NS.1',
          topicDomain: 'The Number System & Integers',
          distractorDiagnostics: {
            [dist1]: 'ADDITIVE_INSTEAD_OF_MULTIPLICATIVE',
            [dist2]: 'SIGN_ERROR',
            [dist3]: 'ORDER_OF_OPERATIONS'
          }
        };
      },
      () => {
        // Slope between two points
        const x1 = randInt(1, 4);
        const y1 = randInt(1, 5);
        const dx = pickRandom([1, 2, 3]);
        const dy = pickRandom([-3, -2, 2, 4, 6]);
        const x2 = x1 + dx;
        const y2 = y1 + dy;

        // Simplify slope dy / dx
        const gcd = (a: number, b: number): number => (b === 0 ? Math.abs(a) : gcd(b, a % b));
        const div = gcd(dy, dx);
        const sNum = dy / div;
        const sDen = dx / div;
        const slopeStr = sDen === 1 ? `${sNum}` : `${sNum}/${sDen}`;
        const invSlopeStr = sNum === 0 ? '0' : (sNum === 1 ? `${sDen}` : `${sDen}/${sNum}`);
        const oppSignSlope = sDen === 1 ? `${-sNum}` : `${-sNum}/${sDen}`;

        const correct = `m = ${slopeStr}`;
        const dist1 = `m = ${invSlopeStr}`; // Swapped dx / dy
        const dist2 = `m = ${oppSignSlope}`; // Sign flipped
        const dist3 = `m = ${sNum + 1}`;

        return {
          id: `gen-mid-slope-${Date.now()}-${randInt(100, 999)}`,
          question: `Find the slope (m) of the line passing through points (${x1}, ${y1}) and (${x2}, ${y2}).`,
          visualType: 'coordinate' as const,
          visualData: { x1, y1, x2, y2 },
          options: shuffle([correct, dist1, dist2, dist3]),
          correctAnswer: correct,
          hint: 'Slope is Rise over Run: m = (y2 - y1) / (x2 - x1).',
          explanation: `m = (${y2} - ${y1}) / (${x2} - ${x1}) = ${dy} / ${dx} = ${slopeStr}.`,
          manipulativeHint: 'Check the rise (vertical change) and run (horizontal change) on the Coordinate Grapher.',
          irtParameters: { discrimination: 1.6, difficulty: 0.8 + (theta * 0.2), pseudoGuessing: 0.25 },
          standardCode: 'CCSS.MATH.8.EE.6',
          topicDomain: 'Linear Functions & Slope',
          distractorDiagnostics: {
            [dist1]: 'COORDINATE_AXIS_SWAP',
            [dist2]: 'SIGN_ERROR',
            [dist3]: 'GENERAL_CALCULATION_SLIP'
          }
        };
      }
    ];

    return pickRandom(generators)();
  }

  // ==========================================
  // TIER 4: HIGH SCHOOL (Ages 14–18)
  // ==========================================
  private static generateHigh(theta: number): GeneratedMathProblem {
    const generators = [
      () => {
        // Quadratic Factoring: x^2 - (r1+r2)x + r1*r2 = 0
        const r1 = randInt(1, 6);
        const r2 = randInt(-5, 5);
        const bCoeff = -(r1 + r2);
        const cConst = r1 * r2;

        const bStr = bCoeff === 0 ? '' : (bCoeff > 0 ? `+ ${bCoeff === 1 ? '' : bCoeff}x` : `- ${Math.abs(bCoeff) === 1 ? '' : Math.abs(bCoeff)}x`);
        const cStr = cConst === 0 ? '' : (cConst > 0 ? `+ ${cConst}` : `- ${Math.abs(cConst)}`);

        const correct = `x = ${r1}, x = ${r2}`;
        const dist1 = `x = ${-r1}, x = ${-r2}`; // Root signs reversed
        const dist2 = `x = ${r1}, x = ${-r2}`;
        const dist3 = `x = ${r1 + 1}, x = ${r2 - 1}`;

        return {
          id: `gen-high-quad-${Date.now()}-${randInt(100, 999)}`,
          question: `Find the real solutions for the quadratic equation:  x² ${bStr} ${cStr} = 0`,
          visualType: 'coordinate' as const,
          visualData: { roots: [r1, r2], a: 1, b: bCoeff, c: cConst },
          options: shuffle([correct, dist1, dist2, dist3]),
          correctAnswer: correct,
          hint: 'Look for two numbers that multiply to the constant term and add up to the coefficient of x.',
          explanation: `Factoring: (x - ${r1})(x - ${r2}) = 0. Setting each factor to zero yields x = ${r1} and x = ${r2}.`,
          manipulativeHint: 'The solutions correspond to the x-intercepts of the parabola.',
          irtParameters: { discrimination: 1.7, difficulty: 1.2 + (theta * 0.3), pseudoGuessing: 0.25 },
          standardCode: 'CCSS.MATH.HSA.REI.4',
          topicDomain: 'Quadratic Equations & Roots',
          distractorDiagnostics: {
            [dist1]: 'SIGN_ERROR',
            [dist2]: 'SIGN_ERROR',
            [dist3]: 'GENERAL_CALCULATION_SLIP'
          }
        };
      },
      () => {
        // Polynomial Derivative
        const a = randInt(2, 6);
        const n = randInt(2, 4);
        const b = randInt(1, 9);
        const derivA = a * n;
        const newPower = n - 1;
        const powStr = newPower === 1 ? 'x' : `x^${newPower}`;

        const correct = `f'(x) = ${derivA}${powStr} + ${b}`;
        const dist1 = `f'(x) = ${a}${powStr} + ${b}`; // Forgot to multiply by power
        const dist2 = `f'(x) = ${derivA}x^${n} + ${b}`; // Forgot to reduce exponent
        const dist3 = `f'(x) = ${derivA}${powStr}`; // Lost constant term x

        return {
          id: `gen-high-calc-${Date.now()}-${randInt(100, 999)}`,
          question: `Compute the derivative:  f(x) = ${a}x^${n} + ${b}x - 7`,
          visualType: 'tangent-slope' as const,
          visualData: { a, n, b },
          options: shuffle([correct, dist1, dist2, dist3]),
          correctAnswer: correct,
          hint: 'Apply the Power Rule: d/dx [c·x^n] = c·n·x^(n-1), and the derivative of a constant is 0.',
          explanation: `Using the power rule: d/dx [${a}x^${n}] = ${derivA}${powStr}, d/dx [${b}x] = ${b}, and d/dx [-7] = 0. Therefore f'(x) = ${derivA}${powStr} + ${b}.`,
          manipulativeHint: 'Explore the Tangent-Line Visualizer to observe how secant slopes approach the derivative.',
          irtParameters: { discrimination: 1.8, difficulty: 1.6 + (theta * 0.25), pseudoGuessing: 0.25 },
          standardCode: 'AP.CALC.CHA.2',
          topicDomain: 'Calculus & Instantaneous Rates',
          distractorDiagnostics: {
            [dist1]: 'DISTRIBUTIVE_OMISSION',
            [dist2]: 'ORDER_OF_OPERATIONS',
            [dist3]: 'RECIPROCAL_MISAPPLIED'
          }
        };
      },
      () => {
        // Trigonometric Unit Circle Value
        const trigItems = [
          { q: 'sin(π/6) or sin(30°)', correct: '1/2', wrong: ['√3/2', '√2/2', '1'], disc: 'RECIPROCAL_MISAPPLIED' as MisconceptionCode },
          { q: 'cos(π/3) or cos(60°)', correct: '1/2', wrong: ['√3/2', '√2/2', '0'], disc: 'RECIPROCAL_MISAPPLIED' as MisconceptionCode },
          { q: 'sin(π/4) or sin(45°)', correct: '√2/2', wrong: ['1/2', '√3/2', '1'], disc: 'GENERAL_CALCULATION_SLIP' as MisconceptionCode },
          { q: 'cos(π) or cos(180°)', correct: '-1', wrong: ['1', '0', '-1/2'], disc: 'SIGN_ERROR' as MisconceptionCode },
          { q: 'tan(π/4) or tan(45°)', correct: '1', wrong: ['√3', '√3/3', '0'], disc: 'INVERTED_FRACTION' as MisconceptionCode }
        ];
        const item = pickRandom(trigItems);

        return {
          id: `gen-high-trig-${Date.now()}-${randInt(100, 999)}`,
          question: `Find the exact trigonometric value:  ${item.q} = ?`,
          visualType: 'unit-circle' as const,
          visualData: { query: item.q },
          options: shuffle([item.correct, ...item.wrong]),
          correctAnswer: item.correct,
          hint: 'Remember on the unit circle: x = cos(θ) and y = sin(θ).',
          explanation: `At this standard angle on the unit circle, the coordinates are well-defined. The exact value is ${item.correct}.`,
          manipulativeHint: 'Slide to this angle on the Unit Circle Explorer to see the horizontal and vertical projection legs.',
          irtParameters: { discrimination: 1.5, difficulty: 1.3, pseudoGuessing: 0.25 },
          standardCode: 'CCSS.MATH.HSF.TF.3',
          topicDomain: 'Trigonometric Functions & Unit Circle',
          distractorDiagnostics: {
            [item.wrong[0]]: item.disc,
            [item.wrong[1]]: 'GENERAL_CALCULATION_SLIP',
            [item.wrong[2]]: 'SIGN_ERROR'
          }
        };
      }
    ];

    return pickRandom(generators)();
  }
}

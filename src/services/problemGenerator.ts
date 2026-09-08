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

/** A wrong answer, and the misconception a learner choosing it would be showing. */
export interface Distractor {
  value: string;
  code: MisconceptionCode;
}

/**
 * Builds the four options and their diagnostics from a correct answer and an
 * ordered list of candidate distractors.
 *
 * Every variant used to assemble its own options inline, and each one had the
 * same latent bug: a distractor formula that collides with the correct answer,
 * or with another distractor, for some corner of its parameter range. A bond to
 * 5 where the missing part is 1 offered "1" twice, one of them marked correct.
 * A 6m by 3m garden has an area of 18 and a perimeter of 18. 18 x 9 makes the
 * "added instead of multiplied" and "dropped the ones place" errors land on the
 * same number. Each was individually rare and collectively constant.
 *
 * Candidates are taken in order, skipping any that duplicate the correct answer
 * or one already taken, until three are held. Callers pass more candidates than
 * they need so that skipping one still leaves a full question.
 *
 * Throws rather than returning a short list: a question with three options is a
 * pedagogical defect, not a rendering edge case, and the generator is called
 * from the practice loop where there is nothing sensible to fall back to.
 */
export function assembleOptions(
  correct: string,
  candidates: Distractor[],
): { options: string[]; distractorDiagnostics: Record<string, MisconceptionCode> } {
  const chosen: Distractor[] = [];
  const taken = new Set<string>([correct]);

  for (const candidate of candidates) {
    if (chosen.length === 3) break;
    if (taken.has(candidate.value)) continue;
    taken.add(candidate.value);
    chosen.push(candidate);
  }

  if (chosen.length < 3) {
    throw new Error(
      `assembleOptions could only find ${chosen.length} distinct distractors for ${JSON.stringify(correct)}; ` +
        `candidates were ${JSON.stringify(candidates.map(c => c.value))}`,
    );
  }

  const distractorDiagnostics: Record<string, MisconceptionCode> = {};
  for (const { value, code } of chosen) distractorDiagnostics[value] = code;

  return {
    options: shuffle([correct, ...chosen.map(c => c.value)]),
    distractorDiagnostics,
  };
}

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

          return {
            id: `gen-early-bond-${Date.now()}-${randInt(100, 999)}`,
            question: `You have ${a} bright stars ⭐ in your basket. How many more do you need to make ${total} stars in total?`,
            visualType: 'ten-frame' as const,
            visualData: { filled: a, target: total, color: 'indigo' },
            ...assembleOptions(correct, [
              { value: (b + 1).toString(), code: 'OFF_BY_ONE_COUNTING' },
              { value: (b - 1).toString(), code: 'OFF_BY_ONE_COUNTING' },
              { value: total.toString(), code: 'GENERAL_CALCULATION_SLIP' },
              // Held back for when the part is 1 and `b - 1` would be zero, or
              // when the part is the whole and `b + 1` overshoots the frame.
              { value: (b + 2).toString(), code: 'OFF_BY_ONE_COUNTING' },
              { value: a.toString(), code: 'GENERAL_CALCULATION_SLIP' },
            ]),
            correctAnswer: correct,
            hint: `Start at ${a} and count forward up to ${total} on your fingers!`,
            explanation: `${a} + ${b} = ${total}. We need ${b} more stars to complete the set of ${total}.`,
            manipulativeHint: 'Use the Ten-Frame Counter to see the empty slots!',
            irtParameters: { discrimination: 1.1, difficulty: theta > -0.5 ? -0.8 : -1.8, pseudoGuessing: 0.25 },
            standardCode: 'CCSS.MATH.PK.OA.1',
            topicDomain: 'Number Bonds & Compositions'
          };
        } else {
          // Direct addition
          const sum = a + b;
          const correct = sum.toString();

          return {
            id: `gen-early-add-${Date.now()}-${randInt(100, 999)}`,
            question: `What is ${a} apples 🍎 plus ${b} more apples 🍎?`,
            visualType: 'apples' as const,
            visualData: { count: sum, red: a, green: b },
            ...assembleOptions(correct, [
              { value: (sum + 1).toString(), code: 'OFF_BY_ONE_COUNTING' },
              { value: (sum - 1).toString(), code: 'OFF_BY_ONE_COUNTING' },
              { value: Math.abs(a - b).toString(), code: 'SIGN_ERROR' },
              // `|a - b|` is 0 when the two groups are equal, and 1 when they
              // differ by one, either of which can collide with the pair above.
              { value: (sum + 2).toString(), code: 'OFF_BY_ONE_COUNTING' },
            ]),
            correctAnswer: correct,
            hint: `Count the first group of ${a}, then keep counting ${b} more!`,
            explanation: `${a} + ${b} equals ${sum} delicious apples in all!`,
            manipulativeHint: 'Tap each apple one by one to count them.',
            irtParameters: { discrimination: 1.0, difficulty: -1.5, pseudoGuessing: 0.25 },
            standardCode: 'CCSS.MATH.K.OA.2',
            topicDomain: 'Early Addition Concepts'
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
          ...assembleOptions(correct, [
            // The first wrong symbol is always the one the pattern just used,
            // which is what a learner reading the rhythm one step out would pick.
            { value: w1, code: 'OFF_BY_ONE_COUNTING' },
            { value: w2, code: 'GENERAL_CALCULATION_SLIP' },
            { value: w3, code: 'GENERAL_CALCULATION_SLIP' },
          ]),
          correctAnswer: correct,
          hint: 'Say the symbols out loud from the beginning to hear the rhythm!',
          explanation: `The repeating pattern repeats regularly. The next symbol is ${correct}!`,
          manipulativeHint: 'Listen to the repeating sound pattern.',
          irtParameters: { discrimination: 1.2, difficulty: -1.3, pseudoGuessing: 0.25 },
          standardCode: 'CCSS.MATH.PK.G.1',
          topicDomain: 'Algebraic Thinking & Patterns'
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

        return {
          id: `gen-elem-frac-${Date.now()}-${randInt(100, 999)}`,
          question: `Which fraction is strictly equivalent to ${baseNum}/${baseDenom}?`,
          visualType: 'fraction-pizza' as const,
          visualData: { numerator: baseNum, denominator: baseDenom, comparisonNumerator: eqNum, comparisonDenominator: eqDenom },
          ...assembleOptions(correct, [
            { value: `${eqNum + 1}/${eqDenom}`, code: 'OFF_BY_ONE_COUNTING' },
            { value: `${eqDenom}/${eqNum}`, code: 'INVERTED_FRACTION' },
            { value: `${baseNum}/${eqDenom}`, code: 'DISTRIBUTIVE_OMISSION' },
            { value: `${eqNum}/${eqDenom + 1}`, code: 'DISTRIBUTIVE_OMISSION' },
          ]),
          correctAnswer: correct,
          hint: `Multiply both the top (numerator) and bottom (denominator) by ${multiplier}!`,
          explanation: `Multiplying both numerator and denominator by ${multiplier} gives ${eqNum}/${eqDenom}, which represents the exact same portion of the whole.`,
          manipulativeHint: 'Check the Fraction Pizza Lab to see the slices match in size!',
          irtParameters: { discrimination: 1.3, difficulty: -0.2 + (theta * 0.3), pseudoGuessing: 0.25 },
          standardCode: 'CCSS.MATH.4.NF.1',
          topicDomain: 'Fractions & Equivalence'
        };
      },
      () => {
        // Two-digit Multiplication / Regrouping
        const a = randInt(12, 45);
        const b = randInt(3, 9);
        const product = a * b;

        const correct = product.toString();

        return {
          id: `gen-elem-mult-${Date.now()}-${randInt(100, 999)}`,
          question: `Calculate: ${a} × ${b} = ?`,
          visualType: 'grid-array' as const,
          visualData: { rows: b, cols: a },
          ...assembleOptions(correct, [
            { value: (product + b).toString(), code: 'ADDITIVE_INSTEAD_OF_MULTIPLICATIVE' },
            { value: (product - 10).toString(), code: 'GENERAL_CALCULATION_SLIP' },
            // Dropping the ones place. Coincides with `product + b` at 18 x 9,
            // the one point in this range where 10a - b = ab + b.
            { value: (a * 10 - b).toString(), code: 'DISTRIBUTIVE_OMISSION' },
            { value: (Math.floor(a / 10) * 10 * b).toString(), code: 'DISTRIBUTIVE_OMISSION' },
          ]),
          correctAnswer: correct,
          hint: `Break ${a} into tens and ones: (${Math.floor(a / 10) * 10} × ${b}) + (${a % 10} × ${b}).`,
          explanation: `${a} × ${b} = (${Math.floor(a / 10) * 10} × ${b}) + (${a % 10} × ${b}) = ${Math.floor(a / 10) * 10 * b} + ${a % 10 * b} = ${product}.`,
          manipulativeHint: 'Use Base-10 blocks to represent the groups.',
          irtParameters: { discrimination: 1.2, difficulty: 0.0 + (theta * 0.2), pseudoGuessing: 0.25 },
          standardCode: 'CCSS.MATH.4.NBT.5',
          topicDomain: 'Multi-Digit Operations & Place Value'
        };
      },
      () => {
        // Area and Perimeter
        const length = randInt(5, 12);
        const width = randInt(3, 8);
        const area = length * width;
        const perimeter = 2 * (length + width);

        const correct = `${area} sq units`;

        return {
          id: `gen-elem-geom-${Date.now()}-${randInt(100, 999)}`,
          question: `A garden has length ${length} m and width ${width} m. What is its total area?`,
          visualType: 'coordinate' as const,
          visualData: { length, width },
          ...assembleOptions(correct, [
            // Perimeter for area is the error this item exists to detect — but a
            // 6m by 3m garden has 18 of each, so it cannot always be offered.
            { value: `${perimeter} sq units`, code: 'ADDITIVE_INSTEAD_OF_MULTIPLICATIVE' },
            { value: `${area + length} sq units`, code: 'OFF_BY_ONE_COUNTING' },
            { value: `${length + width} sq units`, code: 'DISTRIBUTIVE_OMISSION' },
            { value: `${area + width} sq units`, code: 'OFF_BY_ONE_COUNTING' },
          ]),
          correctAnswer: correct,
          hint: 'Area is the space inside: Area = length × width.',
          explanation: `Area = ${length} × ${width} = ${area} square meters. (Perimeter would be 2 × (${length} + ${width}) = ${perimeter} m).`,
          manipulativeHint: 'Count the unit tiles filling the garden rectangle.',
          irtParameters: { discrimination: 1.4, difficulty: -0.1, pseudoGuessing: 0.25 },
          standardCode: 'CCSS.MATH.3.MD.7',
          topicDomain: 'Geometric Measurement & Area'
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

        // Solving `ax - b = c` instead of `ax + b = c`. Offered only when it
        // lands on an integer: the previous `Math.round` turned a non-integer
        // into a whole number that no misapplied sign rule produces, so the
        // option looked like a diagnosis and was arithmetic noise.
        const invertedB = (c + b) / a;
        const signErrorOnB = Number.isInteger(invertedB) ? `x = ${invertedB}` : null;

        // `+ 0` reads as a term the learner must account for, so an absent
        // constant is rendered as absent rather than as zero.
        const constantTerm = b === 0 ? '' : b > 0 ? ` + ${b}` : ` - ${Math.abs(b)}`;

        return {
          id: `gen-mid-linear-${Date.now()}-${randInt(100, 999)}`,
          question: `Solve for x: ${a}x${constantTerm} = ${c}`,
          visualType: 'balance-scale' as const,
          visualData: { a, b, c, x: xVal },
          ...assembleOptions(correct, [
            { value: `x = ${-xVal}`, code: 'SIGN_ERROR' },
            ...(signErrorOnB ? [{ value: signErrorOnB, code: 'SIGN_ERROR' as MisconceptionCode }] : []),
            { value: `x = ${xVal + 1}`, code: 'OFF_BY_ONE_COUNTING' },
            { value: `x = ${xVal - 1}`, code: 'OFF_BY_ONE_COUNTING' },
            { value: `x = ${xVal + 2}`, code: 'OFF_BY_ONE_COUNTING' },
          ]),
          correctAnswer: correct,
          hint: `First, isolate the term with x by doing the opposite of ${b >= 0 ? `adding ${b}` : `subtracting ${Math.abs(b)}`} on both sides!`,
          explanation: `Step 1: ${a}x = ${c} - (${b}) = ${c - b}. Step 2: Divide both sides by ${a}: x = ${c - b} / ${a} = ${xVal}.`,
          manipulativeHint: 'Think of a balance scale: whatever you do to one side, you must do to the other.',
          irtParameters: { discrimination: 1.5, difficulty: 0.5 + (theta * 0.3), pseudoGuessing: 0.25 },
          standardCode: 'CCSS.MATH.7.EE.4',
          topicDomain: 'Linear Equations & Expressions'
        };
      },
      () => {
        // Negative Number Operations & Zero-pairs
        const p = randInt(-15, -2);
        const q = randInt(3, 14);
        const sum = p + q;

        const correct = sum.toString();

        return {
          id: `gen-mid-integers-${Date.now()}-${randInt(100, 999)}`,
          question: `Evaluate the integer sum: (${p}) + (${q}) = ?`,
          visualType: 'balance-scale' as const,
          visualData: { left: p, right: q },
          ...assembleOptions(correct, [
            // Ignoring the sign and adding magnitudes. This used to be written
            // `-(|p| + q)`, which for a negative p is exactly `p - q` — the same
            // number as the option below it, so every one of these questions
            // offered a duplicate and only three real choices.
            { value: (Math.abs(p) + q).toString(), code: 'ADDITIVE_INSTEAD_OF_MULTIPLICATIVE' },
            { value: (-sum).toString(), code: 'SIGN_ERROR' },
            { value: (p - q).toString(), code: 'ORDER_OF_OPERATIONS' },
            { value: (sum + 1).toString(), code: 'OFF_BY_ONE_COUNTING' },
          ]),
          correctAnswer: correct,
          hint: 'Think of zero-pairs or temperatures. Does the positive or negative number have greater absolute value?',
          explanation: `Starting at ${p} on a number line and moving ${q} units to the right lands at ${sum}. Zero-pairs cancel out to leave ${sum}.`,
          manipulativeHint: 'Cancel out pairs of (+1) and (-1) until only the remainder is left.',
          irtParameters: { discrimination: 1.3, difficulty: 0.2, pseudoGuessing: 0.25 },
          standardCode: 'CCSS.MATH.7.NS.1',
          topicDomain: 'The Number System & Integers'
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

        /**
         * A rational in lowest terms, with the sign always on the numerator.
         *
         * The previous version interpolated the raw numerator and denominator,
         * so a slope of -1 could be rendered `1/-1` — a different string from
         * `-1` and the same number. Both were offered as options on the same
         * question, and a learner picking the one the generator had not labelled
         * correct was right and marked wrong.
         */
        const asFraction = (numerator: number, denominator: number): string => {
          const sign = denominator < 0 ? -1 : 1;
          const n = numerator * sign;
          const d = denominator * sign;
          const div = gcd(n, d) || 1;
          const reducedN = n / div;
          const reducedD = d / div;
          return reducedD === 1 ? `${reducedN}` : `${reducedN}/${reducedD}`;
        };

        const slopeStr = asFraction(dy, dx);

        const correct = `m = ${slopeStr}`;

        return {
          id: `gen-mid-slope-${Date.now()}-${randInt(100, 999)}`,
          question: `Find the slope (m) of the line passing through points (${x1}, ${y1}) and (${x2}, ${y2}).`,
          visualType: 'coordinate' as const,
          visualData: { x1, y1, x2, y2 },
          ...assembleOptions(correct, [
            // Run over rise. dy is never 0 in this generator, so this is always
            // defined, but it equals the slope itself when the line is y = x.
            { value: `m = ${asFraction(dx, dy)}`, code: 'COORDINATE_AXIS_SWAP' },
            { value: `m = ${asFraction(-dy, dx)}`, code: 'SIGN_ERROR' },
            { value: `m = ${asFraction(dy + dx, dx)}`, code: 'GENERAL_CALCULATION_SLIP' },
            { value: `m = ${asFraction(dy, dx + 1)}`, code: 'GENERAL_CALCULATION_SLIP' },
          ]),
          correctAnswer: correct,
          hint: 'Slope is Rise over Run: m = (y2 - y1) / (x2 - x1).',
          explanation: `m = (${y2} - ${y1}) / (${x2} - ${x1}) = ${dy} / ${dx} = ${slopeStr}.`,
          manipulativeHint: 'Check the rise (vertical change) and run (horizontal change) on the Coordinate Grapher.',
          irtParameters: { discrimination: 1.6, difficulty: 0.8 + (theta * 0.2), pseudoGuessing: 0.25 },
          standardCode: 'CCSS.MATH.8.EE.6',
          topicDomain: 'Linear Functions & Slope'
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

        // Terms are collected and joined rather than interpolated into a fixed
        // template: when a coefficient was zero the template left its slot empty
        // and the learner read `x²  - 25 = 0`, with a gap where a term had
        // silently vanished.
        const terms = ['x²'];
        if (bCoeff !== 0) {
          const magnitude = Math.abs(bCoeff) === 1 ? '' : Math.abs(bCoeff);
          terms.push(`${bCoeff > 0 ? '+' : '-'} ${magnitude}x`);
        }
        if (cConst !== 0) terms.push(`${cConst > 0 ? '+' : '-'} ${Math.abs(cConst)}`);

        /**
         * Roots in ascending order, so a solution set has one spelling.
         * `x = 5, x = -5` and `x = -5, x = 3` name the same pair of solutions
         * when the roots are symmetric, and offering both as separate options
         * made one of two identical answers wrong.
         */
        const rootSet = (a: number, b: number): string => {
          const [low, high] = a <= b ? [a, b] : [b, a];
          return `x = ${low}, x = ${high}`;
        };

        const correct = rootSet(r1, r2);

        return {
          id: `gen-high-quad-${Date.now()}-${randInt(100, 999)}`,
          question: `Find the real solutions for the quadratic equation: ${terms.join(' ')} = 0`,
          visualType: 'coordinate' as const,
          visualData: { roots: [r1, r2], a: 1, b: bCoeff, c: cConst },
          ...assembleOptions(correct, [
            // A root of 0 negates to itself, so the sign variants collapse onto
            // each other and onto the answer whenever r2 is 0. The slip
            // variants below are what keep the question at four options there.
            { value: rootSet(-r1, -r2), code: 'SIGN_ERROR' },
            { value: rootSet(r1, -r2), code: 'SIGN_ERROR' },
            { value: rootSet(-r1, r2), code: 'SIGN_ERROR' },
            { value: rootSet(r1 + 1, r2 - 1), code: 'GENERAL_CALCULATION_SLIP' },
            { value: rootSet(r1 - 1, r2 + 1), code: 'GENERAL_CALCULATION_SLIP' },
            { value: rootSet(r1 + 1, r2), code: 'GENERAL_CALCULATION_SLIP' },
            { value: rootSet(r1, r2 - 1), code: 'GENERAL_CALCULATION_SLIP' },
            { value: rootSet(r1 + 2, r2 + 2), code: 'GENERAL_CALCULATION_SLIP' },
          ]),
          correctAnswer: correct,
          hint: 'Look for two numbers that multiply to the constant term and add up to the coefficient of x.',
          explanation: `Factoring: (x - ${r1})(x - ${r2}) = 0. Setting each factor to zero yields x = ${r1} and x = ${r2}.`,
          manipulativeHint: 'The solutions correspond to the x-intercepts of the parabola.',
          irtParameters: { discrimination: 1.7, difficulty: 1.2 + (theta * 0.3), pseudoGuessing: 0.25 },
          standardCode: 'CCSS.MATH.HSA.REI.4',
          topicDomain: 'Quadratic Equations & Roots'
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

        return {
          id: `gen-high-calc-${Date.now()}-${randInt(100, 999)}`,
          question: `Compute the derivative: f(x) = ${a}x^${n} + ${b}x - 7`,
          visualType: 'tangent-slope' as const,
          visualData: { a, n, b },
          ...assembleOptions(correct, [
            { value: `f'(x) = ${a}${powStr} + ${b}`, code: 'DISTRIBUTIVE_OMISSION' },
            { value: `f'(x) = ${derivA}x^${n} + ${b}`, code: 'ORDER_OF_OPERATIONS' },
            { value: `f'(x) = ${derivA}${powStr}`, code: 'RECIPROCAL_MISAPPLIED' },
            { value: `f'(x) = ${a}x^${n} + ${b}`, code: 'DISTRIBUTIVE_OMISSION' },
          ]),
          correctAnswer: correct,
          hint: 'Apply the Power Rule: d/dx [c·x^n] = c·n·x^(n-1), and the derivative of a constant is 0.',
          explanation: `Using the power rule: d/dx [${a}x^${n}] = ${derivA}${powStr}, d/dx [${b}x] = ${b}, and d/dx [-7] = 0. Therefore f'(x) = ${derivA}${powStr} + ${b}.`,
          manipulativeHint: 'Explore the Tangent-Line Visualizer to observe how secant slopes approach the derivative.',
          irtParameters: { discrimination: 1.8, difficulty: 1.6 + (theta * 0.25), pseudoGuessing: 0.25 },
          standardCode: 'AP.CALC.CHA.2',
          topicDomain: 'Calculus & Instantaneous Rates'
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
          question: `Find the exact trigonometric value: ${item.q} = ?`,
          visualType: 'unit-circle' as const,
          visualData: { query: item.q },
          ...assembleOptions(item.correct, [
            { value: item.wrong[0], code: item.disc },
            { value: item.wrong[1], code: 'GENERAL_CALCULATION_SLIP' },
            { value: item.wrong[2], code: 'SIGN_ERROR' },
          ]),
          correctAnswer: item.correct,
          hint: 'Remember on the unit circle: x = cos(θ) and y = sin(θ).',
          explanation: `At this standard angle on the unit circle, the coordinates are well-defined. The exact value is ${item.correct}.`,
          manipulativeHint: 'Slide to this angle on the Unit Circle Explorer to see the horizontal and vertical projection legs.',
          irtParameters: { discrimination: 1.5, difficulty: 1.3, pseudoGuessing: 0.25 },
          standardCode: 'CCSS.MATH.HSF.TF.3',
          topicDomain: 'Trigonometric Functions & Unit Circle'
        };
      }
    ];

    return pickRandom(generators)();
  }
}

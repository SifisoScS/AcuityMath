import { MathLesson, AgeTier } from '../types';

export const AGE_TIER_META: Record<AgeTier, {
  label: string;
  ageRange: string;
  badgeColor: string;
  icon: string;
  theme: string;
  tagline: string;
}> = {
  early: {
    label: 'Early Sprouts',
    ageRange: 'Ages 3–6',
    badgeColor: 'bg-emerald-100 text-emerald-800 border-emerald-300',
    icon: '🌱',
    theme: 'emerald',
    tagline: 'Playful counting, shapes, and colorful sensory math!'
  },
  elementary: {
    label: 'Math Navigators',
    ageRange: 'Ages 7–10',
    badgeColor: 'bg-sky-100 text-sky-800 border-sky-300',
    icon: '🚀',
    theme: 'sky',
    tagline: 'Multiplication quests, pizza fractions, and spatial puzzles.'
  },
  middle: {
    label: 'Algebra Voyagers',
    ageRange: 'Ages 11–14',
    badgeColor: 'bg-indigo-100 text-indigo-800 border-indigo-300',
    icon: '⚡',
    theme: 'indigo',
    tagline: 'Linear equations, coordinate planes, ratios & logic.'
  },
  high: {
    label: 'STEM Pioneers',
    ageRange: 'Ages 15–18',
    badgeColor: 'bg-purple-100 text-purple-800 border-purple-300',
    icon: '🌌',
    theme: 'purple',
    tagline: 'Advanced quadratics, calculus derivatives, and trig modeling.'
  }
};

export const INITIAL_LESSONS: MathLesson[] = [
  // TIER 1: EARLY (Ages 3-6)
  {
    id: 'lesson-early-1',
    title: 'Counting Sweet Apples',
    description: 'Tap and count the colorful apples in the basket! Learn numbers up to 5.',
    tier: 'early',
    topic: 'Counting & Number Sense',
    recommendedAge: 'Ages 3–5',
    difficultyLevel: 1,
    iconName: 'Apple',
    estimatedMinutes: 5,
    xpReward: 60,
    coinReward: 15,
    problems: [
      {
        id: 'p-e1-1',
        tier: 'early',
        topic: 'Counting',
        title: 'Count the Red Apples',
        question: 'How many red apples do you see on the screen? Tap them one by one!',
        audioPrompt: 'How many red apples do you see? Count along with me!',
        visualType: 'counters',
        visualData: {
          itemType: 'apple',
          initialCount: 3,
          targetCount: 3
        },
        options: ['2', '3', '5'],
        correctAnswer: '3',
        explanation: 'Great job! 1, 2, 3 delicious red apples!',
        hint: 'Tap each apple on the canvas to count them out loud.',
        difficulty: 1
      },
      {
        id: 'p-e1-2',
        tier: 'early',
        topic: 'Addition',
        title: 'Add One More Apple',
        question: 'We have 2 apples, and we pick 1 more. How many apples in total?',
        audioPrompt: 'We have two apples, and pick one more. How many apples now?',
        visualType: 'counters',
        visualData: {
          itemType: 'apple',
          initialCount: 2,
          targetCount: 3
        },
        options: ['3', '4', '1'],
        correctAnswer: '3',
        explanation: '2 apples plus 1 apple equals 3 apples! Super counting!',
        hint: 'Start with 2 and count 1 more: 2... 3!',
        difficulty: 2
      },
      {
        id: 'p-e1-3',
        tier: 'early',
        topic: 'Counting',
        title: 'Five Bright Stars',
        question: 'Can you count all 5 glowing stars in the sky?',
        audioPrompt: 'Count all five glowing stars in the night sky!',
        visualType: 'counters',
        visualData: {
          itemType: 'star',
          initialCount: 5,
          targetCount: 5
        },
        options: ['4', '5', '6'],
        correctAnswer: '5',
        explanation: 'You found all 5 glowing stars! You are a star explorer!',
        hint: 'Tap each star: 1, 2, 3, 4, 5!',
        difficulty: 2
      }
    ]
  },
  {
    id: 'lesson-early-2',
    title: 'Shape Safari Explorer',
    description: 'Discover circles, triangles, squares, and hexagons in our playful shape safari!',
    tier: 'early',
    topic: 'Geometry & Shapes',
    recommendedAge: 'Ages 4–6',
    difficultyLevel: 2,
    iconName: 'Shapes',
    estimatedMinutes: 6,
    xpReward: 75,
    coinReward: 20,
    problems: [
      {
        id: 'p-e2-1',
        tier: 'early',
        topic: 'Shapes',
        title: 'Find the Triangle',
        question: 'Which shape has exactly 3 pointy corners and 3 straight sides?',
        audioPrompt: 'Which shape has three pointy corners and three straight sides?',
        visualType: 'shapes',
        visualData: {
          shapeType: 'triangle'
        },
        options: ['Triangle', 'Circle', 'Square'],
        correctAnswer: 'Triangle',
        explanation: 'A triangle has 3 sides and 3 corners, just like a slice of pizza!',
        hint: 'Count the corners: one, two, three!',
        difficulty: 2
      },
      {
        id: 'p-e2-2',
        tier: 'early',
        topic: 'Shapes',
        title: 'Count Corners on a Square',
        question: 'How many equal sides and corners does a square have?',
        audioPrompt: 'How many sides and corners does a shiny square have?',
        visualType: 'shapes',
        visualData: {
          shapeType: 'square'
        },
        options: ['3', '4', '5'],
        correctAnswer: '4',
        explanation: 'A square has 4 equal sides and 4 square corners!',
        hint: 'Think of a picture frame or a square cracker.',
        difficulty: 2
      }
    ]
  },

  // TIER 2: ELEMENTARY (Ages 7-10)
  {
    id: 'lesson-elem-1',
    title: 'Visual Fraction Slices',
    description: 'Master fractions visually! Slice pizzas and bars to understand halves, thirds, and fourths.',
    tier: 'elementary',
    topic: 'Fractions & Decimals',
    recommendedAge: 'Ages 8–10',
    difficultyLevel: 3,
    iconName: 'PieChart',
    estimatedMinutes: 8,
    xpReward: 90,
    coinReward: 25,
    problems: [
      {
        id: 'p-elem1-1',
        tier: 'elementary',
        topic: 'Fractions',
        title: 'Identify the Fraction',
        question: 'The bar is divided into 4 equal segments, and 3 segments are shaded. What fraction is shaded?',
        audioPrompt: 'A bar is divided into four equal pieces, and three pieces are shaded. What is the fraction?',
        visualType: 'fraction_bar',
        visualData: {
          fractions: { numerator: 3, denominator: 4 }
        },
        options: ['3/4', '1/4', '2/3', '4/3'],
        correctAnswer: '3/4',
        explanation: 'Numerator (top) = 3 shaded parts. Denominator (bottom) = 4 total parts. So 3/4!',
        hint: 'Count shaded parts for the top number, and total parts for the bottom number.',
        difficulty: 3
      },
      {
        id: 'p-elem1-2',
        tier: 'elementary',
        topic: 'Fractions',
        title: 'Equivalent Fractions',
        question: 'Which fraction is equivalent to 1/2?',
        audioPrompt: 'Which of the following fractions has the exact same value as one half?',
        visualType: 'fraction_bar',
        visualData: {
          fractions: { numerator: 2, denominator: 4 },
          equivalentTarget: '1/2'
        },
        options: ['2/4', '2/5', '1/3', '3/8'],
        correctAnswer: '2/4',
        explanation: 'If you multiply the top and bottom of 1/2 by 2, you get 2/4. Both represent half!',
        hint: 'Think of cutting each half into two pieces: 1 out of 2 becomes 2 out of 4.',
        difficulty: 4
      },
      {
        id: 'p-elem1-3',
        tier: 'elementary',
        topic: 'Word Problem',
        title: 'Baker Leo’s Pies',
        question: 'Leo baked a pie cut into 8 equal slices. His family ate 5 slices. What fraction of the pie is remaining?',
        audioPrompt: 'A pie was sliced into eight equal pieces. If five slices were eaten, what fraction remains?',
        visualType: 'fraction_bar',
        visualData: {
          fractions: { numerator: 3, denominator: 8 }
        },
        options: ['3/8', '5/8', '2/8', '1/8'],
        correctAnswer: '3/8',
        explanation: '8 total slices - 5 eaten slices = 3 slices left. That gives 3/8 remaining.',
        hint: 'Subtract 5 from 8 to find the remaining slices.',
        difficulty: 4
      }
    ]
  },
  {
    id: 'lesson-elem-2',
    title: 'Rapid Multiplication Arrays',
    description: 'Uncover multiplication patterns using 2D visual grid arrays and quick-thinking challenges.',
    tier: 'elementary',
    topic: 'Multiplication & Division',
    recommendedAge: 'Ages 7–9',
    difficultyLevel: 3,
    iconName: 'Grid',
    estimatedMinutes: 7,
    xpReward: 85,
    coinReward: 20,
    problems: [
      {
        id: 'p-elem2-1',
        tier: 'elementary',
        topic: 'Multiplication',
        title: '6 by 7 Grid Array',
        question: 'What is the product of 6 × 7?',
        audioPrompt: 'What is six multiplied by seven?',
        visualType: 'equation',
        visualData: { formula: '6 \\times 7 = ?' },
        options: ['42', '36', '48', '40'],
        correctAnswer: '42',
        explanation: '6 groups of 7 = 42. Remember 6 × 6 = 36, plus another 6 = 42!',
        hint: 'Think: 6 × 5 = 30, plus 6 × 2 = 12. 30 + 12 = ?',
        difficulty: 3
      },
      {
        id: 'p-elem2-2',
        tier: 'elementary',
        topic: 'Division',
        title: 'Equal Cookie Sharing',
        question: 'You have 36 cookies to divide equally into 4 gift boxes. How many cookies go in each box?',
        audioPrompt: 'Thirty-six cookies divided equally among four boxes gives how many cookies per box?',
        visualType: 'equation',
        visualData: { formula: '36 \\div 4 = ?' },
        options: ['9', '8', '7', '12'],
        correctAnswer: '9',
        explanation: '36 divided by 4 equals 9 cookies, since 9 × 4 = 36.',
        hint: 'What number multiplied by 4 gives 36?',
        difficulty: 3
      }
    ]
  },

  // TIER 3: MIDDLE (Ages 11-14)
  {
    id: 'lesson-mid-1',
    title: 'Linear Graphs & Slope-Intercept Form',
    description: 'Explore the coordinate plane! Master y = mx + b, slope calculation, and y-intercepts.',
    tier: 'middle',
    topic: 'Linear Equations & Graphing',
    recommendedAge: 'Ages 12–14',
    difficultyLevel: 5,
    iconName: 'TrendingUp',
    estimatedMinutes: 10,
    xpReward: 120,
    coinReward: 35,
    problems: [
      {
        id: 'p-mid1-1',
        tier: 'middle',
        topic: 'Slope-Intercept',
        title: 'Find the Slope',
        question: 'In the equation y = 3x - 5, what is the slope (m) of the line?',
        audioPrompt: 'In the linear equation y equals three x minus five, what is the slope of the line?',
        visualType: 'coordinate_plane',
        visualData: {
          slope: 3,
          intercept: -5,
          formula: 'y = 3x - 5'
        },
        options: ['3', '-5', '5', '1/3'],
        correctAnswer: '3',
        explanation: 'In the standard slope-intercept form y = mx + b, m represents the slope. Here m = 3.',
        hint: 'Look for the coefficient directly in front of the variable x.',
        difficulty: 5
      },
      {
        id: 'p-mid1-2',
        tier: 'middle',
        topic: 'Coordinate Plane',
        title: 'Find the Y-Intercept',
        question: 'Where does the line y = -2x + 4 cross the y-axis (the y-intercept)?',
        audioPrompt: 'At what coordinates does the line y equals negative two x plus four cross the y-axis?',
        visualType: 'coordinate_plane',
        visualData: {
          slope: -2,
          intercept: 4,
          formula: 'y = -2x + 4'
        },
        options: ['(0, 4)', '(4, 0)', '(0, -2)', '(-2, 4)'],
        correctAnswer: '(0, 4)',
        explanation: 'At the y-axis, x = 0. Substituting gives y = -2(0) + 4 = 4. The point is (0, 4).',
        hint: 'The y-intercept occurs when x is zero.',
        difficulty: 5
      },
      {
        id: 'p-mid1-3',
        tier: 'middle',
        topic: 'Multi-Step Equations',
        title: 'Solve for x',
        question: 'Solve for x in the equation: 4x - 7 = 21.',
        audioPrompt: 'Solve for x in the equation: four x minus seven equals twenty-one.',
        visualType: 'equation',
        visualData: { formula: '4x - 7 = 21' },
        options: ['x = 7', 'x = 3.5', 'x = 28', 'x = 5'],
        correctAnswer: 'x = 7',
        explanation: 'Step 1: Add 7 to both sides: 4x = 28. Step 2: Divide both sides by 4: x = 7.',
        hint: 'First isolate 4x by adding 7 to both sides of the equals sign.',
        difficulty: 6
      }
    ]
  },
  {
    id: 'lesson-mid-2',
    title: 'Integer Rules & Exponents',
    description: 'Tackle negative numbers, absolute values, and laws of exponents with confidence.',
    tier: 'middle',
    topic: 'Number Theory & Exponents',
    recommendedAge: 'Ages 11–13',
    difficultyLevel: 5,
    iconName: 'Zap',
    estimatedMinutes: 8,
    xpReward: 100,
    coinReward: 30,
    problems: [
      {
        id: 'p-mid2-1',
        tier: 'middle',
        topic: 'Negative Numbers',
        title: 'Multiplying Negatives',
        question: 'Calculate: (-6) × (-8)',
        audioPrompt: 'Calculate: negative six multiplied by negative eight.',
        visualType: 'equation',
        visualData: { formula: '(-6) \\times (-8) = ?' },
        options: ['48', '-48', '-14', '14'],
        correctAnswer: '48',
        explanation: 'The product of two negative numbers is always positive: (-) × (-) = (+). 6 × 8 = 48.',
        hint: 'Remember the sign rule: negative times negative equals positive.',
        difficulty: 5
      },
      {
        id: 'p-mid2-2',
        tier: 'middle',
        topic: 'Exponents',
        title: 'Exponent Product Rule',
        question: 'Simplify: 2^3 × 2^4',
        audioPrompt: 'Simplify: two to the third power multiplied by two to the fourth power.',
        visualType: 'equation',
        visualData: { formula: '2^3 \\times 2^4 = 2^?' },
        options: ['2^7 (128)', '2^12 (4096)', '4^7', '2^1'],
        correctAnswer: '2^7 (128)',
        explanation: 'When multiplying powers with the same base, add the exponents: 3 + 4 = 7. 2^7 = 128.',
        hint: 'Base is the same (2). Add the exponents 3 and 4.',
        difficulty: 5
      }
    ]
  },

  // TIER 4: HIGH SCHOOL (Ages 15-18)
  {
    id: 'lesson-high-1',
    title: 'Calculus: Power Rule & Tangents',
    description: 'Compute instantaneous rates of change using the fundamental derivative power rule.',
    tier: 'high',
    topic: 'Calculus & Derivatives',
    recommendedAge: 'Ages 16–18',
    difficultyLevel: 8,
    iconName: 'Activity',
    estimatedMinutes: 12,
    xpReward: 150,
    coinReward: 50,
    problems: [
      {
        id: 'p-high1-1',
        tier: 'high',
        topic: 'Derivatives',
        title: 'Power Rule Differentiation',
        question: 'Find the derivative f\'(x) of the function f(x) = 3x^4 - 5x^2 + 7.',
        audioPrompt: 'Find the derivative f prime of x of the function f of x equals three x to the fourth minus five x squared plus seven.',
        visualType: 'calculus_graph',
        visualData: {
          formula: 'f(x) = 3x^4 - 5x^2 + 7',
          derivative: 'f\'(x) = 12x^3 - 10x'
        },
        options: ['12x^3 - 10x', '12x^4 - 10x^2', '7x^3 - 10x', '12x^3 - 10x + 7'],
        correctAnswer: '12x^3 - 10x',
        explanation: 'Apply the power rule d/dx[x^n] = n*x^(n-1). d/dx[3x^4] = 12x^3; d/dx[-5x^2] = -10x; d/dx[7] = 0. Result: 12x^3 - 10x.',
        hint: 'Multiply the coefficient by the exponent, then decrease the exponent by 1. Constants differentiate to 0.',
        difficulty: 8
      },
      {
        id: 'p-high1-2',
        tier: 'high',
        topic: 'Tangent Slope',
        title: 'Slope of Tangent Line',
        question: 'Given f(x) = x^2 - 4x + 3, what is the instantaneous slope at x = 5?',
        audioPrompt: 'Given f of x equals x squared minus four x plus three, what is the instantaneous slope at x equals five?',
        visualType: 'calculus_graph',
        visualData: {
          formula: 'f(x) = x^2 - 4x + 3',
          derivative: 'f\'(x) = 2x - 4'
        },
        options: ['6', '8', '2', '10'],
        correctAnswer: '6',
        explanation: 'Step 1: Compute f\'(x) = 2x - 4. Step 2: Evaluate at x = 5: f\'(5) = 2(5) - 4 = 10 - 4 = 6.',
        hint: 'First find the derivative f\'(x), then plug in x = 5.',
        difficulty: 8
      },
      {
        id: 'p-high1-3',
        tier: 'high',
        topic: 'Critical Points',
        title: 'Locating Stationary Points',
        question: 'At which value of x does the parabola f(x) = x^2 - 6x + 8 have a horizontal tangent line (f\'(x) = 0)?',
        audioPrompt: 'At what value of x does f of x equals x squared minus six x plus eight have a horizontal tangent where f prime equals zero?',
        visualType: 'calculus_graph',
        visualData: {
          formula: 'f(x) = x^2 - 6x + 8',
          derivative: 'f\'(x) = 2x - 6'
        },
        options: ['x = 3', 'x = 6', 'x = -3', 'x = 0'],
        correctAnswer: 'x = 3',
        explanation: 'f\'(x) = 2x - 6. Set f\'(x) = 0: 2x - 6 = 0 => 2x = 6 => x = 3. This is the minimum vertex!',
        hint: 'Set the derivative 2x - 6 equal to zero and solve for x.',
        difficulty: 8
      }
    ]
  },
  {
    id: 'lesson-high-2',
    title: 'Quadratic Systems & Parabolas',
    description: 'Solve quadratics via factoring and the quadratic formula; analyze roots and vertices.',
    tier: 'high',
    topic: 'Algebra II & Quadratics',
    recommendedAge: 'Ages 15–17',
    difficultyLevel: 7,
    iconName: 'Target',
    estimatedMinutes: 10,
    xpReward: 135,
    coinReward: 40,
    problems: [
      {
        id: 'p-high2-1',
        tier: 'high',
        topic: 'Quadratics',
        title: 'Roots by Factoring',
        question: 'What are the real roots of x^2 - 5x + 6 = 0?',
        audioPrompt: 'What are the real roots of x squared minus five x plus six equals zero?',
        visualType: 'equation',
        visualData: { formula: 'x^2 - 5x + 6 = 0' },
        options: ['x = 2 and x = 3', 'x = -2 and x = -3', 'x = 1 and x = 6', 'x = -1 and x = 6'],
        correctAnswer: 'x = 2 and x = 3',
        explanation: 'Factor as (x - 2)(x - 3) = 0. Setting each factor to 0 gives x = 2 and x = 3.',
        hint: 'Find two numbers that multiply to +6 and add to -5.',
        difficulty: 7
      }
    ]
  }
];

export const INITIAL_ACHIEVEMENTS = [
  {
    id: 'ach-first-step',
    title: 'First Quantum Leap',
    description: 'Complete your first math lesson or problem set.',
    icon: '🎯',
    unlockedAt: '2026-09-01T10:00:00Z',
    category: 'mastery' as const,
    progress: 1,
    maxProgress: 1
  },
  {
    id: 'ach-streak-fire',
    title: 'Math Flame',
    description: 'Maintain an uninterrupted 3-day learning streak.',
    icon: '🔥',
    unlockedAt: '2026-09-04T12:00:00Z',
    category: 'streak' as const,
    progress: 3,
    maxProgress: 3
  },
  {
    id: 'ach-sharpshooter',
    title: 'Calculated Precision',
    description: 'Score 90% or higher accuracy across 20 consecutive problems.',
    icon: '🏹',
    category: 'accuracy' as const,
    progress: 16,
    maxProgress: 20
  },
  {
    id: 'ach-manipulative-pro',
    title: 'Tactile Explorer',
    description: 'Interact with 10 visual manipulatives (counters, bars, graphers).',
    icon: '🧩',
    category: 'creativity' as const,
    progress: 7,
    maxProgress: 10
  },
  {
    id: 'ach-speed-solver',
    title: 'Lightning Calculation',
    description: 'Solve 5 problems consecutively in dynamic adaptive overdrive.',
    icon: '⚡',
    category: 'mastery' as const,
    progress: 3,
    maxProgress: 5
  }
];

export const STORE_AVATARS = [
  { id: 'av-owl', name: 'Professor Archimedes', icon: '🦉', price: 0, unlocked: true, tier: 'early' },
  { id: 'av-fox', name: 'Nova the Swift Fox', icon: '🦊', price: 50, unlocked: true, tier: 'early' },
  { id: 'av-robot', name: 'Compute-O-Matic', icon: '🤖', price: 75, unlocked: true, tier: 'elementary' },
  { id: 'av-astronaut', name: 'Cosmo Vector', icon: '🧑‍🚀', price: 100, unlocked: false, tier: 'elementary' },
  { id: 'av-wizard', name: 'Archmage Euler', icon: '🧙‍♂️', price: 150, unlocked: false, tier: 'middle' },
  { id: 'av-dragon', name: 'Matrix Drake', icon: '🐉', price: 200, unlocked: false, tier: 'middle' },
  { id: 'av-einstein', name: 'Quantum Pioneer', icon: '⚛️', price: 250, unlocked: false, tier: 'high' },
  { id: 'av-phoenix', name: 'Infinitum Bird', icon: '🔥', price: 300, unlocked: false, tier: 'high' }
];

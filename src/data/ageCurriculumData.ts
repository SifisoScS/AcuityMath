import { AgeTier } from '../types';

export interface AgeCategoryDetail {
  id: AgeTier;
  title: string;
  subtitle: string;
  ageRange: string;
  ages: number[];
  icon: string;
  badgeClass: string;
  accentColor: string;
  borderClass: string;
  lightBg: string;
  heroGradient: string;
  headline: string;
  tagline: string;
  methodology: string;
  pedagogicalApproach: string;
  coreDomains: string[];
  keyFeatures: { title: string; desc: string }[];
  developmentalGoals: string[];
}

export interface AgeProfileData {
  age: number;
  tier: AgeTier;
  stageName: string;
  title: string;
  gradeLevel: string;
  subtitle: string;
  cognitiveFocus: string;
  milestones: string[];
  competencies: { name: string; target: string; desc: string }[];
  interactiveType:
    | 'counters'
    | 'shapes'
    | 'ten_frame'
    | 'bonds'
    | 'fraction_pizza'
    | 'multiplication_grid'
    | 'decimals'
    | 'area_perimeter'
    | 'integers'
    | 'expressions'
    | 'slope_line'
    | 'coordinate_points'
    | 'quadratic_curve'
    | 'trigonometry'
    | 'limits'
    | 'derivatives';
  interactiveTitle: string;
  interactiveInstructions: string;
  sampleChallenge: {
    question: string;
    options: string[];
    correctIndex: number;
    explanation: string;
    hint: string;
  };
  parentGuidance: string;
  educatorNotes: string;
  recommendedDailyMinutes: number;
}

export const CATEGORY_DETAILS: Record<AgeTier, AgeCategoryDetail> = {
  early: {
    id: 'early',
    title: 'Early Sprouts',
    subtitle: 'Sensory Counting, Playful Geometry & Tactile Number Sense',
    ageRange: 'Ages 3–6',
    ages: [3, 4, 5, 6],
    icon: '🌱',
    badgeClass: 'bg-emerald-100 text-emerald-800 border-emerald-300',
    accentColor: 'emerald',
    borderClass: 'border-emerald-200',
    lightBg: 'bg-emerald-50/50',
    heroGradient: 'from-emerald-900 via-teal-950 to-slate-900',
    headline: 'Where Play Sparks a Lifelong Love for Mathematics',
    tagline: 'Built specifically for curious young minds taking their very first mathematical steps.',
    methodology: 'Constructivist Sensory Play & Auditory Reinforcement',
    pedagogicalApproach:
      'Early Sprouts uses multisensory engagement—bold colors, cheerful voice prompts, tactile counter objects, and instant celebration feedback. Children do not memorize abstract numbers; they touch, hear, count, and manipulate them.',
    coreDomains: [
      'One-to-One Correspondence',
      'Tactile Counting to 20',
      'Spatial & Shape Recognition',
      'Ten-Frame Visualizations',
      'Pattern & Sorting Logic'
    ],
    keyFeatures: [
      {
        title: 'Tactile Stepper Counters',
        desc: 'Bouncing apples and twinkling stars children can tap to count with live Web Speech narration.'
      },
      {
        title: 'Shape Safari & Corner Geometry',
        desc: 'Explore circles, squares, and triangles with physical corner highlighting and side counting.'
      },
      {
        title: 'Ten-Frame Mental Math',
        desc: 'Interactive visual frames teaching subitizing—recognizing quantity at a glance without counting.'
      },
      {
        title: 'Gentle Zero-Penalty Reinforcement',
        desc: 'Confetti celebrations and uplifting audio praise with no negative scoring or timers.'
      }
    ],
    developmentalGoals: [
      'Confidently count quantities up to 20 with one-to-one correspondence',
      'Identify 2D geometric shapes and explain corner and edge attributes',
      'Recognize simple repeating patterns (AB, AAB, ABC)',
      'Understand intuitive addition as "putting together" and subtraction as "taking away"'
    ]
  },
  elementary: {
    id: 'elementary',
    title: 'Math Navigators',
    subtitle: 'Visual Fractions, Arithmetic Quests, Multiplication Grids & Decimals',
    ageRange: 'Ages 7–10',
    ages: [7, 8, 9, 10],
    icon: '🚀',
    badgeClass: 'bg-sky-100 text-sky-800 border-sky-300',
    accentColor: 'sky',
    borderClass: 'border-sky-200',
    lightBg: 'bg-sky-50/50',
    heroGradient: 'from-sky-950 via-indigo-950 to-slate-900',
    headline: 'Navigating Fractions, Multiplication Arrays & Spatial Puzzles',
    tagline: 'Bridging concrete manipulatives to structured conceptual problem-solving.',
    methodology: 'CPA Approach: Concrete → Pictorial → Abstract',
    pedagogicalApproach:
      'Math Navigators transforms potentially intimidating arithmetic into visual journeys. Rather than memorizing multiplication tables or fraction formulas blindly, students slice visual pizzas, assemble rectangular arrays, and explore decimal number lines.',
    coreDomains: [
      'Multi-Digit Arithmetic & Regrouping',
      'Visual Fractions & Equivalent Parts',
      'Multiplication Arrays & Rapid Recall',
      'Decimals & Percent Foundations',
      'Perimeter, Area & Spatial Measurement'
    ],
    keyFeatures: [
      {
        title: 'Canvas Fraction Pizza Laboratory',
        desc: 'Slice and shade whole pizzas into halves, thirds, fourths, sixths, and eighths with live percentage updates.'
      },
      {
        title: 'Multiplication Array Architect',
        desc: 'Manipulate row and column grids to visually grasp why 6 × 4 is identical to 4 × 6.'
      },
      {
        title: 'Decimal Currency & Number Lines',
        desc: 'Connect tenths and hundredths to real-world monetary systems and measurement scales.'
      },
      {
        title: 'Daily Streak Shields & Coin Quests',
        desc: 'Rewarding consistent daily practice with unlockable companion avatars and badges.'
      }
    ],
    developmentalGoals: [
      'Master fluently adding and subtracting multi-digit numbers with regrouping',
      'Understand fractions as parts of wholes and compare equivalent values visually',
      'Achieve instant automaticity with 1–12 multiplication and division facts',
      'Solve multi-step word problems involving measurement, time, and money'
    ]
  },
  middle: {
    id: 'middle',
    title: 'Algebra Voyagers',
    subtitle: 'Linear Equations, Cartesian Slopes, Ratios & Multi-Step Logic',
    ageRange: 'Ages 11–14',
    ages: [11, 12, 13, 14],
    icon: '⚡',
    badgeClass: 'bg-indigo-100 text-indigo-800 border-indigo-300',
    accentColor: 'indigo',
    borderClass: 'border-indigo-200',
    lightBg: 'bg-indigo-50/50',
    heroGradient: 'from-indigo-950 via-blue-950 to-slate-900',
    headline: 'Unlocking the Power of Variables, Graphs & Algebraic Reasoning',
    tagline: 'Empowering students to translate words and patterns into mathematical formulas.',
    methodology: 'Algebraic Modeling & Cartesian Coordinate Exploration',
    pedagogicalApproach:
      'Algebra Voyagers guides middle schoolers through the critical transition from concrete numbers to algebraic variables. Through live graph manipulators, students see the immediate graphical effect of changing slope (m) and intercept (b).',
    coreDomains: [
      'Integers & Signed Number Operations',
      'Proportions, Ratios & Scale Factors',
      'Linear Equations & Variable Balancing',
      'Cartesian Coordinate Plane & Slopes',
      'Pythagorean Theorem & Geometry Proofs'
    ],
    keyFeatures: [
      {
        title: 'Live Cartesian Slope Simulator',
        desc: 'Drag sliders for slope and y-intercept to watch lines rotate, shift, and intersect in real-time.'
      },
      {
        title: 'Interactive Balance Scale Equations',
        desc: 'Visualize equality by subtracting variables and constants equally from both sides.'
      },
      {
        title: 'Coordinate Plane Treasure Grid',
        desc: 'Plot (x, y) coordinates across all 4 quadrants with distance and midpoint calculations.'
      },
      {
        title: 'Adaptive ELO Calibration Engine',
        desc: 'Automatically tunes problem complexity to match current fluency without causing anxiety.'
      }
    ],
    developmentalGoals: [
      'Operate effortlessly with negative numbers, absolute values, and exponents',
      'Solve multi-step linear equations and inequalities with one or two variables',
      'Graph linear functions in slope-intercept form (y = mx + b) and interpret rate of change',
      'Apply proportional reasoning to solve complex real-world rate and geometry problems'
    ]
  },
  high: {
    id: 'high',
    title: 'STEM Pioneers',
    subtitle: 'Differential Calculus, Parabolic Curves, Trigonometry & Modeling',
    ageRange: 'Ages 15–18',
    ages: [15, 16, 17, 18],
    icon: '🌌',
    badgeClass: 'bg-purple-100 text-purple-800 border-purple-300',
    accentColor: 'purple',
    borderClass: 'border-purple-200',
    lightBg: 'bg-purple-50/50',
    heroGradient: 'from-purple-950 via-slate-950 to-slate-900',
    headline: 'Mastering Advanced Calculus, Functions & Mathematical Rigor',
    tagline: 'Preparing future engineers, scientists, and analysts for university-level mathematics.',
    methodology: 'Analytical Rigor & Dynamic Function Visualization',
    pedagogicalApproach:
      'STEM Pioneers tackles higher-level mathematics through deep intuitive models. Before memorizing derivative rules, students slide tangent lines along parabolas to witness instantaneous rate of change firsthand.',
    coreDomains: [
      'Quadratic Equations & Parabolic Factoring',
      'Trigonometric Functions & Unit Circle',
      'Exponential & Logarithmic Growth Models',
      'Differential Calculus & Instantaneous Rates',
      'Polynomial Analysis & Optimization'
    ],
    keyFeatures: [
      {
        title: 'Dynamic Tangent Line Inspector',
        desc: 'Move an inspection point across f(x) = x² to calculate instantaneous secant and tangent slopes f\'(x) = 2x.'
      },
      {
        title: 'Parabolic Vertex & Roots Explorer',
        desc: 'Analyze quadratic curves with vertex formula x = -b/(2a) and discriminant analysis.'
      },
      {
        title: 'Digital Engineering Scratchpad',
        desc: 'Integrated mathematical canvas with instant calculus stamps (π, √, ∫, ∑, ∞) and PNG export.'
      },
      {
        title: 'University & AP Exam Preparation',
        desc: 'Challenging problem banks crafted to build robust problem-solving stamina and conceptual clarity.'
      }
    ],
    developmentalGoals: [
      'Factor, graph, and solve complex quadratic, polynomial, and rational equations',
      'Navigate the trigonometric unit circle and model periodic phenomena',
      'Understand the foundational limit definition of the derivative and compute tangent slopes',
      'Formulate mathematical models to analyze physics, economics, and computational algorithms'
    ]
  }
};

export const AGE_PROFILES: Record<number, AgeProfileData> = {
  // ===== TIER 1: EARLY SPROUTS (AGES 3–6) =====
  3: {
    age: 3,
    tier: 'early',
    stageName: 'Early Sprouts',
    title: 'Age 3: Sensory Counting & Shape Discovery',
    gradeLevel: 'Preschool (3yo)',
    subtitle: 'Touching, counting, and hearing numbers 1 through 5 with cheerful audio narration.',
    cognitiveFocus:
      'Toddlers at age 3 develop number awareness through physical objects and auditory repetition, learning to associate number words with discrete quantities.',
    milestones: [
      'Recites numbers 1 to 5 in sequence',
      'Recognizes basic geometric shapes (circle, square)',
      'Understands the concept of "more" versus "less"',
      'Touches items one-by-one with auditory prompt'
    ],
    competencies: [
      { name: 'Counting to 5', target: '100% with audio guide', desc: 'Touch and count up to 5 items' },
      { name: 'Shape Identification', target: 'Circles & Squares', desc: 'Identify round and four-sided shapes' },
      { name: 'Size Comparison', target: 'Big vs. Small', desc: 'Distinguish relative object sizes' }
    ],
    interactiveType: 'counters',
    interactiveTitle: 'Tactile Apple Basket (Count 1–5)',
    interactiveInstructions: 'Tap the apples to count them! Hear each number spoken clearly.',
    sampleChallenge: {
      question: 'How many red apples are in the basket? 🍎 🍎 🍎',
      options: ['2', '3', '4'],
      correctIndex: 1,
      explanation: 'Count together: 1, 2, 3! There are 3 red apples in the basket.',
      hint: 'Tap each apple one by one with your finger!'
    },
    parentGuidance:
      'Point out numbers in everyday life—counting stairs as you climb, counting blueberries at snack time, and singing counting nursery rhymes.',
    educatorNotes:
      'Focus on one-to-one correspondence rather than rote memorization. Keep sessions under 5 minutes with immediate positive feedback.',
    recommendedDailyMinutes: 10
  },
  4: {
    age: 4,
    tier: 'early',
    stageName: 'Early Sprouts',
    title: 'Age 4: Counting to 10 & Pattern Matching',
    gradeLevel: 'Pre-Kindergarten (4yo)',
    subtitle: 'Connecting spoken numbers to written digits and discovering simple repeating patterns.',
    cognitiveFocus:
      'Four-year-olds begin subitizing small sets of objects (recognizing 2 or 3 items without counting) and grouping items by color, size, and shape.',
    milestones: [
      'Counts items reliably up to 10',
      'Matches written numerals 1–10 to sets of objects',
      'Completes simple repeating patterns (Red-Blue-Red-Blue)',
      'Identifies triangles, rectangles, and stars'
    ],
    competencies: [
      { name: 'Counting to 10', target: 'One-to-one accuracy', desc: 'Accurately counts up to 10 items' },
      { name: 'Pattern Logic', target: 'AB and AAB patterns', desc: 'Predicts the next color or shape' },
      { name: 'Numeral Match', target: 'Digits 1 through 10', desc: 'Connects written symbol to quantity' }
    ],
    interactiveType: 'shapes',
    interactiveTitle: 'Shape Explorer & Corner Counter',
    interactiveInstructions: 'Tap shapes to see how many corners and edges they have!',
    sampleChallenge: {
      question: 'Which shape has 3 corners and 3 straight sides? 🔺',
      options: ['Circle', 'Triangle', 'Square'],
      correctIndex: 1,
      explanation: 'A triangle has 3 corners and 3 straight sides! Tri means three.',
      hint: 'Count the sharp points on the shape.'
    },
    parentGuidance:
      'Play "I Spy" with shapes around the house (e.g., "I spy a rectangle on the wall—the door!").',
    educatorNotes:
      'Incorporate kinesthetic movement, like clapping or hopping to numbers, to reinforce counting rhythm.',
    recommendedDailyMinutes: 12
  },
  5: {
    age: 5,
    tier: 'early',
    stageName: 'Early Sprouts',
    title: 'Age 5: Number Bonds & Early Addition',
    gradeLevel: 'Kindergarten (5yo)',
    subtitle: 'Composing and decomposing numbers within 10 using visual ten-frames and counters.',
    cognitiveFocus:
      'Kindergartners learn that larger numbers are made by combining smaller numbers (e.g., 5 is made of 3 and 2). This lays the bedrock for all future arithmetic.',
    milestones: [
      'Solves visual addition within 5 (e.g., 2 + 3 = 5)',
      'Uses ten-frames to visualize numbers up to 10',
      'Compares two quantities using "greater than" or "less than"',
      'Writes numerals 0 through 10 with correct orientation'
    ],
    competencies: [
      { name: 'Addition within 5', target: 'Visual mastery', desc: 'Combine two groups into a total' },
      { name: 'Ten-Frame Fluency', target: 'Subitizing to 10', desc: 'Recognize full and half-filled rows' },
      { name: 'Number Comparisons', target: 'Greater / Less', desc: 'Identify which group has more' }
    ],
    interactiveType: 'ten_frame',
    interactiveTitle: 'Interactive Ten-Frame Builder',
    interactiveInstructions: 'Fill the ten-frame with dots to see how many more are needed to make 10!',
    sampleChallenge: {
      question: 'You have 3 blue stars and get 2 yellow stars. How many stars in all? ⭐⭐⭐ + ⭐⭐',
      options: ['4', '5', '6'],
      correctIndex: 1,
      explanation: '3 + 2 = 5! Putting 3 stars and 2 stars together gives 5 stars total.',
      hint: 'Count all the stars starting from 1.'
    },
    parentGuidance:
      'Use coins or buttons on the kitchen table: "Here are 4 pennies, if I give you 1 more, how many do you have?"',
    educatorNotes:
      'Ten-frames are critical at this stage. Emphasize "5 as an anchor" (5 on top row, remainder on bottom).',
    recommendedDailyMinutes: 15
  },
  6: {
    age: 6,
    tier: 'early',
    stageName: 'Early Sprouts',
    title: 'Age 6: Addition & Subtraction within 20',
    gradeLevel: '1st Grade (6yo)',
    subtitle: 'Transitioning from fingers and counters to mental math, number lines, and word stories.',
    cognitiveFocus:
      'First graders build mental arithmetic strategies, such as "counting on" from the larger number and understanding subtraction as finding the difference.',
    milestones: [
      'Adds and subtracts within 20 with confidence',
      'Understands place value basics: Tens and Ones',
      'Solves one-step arithmetic word problems',
      'Tells time to the hour on an analog clock'
    ],
    competencies: [
      { name: 'Mental Addition to 20', target: 'Fluency with 10-bonds', desc: 'e.g., 8 + 4 = 8 + 2 + 2 = 12' },
      { name: 'Subtraction Concept', target: 'Within 10 fluently', desc: 'Find how many remain after taking away' },
      { name: 'Tens & Ones Place', target: 'Base-10 understanding', desc: '14 is 1 ten and 4 ones' }
    ],
    interactiveType: 'bonds',
    interactiveTitle: 'Number Bond Bridge to 10',
    interactiveInstructions: 'Split numbers into friendly pairs that add to 10 and beyond.',
    sampleChallenge: {
      question: 'There were 8 birds on a branch. 3 flew away. How many birds are left?',
      options: ['4', '5', '6'],
      correctIndex: 1,
      explanation: '8 - 3 = 5 birds remain on the branch.',
      hint: 'Start at 8 and count backwards 3 times: 7, 6, 5.'
    },
    parentGuidance:
      'Celebrate when your child solves problems mentally without fingers, but always encourage them to explain their thinking aloud.',
    educatorNotes:
      'Teach the "make 10" strategy for addition exceeding 10 (e.g., 7 + 5 is 7 + 3 + 2).',
    recommendedDailyMinutes: 18
  },

  // ===== TIER 2: MATH NAVIGATORS (AGES 7–10) =====
  7: {
    age: 7,
    tier: 'elementary',
    stageName: 'Math Navigators',
    title: 'Age 7: Double-Digit Regrouping & Place Value',
    gradeLevel: '2nd Grade (7yo)',
    subtitle: 'Mastering two-digit addition and subtraction, measuring length, and reading clocks.',
    cognitiveFocus:
      'Children solidify deep place-value understanding (hundreds, tens, ones) and learn when and why regrouping (carrying and borrowing) works.',
    milestones: [
      'Adds two-digit numbers with regrouping (carrying)',
      'Subtracts two-digit numbers with borrowing',
      'Skips counts by 2s, 5s, and 10s up to 100',
      'Reads time to the nearest 5 minutes and counts money'
    ],
    competencies: [
      { name: '2-Digit Regrouping', target: '90% accuracy', desc: 'Add 38 + 27 using place value columns' },
      { name: 'Skip Counting', target: '2, 5, 10 to 100', desc: 'Foundation for multiplication facts' },
      { name: 'Clock & Money', target: 'Quarters, dimes, minutes', desc: 'Read analog clocks and count coins' }
    ],
    interactiveType: 'bonds',
    interactiveTitle: 'Place Value Regrouping Columns',
    interactiveInstructions: 'Watch 10 ones bundle into 1 ten when adding columns!',
    sampleChallenge: {
      question: 'What is 38 + 25?',
      options: ['53', '63', '65'],
      correctIndex: 1,
      explanation: '8 + 5 = 13 (3 ones, carry 1 ten). 1 ten + 3 tens + 2 tens = 6 tens. Total: 63.',
      hint: 'Add the ones first: 8 + 5. If it is 10 or more, carry the ten!'
    },
    parentGuidance:
      'Involve your child in real shopping trips: "Can you find two items that cost less than $10 together?"',
    educatorNotes:
      'Use Base-10 block manipulatives (flats, rods, units) before moving strictly to pencil-and-paper algorithms.',
    recommendedDailyMinutes: 20
  },
  8: {
    age: 8,
    tier: 'elementary',
    stageName: 'Math Navigators',
    title: 'Age 8: Multiplication Arrays & Fraction Slices',
    gradeLevel: '3rd Grade (8yo)',
    subtitle: 'Discovering equal groups, multiplication arrays, and visual fractions like pizza slices.',
    cognitiveFocus:
      'Third grade is the pivotal multiplication year. Students visualize multiplication as rows and columns of equal groups, and encounter unit fractions.',
    milestones: [
      'Understands multiplication as repeated equal groups',
      'Knows basic multiplication facts (1s, 2s, 3s, 4s, 5s, 10s)',
      'Identifies fractions of a whole (1/2, 1/3, 1/4, 3/4)',
      'Calculates perimeter and simple rectangle area'
    ],
    competencies: [
      { name: 'Multiplication Tables', target: 'Facts 2–5 and 10', desc: 'Fast recall using array mental models' },
      { name: 'Fraction Pizza Model', target: 'Halves, thirds, fourths', desc: 'Numerators vs. Denominators' },
      { name: 'Area & Perimeter', target: 'Grid counting', desc: 'Square units of rectangular spaces' }
    ],
    interactiveType: 'fraction_pizza',
    interactiveTitle: 'Dynamic Fraction Pizza Slicer',
    interactiveInstructions: 'Adjust the slice count and drag the shaded slider to see percentages and fraction values!',
    sampleChallenge: {
      question: 'A pizza is cut into 8 equal slices. Maya eats 3 slices. What fraction of the pizza did Maya eat?',
      options: ['3/8', '5/8', '3/5'],
      correctIndex: 0,
      explanation: 'Numerator (parts eaten) = 3. Denominator (total slices) = 8. Maya ate 3/8 of the pizza.',
      hint: 'The bottom number is the total slices. The top number is what Maya ate.'
    },
    parentGuidance:
      'Point out fractions at meal times: "Look, we cut this waffle into 4 equal quarters! You ate 1/4."',
    educatorNotes:
      'Show that multiplication is commutative: 4 × 6 gives the exact same area as 6 × 4.',
    recommendedDailyMinutes: 22
  },
  9: {
    age: 9,
    tier: 'elementary',
    stageName: 'Math Navigators',
    title: 'Age 9: Long Multiplication, Decimals & Area',
    gradeLevel: '4th Grade (9yo)',
    subtitle: 'Multiplying multi-digit numbers, equivalent fractions, decimals, and angle measurement.',
    cognitiveFocus:
      'Fourth graders expand fractions to mixed numbers and decimals (tenths and hundredths), while developing automatic multi-digit multiplication strategies.',
    milestones: [
      'Multiplies 2-digit by 2-digit numbers using area models',
      'Compares equivalent fractions (e.g., 2/4 = 1/2 = 4/8)',
      'Converts fractions with denominator 10 and 100 into decimals',
      'Measures angles using a protractor (acute, right, obtuse)'
    ],
    competencies: [
      { name: 'Multi-Digit Multiplication', target: 'e.g., 24 × 15', desc: 'Area model and standard algorithm' },
      { name: 'Equivalent Fractions', target: 'Cross multiplication', desc: 'Find common denominators' },
      { name: 'Decimals to Hundredths', target: 'Tenths & hundredths', desc: '0.75 = 75/100 = 3/4' }
    ],
    interactiveType: 'multiplication_grid',
    interactiveTitle: 'Area Model Multiplication Grid',
    interactiveInstructions: 'Break numbers into tens and ones (e.g. 24 into 20 + 4) to multiply multi-digit numbers visually.',
    sampleChallenge: {
      question: 'Which decimal is equivalent to the fraction 3/4?',
      options: ['0.34', '0.75', '0.50'],
      correctIndex: 1,
      explanation: '3/4 is equal to 75/100, which is written as the decimal 0.75.',
      hint: 'Think about quarters in a dollar: 3 quarters = 75 cents!'
    },
    parentGuidance:
      'Connect decimals to price tags and sports statistics (batting averages, race finish times in tenths of a second).',
    educatorNotes:
      'Area models for multiplication prevent students from treating the algorithm as a magic recipe.',
    recommendedDailyMinutes: 25
  },
  10: {
    age: 10,
    tier: 'elementary',
    stageName: 'Math Navigators',
    title: 'Age 10: Fractions with Unlike Denominators & Volume',
    gradeLevel: '5th Grade (10yo)',
    subtitle: 'Adding fractions with different denominators, decimal arithmetic, and 3D rectangular volume.',
    cognitiveFocus:
      'Fifth grade solidifies all foundational arithmetic. Students learn to find Least Common Multiples (LCM) to add and subtract unlike fractions.',
    milestones: [
      'Adds and subtracts fractions with unlike denominators',
      'Multiplies fractions by fractions (e.g., 2/3 × 4/5)',
      'Calculates volume of rectangular prisms (Length × Width × Height)',
      'Plots coordinates on the first quadrant of a coordinate plane'
    ],
    competencies: [
      { name: 'Unlike Denominators', target: '1/3 + 1/4 = 7/12', desc: 'Find common multiples and add' },
      { name: 'Decimal Multiplication', target: 'Place decimal point', desc: '2.5 × 1.4 = 3.5' },
      { name: 'Volume of 3D Prisms', target: 'Cubic units', desc: 'L × W × H calculation' }
    ],
    interactiveType: 'fraction_pizza',
    interactiveTitle: 'Unlike Denominator Pizza Commonizer',
    interactiveInstructions: 'Slice both fractions into a shared common denominator to add them together.',
    sampleChallenge: {
      question: 'What is 1/2 + 1/4?',
      options: ['2/6', '3/4', '2/4'],
      correctIndex: 1,
      explanation: 'Convert 1/2 into 2/4. Then 2/4 + 1/4 = 3/4.',
      hint: 'Find a common denominator: 2 goes into 4, so 1/2 is equal to 2/4.'
    },
    parentGuidance:
      'Encourage baking recipes: "If we need 1/2 cup of flour and 1/4 cup more for dusting, how much flour total?"',
    educatorNotes:
      'Emphasize that adding fractions NEVER means adding top-to-top and bottom-to-bottom.',
    recommendedDailyMinutes: 28
  },

  // ===== TIER 3: ALGEBRA VOYAGERS (AGES 11–14) =====
  11: {
    age: 11,
    tier: 'middle',
    stageName: 'Algebra Voyagers',
    title: 'Age 11: Negative Numbers, Ratios & Unit Rates',
    gradeLevel: '6th Grade (11yo)',
    subtitle: 'Expanding numbers below zero, navigating all 4 coordinate quadrants, and proportional ratios.',
    cognitiveFocus:
      'Sixth graders enter middle school mathematics, mastering negative numbers, absolute values, and understanding rates as comparisons of quantities.',
    milestones: [
      'Adds, subtracts, and multiplies positive and negative integers',
      'Calculates unit rates (e.g., miles per hour, price per ounce)',
      'Plots points across all 4 quadrants of the coordinate plane',
      'Writes simple one-step variable algebraic expressions'
    ],
    competencies: [
      { name: 'Signed Integers', target: 'Negative number rules', desc: 'e.g., -5 + 8 = 3 and -3 × -4 = 12' },
      { name: 'Unit Rates', target: 'Proportions', desc: 'Compare 60 miles / 2 hours = 30 mph' },
      { name: '4-Quadrant Graphing', target: 'Signs in (+/-) quadrants', desc: 'Plot (x, y) coordinates' }
    ],
    interactiveType: 'integers',
    interactiveTitle: 'Zero-Pair Integer Counter',
    interactiveInstructions: 'Pair positive (+1) and negative (-1) counters to see how zero pairs cancel out.',
    sampleChallenge: {
      question: 'The temperature was -4°F in the morning and rose by 10°F by afternoon. What is the temperature now?',
      options: ['-14°F', '6°F', '-6°F'],
      correctIndex: 1,
      explanation: '-4 + 10 = +6°F.',
      hint: 'Start at -4 on a vertical thermometer and move up 10 steps.'
    },
    parentGuidance:
      'Connect negative numbers to elevation (below sea level) and bank balance debits.',
    educatorNotes:
      'Zero-pair manipulatives provide the best concrete mental model for why subtracting a negative is adding.',
    recommendedDailyMinutes: 30
  },
  12: {
    age: 12,
    tier: 'middle',
    stageName: 'Algebra Voyagers',
    title: 'Age 12: Two-Step Equations & Proportions',
    gradeLevel: '7th Grade (12yo)',
    subtitle: 'Balancing equations, solving 2x + 5 = 15, scale drawings, and percent markups.',
    cognitiveFocus:
      'Seventh graders learn the golden rule of algebra: whatever operation is applied to one side of an equation must be applied equally to the other.',
    milestones: [
      'Solves two-step linear equations (e.g., 3x - 7 = 14)',
      'Solves multi-step ratio and percent problems (discounts, tax, tips)',
      'Computes area and circumference of circles using π',
      'Understands probability of independent and dependent events'
    ],
    competencies: [
      { name: 'Two-Step Algebra', target: 'Undo addition, then mult', desc: 'Isolate variables cleanly' },
      { name: 'Circle Geometry', target: 'C = 2πr, A = πr²', desc: 'Use π ≈ 3.14 to calculate circular metrics' },
      { name: 'Percent Markup & Tax', target: 'Real-world consumer math', desc: 'Calculate total cost after 8% tax' }
    ],
    interactiveType: 'expressions',
    interactiveTitle: 'Algebraic Balance Scale',
    interactiveInstructions: 'Keep the balance beam level by performing inverse operations to isolate x.',
    sampleChallenge: {
      question: 'Solve for x:  2x + 7 = 19',
      options: ['x = 6', 'x = 12', 'x = 8'],
      correctIndex: 0,
      explanation: 'Subtract 7 from both sides: 2x = 12. Divide both sides by 2: x = 6.',
      hint: 'First subtract 7 from 19, then divide what is left by 2.'
    },
    parentGuidance:
      'Have your child calculate the 18% or 20% tip on a restaurant bill mentally or on a napkin.',
    educatorNotes:
      'Emphasize inverse operations: addition undoes subtraction; division undoes multiplication.',
    recommendedDailyMinutes: 32
  },
  13: {
    age: 13,
    tier: 'middle',
    stageName: 'Algebra Voyagers',
    title: 'Age 13: Linear Slopes & y = mx + b',
    gradeLevel: '8th Grade / Pre-Algebra (13yo)',
    subtitle: 'Mastering slope-intercept form, rate of change, and the Pythagorean Theorem.',
    cognitiveFocus:
      'Eighth grade connects equations directly to geometric lines on a grid. Students discover that slope (m = rise/run) is the universal measure of steepness.',
    milestones: [
      'Graphs linear equations in slope-intercept form (y = mx + b)',
      'Calculates slope using m = (y₂ - y₁) / (x₂ - x₁)',
      'Applies the Pythagorean Theorem (a² + b² = c²) to find right triangle lengths',
      'Distinguishes rational and irrational numbers (e.g., √2, π)'
    ],
    competencies: [
      { name: 'Slope-Intercept Form', target: 'y = mx + b fluency', desc: 'Identify slope m and y-intercept b' },
      { name: 'Pythagorean Theorem', target: 'Right triangle legs', desc: 'Find hypotenuse c = √(a² + b²)' },
      { name: 'Scientific Notation', target: 'Powers of 10', desc: 'Express massive and microscopic numbers' }
    ],
    interactiveType: 'slope_line',
    interactiveTitle: 'Interactive Cartesian Slope Simulator',
    interactiveInstructions: 'Drag the slope (m) and y-intercept (b) sliders to see the line shift and tilt across the coordinate plane.',
    sampleChallenge: {
      question: 'What is the slope (m) and y-intercept (b) of the equation: y = -3x + 5?',
      options: ['m = -3, b = 5', 'm = 5, b = -3', 'm = 3, b = 5'],
      correctIndex: 0,
      explanation: 'In y = mx + b, m is the coefficient of x (slope = -3) and b is the constant (intercept = 5).',
      hint: 'Compare directly to the template equation y = mx + b.'
    },
    parentGuidance:
      'Point out real-world slopes: wheelchair access ramps (1 foot rise per 12 feet run) and road grades.',
    educatorNotes:
      'Reinforce that horizontal lines have slope m = 0, while vertical lines have undefined slope.',
    recommendedDailyMinutes: 35
  },
  14: {
    age: 14,
    tier: 'middle',
    stageName: 'Algebra Voyagers',
    title: 'Age 14: Systems of Linear Equations & Exponents',
    gradeLevel: 'Algebra I (14yo)',
    subtitle: 'Solving systems by substitution and elimination, exponent rules, and polynomial basics.',
    cognitiveFocus:
      'Algebra I formalizes abstract mathematical modeling. Students learn to find the single coordinate point where two distinct linear constraints meet.',
    milestones: [
      'Solves systems of linear equations (graphing, substitution, elimination)',
      'Applies exponent laws (product rule, quotient rule, power of a power)',
      'Multiplies binomials using FOIL / distributive property',
      'Interprets domain and range of mathematical relations and functions'
    ],
    competencies: [
      { name: 'Systems of Equations', target: 'Intersection (x, y)', desc: 'Find unique solution point for 2 lines' },
      { name: 'Exponent Rules', target: 'xᵃ · xᵇ = xᵃ⁺ᵇ', desc: 'Simplify algebraic exponential expressions' },
      { name: 'Function Notation', target: 'f(x) evaluation', desc: 'Evaluate outputs for given inputs' }
    ],
    interactiveType: 'coordinate_points',
    interactiveTitle: 'Systems Intersection Finder',
    interactiveInstructions: 'Adjust two linear lines and see the exact coordinates where their paths intersect.',
    sampleChallenge: {
      question: 'Where do the lines y = 2x and y = -x + 6 intersect?',
      options: ['(2, 4)', '(3, 3)', '(1, 5)'],
      correctIndex: 0,
      explanation: 'Set them equal: 2x = -x + 6 => 3x = 6 => x = 2. Then y = 2(2) = 4. Solution is (2, 4).',
      hint: 'Set 2x equal to -x + 6 and solve for x first!'
    },
    parentGuidance:
      'Discuss how systems of equations are used by businesses to find "break-even points" between cost and revenue.',
    educatorNotes:
      'Make sure students recognize parallel lines have no solution (never intersect), and identical lines have infinitely many solutions.',
    recommendedDailyMinutes: 38
  },

  // ===== TIER 4: STEM PIONEERS (AGES 15–18) =====
  15: {
    age: 15,
    tier: 'high',
    stageName: 'STEM Pioneers',
    title: 'Age 15: Quadratic Functions & Parabolic Curves',
    gradeLevel: 'Geometry / Algebra II (15yo)',
    subtitle: 'Factoring trinomials, the quadratic formula, vertex form, and projectile motion trajectories.',
    cognitiveFocus:
      'High school students step beyond straight lines into non-linear curves. Parabolas model gravity, satellite dishes, and economic revenue curves.',
    milestones: [
      'Solves quadratics by factoring, completing the square, and quadratic formula',
      'Finds vertex and axis of symmetry for y = ax² + bx + c',
      'Calculates the discriminant (b² - 4ac) to determine nature of roots',
      'Understands complex numbers and the imaginary unit i = √(-1)'
    ],
    competencies: [
      { name: 'Quadratic Formula', target: 'x = (-b ± √(b²-4ac))/(2a)', desc: 'Find real and complex roots' },
      { name: 'Parabola Vertex', target: 'x = -b / (2a)', desc: 'Locate maximum or minimum turning points' },
      { name: 'Factoring Trinomials', target: 'x² + bx + c = (x+p)(x+q)', desc: 'Decompose polynomials into factors' }
    ],
    interactiveType: 'quadratic_curve',
    interactiveTitle: 'Parabolic Vertex & Trajectory Explorer',
    interactiveInstructions: 'Tune coefficients a, b, and c to see the parabola widen, narrow, invert, and shift across roots.',
    sampleChallenge: {
      question: 'What are the roots (x-intercepts) of x² - 5x + 6 = 0?',
      options: ['x = 2 and x = 3', 'x = -2 and x = -3', 'x = 1 and x = 6'],
      correctIndex: 0,
      explanation: 'Factor: (x - 2)(x - 3) = 0. Therefore, x = 2 and x = 3.',
      hint: 'Look for two numbers that multiply to +6 and add to -5.'
    },
    parentGuidance:
      'Point out parabolic arcs in sports: when a basketball is shot toward a hoop, its path through the air is a true parabola.',
    educatorNotes:
      'Emphasize the physical significance of the vertex as either a maximum (e.g. max height) or minimum (e.g. min cost).',
    recommendedDailyMinutes: 40
  },
  16: {
    age: 16,
    tier: 'high',
    stageName: 'STEM Pioneers',
    title: 'Age 16: Trigonometric Ratios & Periodic Waves',
    gradeLevel: 'Pre-Calculus & Trigonometry (16yo)',
    subtitle: 'SOH-CAH-TOA, the Unit Circle, sine/cosine waves, and logarithmic scales.',
    cognitiveFocus:
      'Trigonometry connects circular rotation to oscillating wave functions, fundamental to audio synthesis, electrical engineering, and astronomy.',
    milestones: [
      'Applies sine, cosine, and tangent ratios to solve right triangles',
      'Navigates the 360° / 2π radian Unit Circle values',
      'Graphs y = A·sin(Bx - C) + D and analyzes amplitude, period, and phase shift',
      'Solves exponential growth and decay models using logarithms'
    ],
    competencies: [
      { name: 'Unit Circle Coordinates', target: '(cos θ, sin θ)', desc: 'Exact values for 30°, 45°, 60°' },
      { name: 'Wave Parameters', target: 'Amplitude & Period', desc: 'Period = 2π/B, Amplitude = |A|' },
      { name: 'Logarithmic Laws', target: 'log(ab) = log a + log b', desc: 'Inverses of exponential functions' }
    ],
    interactiveType: 'trigonometry',
    interactiveTitle: 'Interactive Unit Circle Wave Generator',
    interactiveInstructions: 'Drag the circular angle theta to see sine and cosine traces unfurl as continuous waves.',
    sampleChallenge: {
      question: 'In a right triangle, what is sin(θ) if the opposite leg is 3 and the hypotenuse is 5?',
      options: ['3/5 (0.6)', '4/5 (0.8)', '3/4 (0.75)'],
      correctIndex: 0,
      explanation: 'By SOH-CAH-TOA, sin(θ) = Opposite / Hypotenuse = 3/5 = 0.6.',
      hint: 'Remember SOH: Sine = Opposite over Hypotenuse.'
    },
    parentGuidance:
      'Explain that sound waves, Wi-Fi radio frequencies, and ocean tides are all modeled using sine and cosine waves.',
    educatorNotes:
      'Ensure students understand radian measure as arc length divided by radius, not just an arbitrary alternative to degrees.',
    recommendedDailyMinutes: 42
  },
  17: {
    age: 17,
    tier: 'high',
    stageName: 'STEM Pioneers',
    title: 'Age 17: Pre-Calculus, Limits & Continuity',
    gradeLevel: 'Pre-Calculus Honors (17yo)',
    subtitle: 'Evaluating limits as x approaches a value, finding vertical asymptotes, and rational function behavior.',
    cognitiveFocus:
      'Pre-calculus bridges algebra to calculus through limits—understanding what a function approaches when it cannot be directly evaluated.',
    milestones: [
      'Evaluates limits algebraically (factoring, rationalizing conjugates)',
      'Identifies removable discontinuities (holes) vs. infinite vertical asymptotes',
      'Computes limits as x approaches infinity to find horizontal asymptotes',
      'Derives the difference quotient: [f(x+h) - f(x)] / h'
    ],
    competencies: [
      { name: 'Limit Evaluation', target: 'lim x→c f(x)', desc: 'Algebraic cancellation of 0/0 indeterminate forms' },
      { name: 'Difference Quotient', target: 'Foundation of derivative', desc: 'Average rate of change as h → 0' },
      { name: 'Asymptotes & Holes', target: 'Rational function analysis', desc: 'Long-term behavior and domain restrictions' }
    ],
    interactiveType: 'limits',
    interactiveTitle: 'Limit Zoomer: Indeterminate 0/0 Cancellation',
    interactiveInstructions: 'Approach the target x from the left and right to inspect if the function limit exists.',
    sampleChallenge: {
      question: 'What is lim (x → 3) of (x² - 9) / (x - 3)?',
      options: ['6', '0', 'Undefined (0/0)'],
      correctIndex: 0,
      explanation: 'Factor: (x - 3)(x + 3) / (x - 3) = x + 3. As x → 3, 3 + 3 = 6.',
      hint: 'Direct substitution gives 0/0. Factor the numerator first (difference of squares)!'
    },
    parentGuidance:
      'Limits are like approaching a speed bump in a car: you can get infinitely close without crashing.',
    educatorNotes:
      'Highlight that a limit describes nearby behavior, not necessarily the actual value at the point.',
    recommendedDailyMinutes: 45
  },
  18: {
    age: 18,
    tier: 'high',
    stageName: 'STEM Pioneers',
    title: 'Age 18: Differential Calculus & Tangent Slopes',
    gradeLevel: 'AP Calculus AB/BC & University (18yo)',
    subtitle: 'Power rule, product/quotient rules, instantaneous velocity, optimization, and area under curves.',
    cognitiveFocus:
      'Calculus is the mathematics of change. Students discover the instantaneous rate of change of any dynamic system, from rocket acceleration to economic growth.',
    milestones: [
      'Applies derivative rules: Power Rule, Product Rule, Quotient Rule, Chain Rule',
      'Calculates instantaneous rates of change and tangent line equations',
      'Finds local maxima, minima, and inflection points using first and second derivative tests',
      'Solves optimization problems (maximizing area, minimizing material costs)'
    ],
    competencies: [
      { name: 'Derivative Differentiation', target: 'Power Rule d/dx [xⁿ] = n·xⁿ⁻¹', desc: 'Compute derivatives fluently' },
      { name: 'Tangent Line Equation', target: 'y - y₁ = m(x - x₁)', desc: 'Evaluate line touching curve at single point' },
      { name: 'Optimization Modeling', target: 'Set f\'(x) = 0', desc: 'Locate critical points of maximum efficiency' }
    ],
    interactiveType: 'derivatives',
    interactiveTitle: 'Instantaneous Tangent Inspector (f(x) = x²)',
    interactiveInstructions: 'Drag the inspection point along the curve to see the tangent slope f\'(x) = 2x calculate dynamically.',
    sampleChallenge: {
      question: 'If f(x) = 3x² + 4x - 5, what is the derivative f\'(x)?',
      options: ['f\'(x) = 6x + 4', 'f\'(x) = 3x + 4', 'f\'(x) = 6x² + 4'],
      correctIndex: 0,
      explanation: 'By the Power Rule: d/dx(3x²) = 6x, d/dx(4x) = 4, and d/dx(-5) = 0. So f\'(x) = 6x + 4.',
      hint: 'Multiply the coefficient by the exponent, then decrease the exponent by 1.'
    },
    parentGuidance:
      'Calculus is the core engine behind modern aerospace, AI machine learning gradient descent, and financial modeling.',
    educatorNotes:
      'Connect derivatives directly back to middle school slope (m = rise/run): a derivative is simply the slope of a curve at a single instantaneous moment.',
    recommendedDailyMinutes: 45
  }
};

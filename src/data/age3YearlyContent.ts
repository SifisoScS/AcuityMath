export interface Age3SessionUnit {
  id: string;
  weeks: string;
  title: string;
  focus: string;
  activities: string[];
  vocabulary: string[];
  everydayMathTip: string;
}

export interface Age3SessionData {
  sessionNumber: 1 | 2 | 3 | 4;
  season: 'Fall' | 'Winter' | 'Spring' | 'Summer';
  termTitle: string;
  subtitle: string;
  duration: string;
  colorTheme: {
    primary: string;
    light: string;
    border: string;
    accent: string;
    badge: string;
    text: string;
    gradient: string;
  };
  icon: string;
  cognitiveMilestone: string;
  coreObjectives: string[];
  units: Age3SessionUnit[];
  rhymeSong: {
    title: string;
    lyrics: string[];
    audioPrompt: string;
  };
  handsOnGame: {
    id: string;
    name: string;
    instructions: string;
  };
  quickChallenge: {
    question: string;
    options: string[];
    correctIndex: number;
    explanation: string;
    hint: string;
    audioVoice: string;
  };
  parentAtHomeToolkit: {
    title: string;
    tips: string[];
  };
}

export const AGE_3_YEARLY_SESSIONS: Age3SessionData[] = [
  // ==========================================
  // SESSION 1: FALL / TERM 1
  // ==========================================
  {
    sessionNumber: 1,
    season: 'Fall',
    termTitle: 'Session 1: Sensory Wonders & Numbers 1 and 2',
    subtitle: 'Establishing tactile one-to-one correspondence, single items, pairs, and size awareness.',
    duration: 'Weeks 1–12 (Autumn Term)',
    colorTheme: {
      primary: 'bg-amber-600',
      light: 'bg-amber-50',
      border: 'border-amber-200',
      accent: 'text-amber-700',
      badge: 'bg-amber-100 text-amber-800 border-amber-300',
      text: 'text-amber-900',
      gradient: 'from-amber-500/10 via-orange-500/5 to-transparent'
    },
    icon: '🍂',
    cognitiveMilestone:
      'Toddlers transition from seeing groups of objects as an undifferentiated mass to isolating "just one" and identifying natural pairs ("two").',
    coreObjectives: [
      'Isolates and names "one" single object upon request',
      'Identifies pairs of body parts and clothing (2 shoes, 2 eyes, 2 socks)',
      'Understands the physical difference between "Big" and "Little"',
      'Practices the spatial concepts of "In" the box and "Out" of the box'
    ],
    units: [
      {
        id: 's1-u1',
        weeks: 'Weeks 1–3',
        title: 'Look, It is Just One!',
        focus: 'Pointing to single special objects and learning the word "one".',
        activities: [
          'Point to 1 nose, 1 mouth, and 1 belly button',
          'Find 1 favorite soft toy and give it a big hug',
          'Say "One!" loudly and clap hands together once'
        ],
        vocabulary: ['One', 'Single', 'Alone', 'Special'],
        everydayMathTip: 'At snack time, hand your child "one apple slice" and say the word "one" with a cheerful smile.'
      },
      {
        id: 's1-u2',
        weeks: 'Weeks 4–6',
        title: 'Two Shoes, Two Hands!',
        focus: 'Discovering natural pairs and hearing the counting sequence "One, Two".',
        activities: [
          'Put on two socks and tap each foot: "One, Two!"',
          'Hold two crayons—one in the left hand, one in the right',
          'Make two playdough balls and roll them together'
        ],
        vocabulary: ['Two', 'Pair', 'Both', 'Together'],
        everydayMathTip: 'While getting dressed, count: "One shoe on this foot, two shoes on that foot! Two shoes!"'
      },
      {
        id: 's1-u3',
        weeks: 'Weeks 7–9',
        title: 'Big Bear and Little Mouse',
        focus: 'Comparing physical sizes through hands-on toy exploration.',
        activities: [
          'Stack a giant block on the floor and put a tiny pebble beside it',
          'Take giant elephant steps vs. tiny mouse tiptoes',
          'Compare a big adult spoon to a little baby spoon'
        ],
        vocabulary: ['Big', 'Little', 'Huge', 'Tiny'],
        everydayMathTip: 'Point out big trucks and little cars when looking out the window or taking a neighborhood walk.'
      },
      {
        id: 's1-u4',
        weeks: 'Weeks 10–12',
        title: 'Putting In and Taking Out',
        focus: 'Spatial exploration through tactile sensory bins and clean-up games.',
        activities: [
          'Drop 2 wooden blocks inside a plastic cup: "Clunk! Clunk!"',
          'Take 1 ball out of the toy basket and roll it back in',
          'Empty and fill containers with large dry pasta or pom-poms'
        ],
        vocabulary: ['In', 'Inside', 'Out', 'Empty', 'Full'],
        everydayMathTip: 'Make cleanup a counting game: "Let us put one toy in... now two toys in!"'
      }
    ],
    rhymeSong: {
      title: 'One, Two, Buckle My Shoe',
      lyrics: [
        'One, two, buckle my shoe,',
        'Three, four, knock on the door,',
        'Five, six, pick up sticks,',
        'Seven, eight, lay them straight!'
      ],
      audioPrompt: 'Sing along: One, two, buckle my shoe! Tap your shoes together twice!'
    },
    handsOnGame: {
      id: 'game-apple-basket',
      name: 'Autumn Apple Picker (1 & 2)',
      instructions: 'Tap the red apples to drop them into the wooden basket! Count out loud: 1, 2!'
    },
    quickChallenge: {
      question: 'Which plate has exactly TWO yummy strawberries? 🍓',
      options: ['1 Strawberry 🍓', '2 Strawberries 🍓🍓', 'Many Strawberries 🍓🍓🍓🍓'],
      correctIndex: 1,
      explanation: 'That is right! Count them together: one, two! There are 2 sweet strawberries.',
      hint: 'Look for the plate where you can point once, then twice!',
      audioVoice: 'Look carefully! Touch and count: one, two!'
    },
    parentAtHomeToolkit: {
      title: 'Session 1 Home Play Guide',
      tips: [
        'Use snack times for one-to-one counting (e.g. 1 cracker for bear, 1 cracker for you).',
        'Sing rhyming counting songs while pushing on the swing or during diaper changes.',
        'Celebrate every attempt: at age 3, understanding the concept is more important than perfect recitation.'
      ]
    }
  },

  // ==========================================
  // SESSION 2: WINTER / TERM 2
  // ==========================================
  {
    sessionNumber: 2,
    season: 'Winter',
    termTitle: 'Session 2: Shapes, Sorting & Discovering 3',
    subtitle: 'Counting up to 3 objects, feeling circles vs. squares, and sorting by vibrant colors.',
    duration: 'Weeks 13–24 (Winter Term)',
    colorTheme: {
      primary: 'bg-sky-600',
      light: 'bg-sky-50',
      border: 'border-sky-200',
      accent: 'text-sky-700',
      badge: 'bg-sky-100 text-sky-800 border-sky-300',
      text: 'text-sky-900',
      gradient: 'from-sky-500/10 via-cyan-500/5 to-transparent'
    },
    icon: '❄️',
    cognitiveMilestone:
      'Toddlers begin subitizing sets of up to 3 items without recount and recognize that round shapes roll while flat shapes stack.',
    coreObjectives: [
      'Counts 1, 2, 3 items accurately with finger pointing',
      'Distinguishes round circles from straight-edged squares',
      'Sorts toys or buttons into two groups by color (Red vs. Blue)',
      'Understands the concept of "More" when comparing two groups'
    ],
    units: [
      {
        id: 's2-u1',
        weeks: 'Weeks 13–15',
        title: 'Count to 3 with Me!',
        focus: 'Introducing the magical number three with tactile objects.',
        activities: [
          'Stack a tower of 3 soft foam blocks: "One, two, three... crash!"',
          'Give 3 toy cars a gentle push across the living room carpet',
          'Count 3 claps before dinner: 1-2-3!'
        ],
        vocabulary: ['Three', 'Third', 'Trio', 'Count'],
        everydayMathTip: 'During reading time, count the 3 little pigs or 3 bears on the storybook page.'
      },
      {
        id: 's2-u2',
        weeks: 'Weeks 16–18',
        title: 'Circles Roll & Squares Sit',
        focus: 'Feeling smooth curved edges vs. four flat sides.',
        activities: [
          'Roll a round ball back and forth: "Circles roll round and round!"',
          'Trace fingers around a square picture frame: "Flat side, corner, flat side!"',
          'Press circular jar lids and square cookie cutters into playdough'
        ],
        vocabulary: ['Circle', 'Round', 'Square', 'Corner', 'Roll'],
        everydayMathTip: 'Spot round clock faces, round coins, and square cereal boxes in the pantry.'
      },
      {
        id: 's2-u3',
        weeks: 'Weeks 19–21',
        title: 'The Great Color Sort',
        focus: 'Classifying objects into distinct color groups.',
        activities: [
          'Sort red and blue socks into two separate laundry baskets',
          'Gather yellow toy blocks into the sunny yellow tub',
          'Place green plastic balls in the green hoop'
        ],
        vocabulary: ['Same', 'Different', 'Sort', 'Color', 'Match'],
        everydayMathTip: 'Sort laundry together! Let your child separate light clothes from dark socks.'
      },
      {
        id: 's2-u4',
        weeks: 'Weeks 22–24',
        title: 'Who Has More Cookies?',
        focus: 'Comparing quantities visually: "a lot" vs. "a little".',
        activities: [
          'Place 3 animal crackers on one plate and 1 on another: "Which has MORE?"',
          'Pour a lot of water into bath cups vs. just a few drops',
          'Build a tall stack with 3 blocks and a short stack with 1 block'
        ],
        vocabulary: ['More', 'Fewer', 'A lot', 'Pile'],
        everydayMathTip: 'Ask during snack: "Do you want more blueberries or are you all done?"'
      }
    ],
    rhymeSong: {
      title: 'Three Little Kittens',
      lyrics: [
        'Three little kittens, they lost their mittens,',
        'And they began to cry,',
        'Oh, mother dear, we sadly fear,',
        'Our mittens we have lost!'
      ],
      audioPrompt: 'Hold up three fingers! One, two, three little kittens!'
    },
    handsOnGame: {
      id: 'game-shape-sorter',
      name: 'Winter Cookie Shape Sorter',
      instructions: 'Touch the round circle cookies and square crackers! Feed the friendly hungry polar bear.'
    },
    quickChallenge: {
      question: 'Which shape rolls smoothly like a shiny winter snowball? ⚪',
      options: ['Circle (Round) ⚪', 'Square (Corners) ⏹️', 'Star (Pointy) ⭐'],
      correctIndex: 0,
      explanation: 'Super work! A circle is round with no pointy corners, so it can roll like a snowball!',
      hint: 'Think about a ball that bounces and rolls on the floor.',
      audioVoice: 'Find the shape that is round and rolls like a snowball!'
    },
    parentAtHomeToolkit: {
      title: 'Session 2 Home Play Guide',
      tips: [
        'Use bath time to explore circles (bubbles, jar lids) and count splash cups 1, 2, 3!',
        'Make shape discovery sensory: draw circles and squares in shaving cream or sensory flour trays.',
        'Encourage counting with rhythm: chant numbers in a musical cadence.'
      ]
    }
  },

  // ==========================================
  // SESSION 3: SPRING / TERM 3
  // ==========================================
  {
    sessionNumber: 3,
    season: 'Spring',
    termTitle: 'Session 3: Counting to 4 & Everyday Patterns',
    subtitle: 'Counting 1 through 4, recognizing repeating AB patterns, and comparing tall vs. short.',
    duration: 'Weeks 25–36 (Spring Term)',
    colorTheme: {
      primary: 'bg-emerald-600',
      light: 'bg-emerald-50',
      border: 'border-emerald-200',
      accent: 'text-emerald-700',
      badge: 'bg-emerald-100 text-emerald-800 border-emerald-300',
      text: 'text-emerald-900',
      gradient: 'from-emerald-500/10 via-teal-500/5 to-transparent'
    },
    icon: '🌱',
    cognitiveMilestone:
      'Children begin noticing mathematical rhythms in their environment (patterns) and can maintain one-to-one correspondence up to four objects.',
    coreObjectives: [
      'Counts 4 objects accurately without skipping or double-counting',
      'Recognizes and predicts a simple alternating pattern (Red, Blue, Red, Blue)',
      'Compares heights: identifying which tower or person is "Tall" vs. "Short"',
      'Shows 1, 2, 3, or 4 fingers quickly on command'
    ],
    units: [
      {
        id: 's3-u1',
        weeks: 'Weeks 25–27',
        title: 'Four Spring Blossoms',
        focus: 'Counting reliably up to 4 garden flowers and spring animals.',
        activities: [
          'Count 4 yellow dandelions picked from the grass',
          'Make 4 bunny hops on the rug: "Hop 1, Hop 2, Hop 3, Hop 4!"',
          'Arrange 4 rubber duckies in a straight line for bath time'
        ],
        vocabulary: ['Four', 'Hop', 'Line', 'Order'],
        everydayMathTip: 'Count the legs on a dog, cat, or dining room chair: "One, two, three, four legs!"'
      },
      {
        id: 's3-u2',
        weeks: 'Weeks 28–30',
        title: 'Clap-Tap! Simple Patterns',
        focus: 'Hearing, seeing, and continuing alternating AB rhythms.',
        activities: [
          'Sound pattern: Clap, Tap knees, Clap, Tap knees!',
          'Color pattern: Yellow block, Blue block, Yellow block, Blue block',
          'Body pattern: Stand up, Sit down, Stand up, Sit down'
        ],
        vocabulary: ['Pattern', 'Next', 'Repeat', 'Again'],
        everydayMathTip: 'Line up shoes at the doorway in a pattern: Mommy shoe, Baby shoe, Mommy shoe...'
      },
      {
        id: 's3-u3',
        weeks: 'Weeks 31–33',
        title: 'Tall Trees and Short Bushes',
        focus: 'Measuring vertical height by standing items side-by-side.',
        activities: [
          'Build a tall Lego tower that reaches up to your knee and a short 2-block tower',
          'Stand back-to-back with a sibling or parent to see who is taller',
          'Look for tall trees and short flowers in the backyard'
        ],
        vocabulary: ['Tall', 'Short', 'Taller', 'High'],
        everydayMathTip: 'Mark growth on a wall doorframe and celebrate: "You are growing taller every month!"'
      },
      {
        id: 's3-u4',
        weeks: 'Weeks 34–36',
        title: 'Fast Finger Math',
        focus: 'Developing subitizing and finger dexterity for quantities up to 4.',
        activities: [
          'Flash 2 fingers: "Peace sign!" Flash 3 fingers: "Three little birds!"',
          'Hide fingers behind your back and pop out 4 fingers like a surprise blossom',
          'Drop 4 counting pebbles into a tin can and listen to the distinct clinks'
        ],
        vocabulary: ['Fingers', 'Flash', 'Quick', 'Hands'],
        everydayMathTip: 'Practice high-fives with 1, 2, 3, or 4 fingers before leaving for the park.'
      }
    ],
    rhymeSong: {
      title: 'Four Little Ducks',
      lyrics: [
        'Four little ducks went swimming one day,',
        'Over the hills and far away,',
        'Mother duck said, "Quack, quack, quack, quack,"',
        'And four happy little ducks came back!'
      ],
      audioPrompt: 'Waddle like four little ducklings! Quack, quack, quack, quack!'
    },
    handsOnGame: {
      id: 'game-flower-pattern',
      name: 'Spring Flower Pattern Builder',
      instructions: 'Complete the spring garden pattern! What flower comes next: Pink, Yellow, Pink, [?]'
    },
    quickChallenge: {
      question: 'Look at the pattern: 🌸 🌼 🌸 🌼. What flower comes next?',
      options: ['Pink Flower 🌸', 'Yellow Flower 🌼', 'Blue Berry 🫐'],
      correctIndex: 0,
      explanation: 'Hooray! The pattern is Pink, Yellow, Pink, Yellow, so a Pink Flower 🌸 comes next!',
      hint: 'Say it out loud: Pink, Yellow, Pink, Yellow, then...',
      audioVoice: 'Pink, Yellow, Pink, Yellow! What flower blooms next?'
    },
    parentAtHomeToolkit: {
      title: 'Session 3 Home Play Guide',
      tips: [
        'Take outdoor nature walks and count 4 leaves, 4 stones, or 4 birds.',
        'Use musical clapping games to build pattern rhythm in a playful way.',
        'Have your toddler pass you 4 crayons one by one while drawing colorful rainbows.'
      ]
    }
  },

  // ==========================================
  // SESSION 4: SUMMER / TERM 4
  // ==========================================
  {
    sessionNumber: 4,
    season: 'Summer',
    termTitle: 'Session 4: The High Five! Counting to 5 & Readiness',
    subtitle: 'Mastering counting 1 through 5, matching written numerals, and preparing for Age 4 milestones.',
    duration: 'Weeks 37–48 (Summer Term)',
    colorTheme: {
      primary: 'bg-purple-600',
      light: 'bg-purple-50',
      border: 'border-purple-200',
      accent: 'text-purple-700',
      badge: 'bg-purple-100 text-purple-800 border-purple-300',
      text: 'text-purple-900',
      gradient: 'from-purple-500/10 via-pink-500/5 to-transparent'
    },
    icon: '☀️',
    cognitiveMilestone:
      'Learners solidify cardinal number mastery up to 5 (the last number named tells how many in total) and match physical sets to written digits 1–5.',
    coreObjectives: [
      'Counts 5 items fluently and states the cardinal total ("There are 5!")',
      'Matches written numerals 1, 2, 3, 4, 5 to groups of real objects',
      'Discovers triangles (3 sides) and recognizes all 3 basic preschool shapes',
      'Uses spatial prepositions: "On top", "Under", and "Next to"'
    ],
    units: [
      {
        id: 's4-u1',
        weeks: 'Weeks 37–39',
        title: 'Give Me High Five!',
        focus: 'Counting all 5 fingers on one hand and understanding the number 5.',
        activities: [
          'Trace your hand on paper and count each finger: 1, 2, 3, 4, 5!',
          'Give everyone in the family a celebratory High-Five!',
          'Line up 5 toy dinosaurs for a sunny summer parade'
        ],
        vocabulary: ['Five', 'Hand', 'High-Five', 'Total'],
        everydayMathTip: 'Hold up an open palm: "Look at your whole hand—it has five wonderful counting fingers!"'
      },
      {
        id: 's4-u2',
        weeks: 'Weeks 40–42',
        title: 'The Pointy Triangle',
        focus: 'Introducing the 3-sided triangle and spotting shapes in summer foods.',
        activities: [
          'Cut a sandwich or watermelon slice into triangles with 3 points',
          'Make a party hat with folded paper and count the 3 corners',
          'Sort toys into three boxes: Circles, Squares, and Triangles'
        ],
        vocabulary: ['Triangle', 'Point', 'Three Sides', 'Shape'],
        everydayMathTip: 'Notice triangular road warning signs and pizza slices during family meals.'
      },
      {
        id: 's4-u3',
        weeks: 'Weeks 43–45',
        title: 'Where Is the Teddy Bear?',
        focus: 'Spatial positioning words for navigating 3D physical space.',
        activities: [
          'Play hide-and-seek with a teddy bear: "Is teddy UNDER the bed or ON TOP of the chair?"',
          'Crawl under the kitchen table and stand next to Mommy',
          'Put the red ball behind the box and the blue ball in front'
        ],
        vocabulary: ['On top', 'Under', 'Behind', 'In front', 'Next to'],
        everydayMathTip: 'Give fun spatial treasure hunt instructions: "Find the book on top of the small table!"'
      },
      {
        id: 's4-u4',
        weeks: 'Weeks 46–48',
        title: 'Preschool Math Star Parade',
        focus: 'Cumulative celebration of numbers 1–5, shapes, and Age 4 readiness.',
        activities: [
          'Count from 1 to 5 forwards and do a happy dance',
          'Match digit cards 1, 2, 3, 4, 5 to sets of counting bears',
          'Receive the Age 3 Early Sprout Completion Star Badge!'
        ],
        vocabulary: ['Mastery', 'Ready', 'Celebrate', 'Star'],
        everydayMathTip: 'Print or draw a simple colorful diploma badge to celebrate their mathematical curiosity!'
      }
    ],
    rhymeSong: {
      title: 'Five Green and Speckled Frogs',
      lyrics: [
        'Five green and speckled frogs,',
        'Sat on a speckled log,',
        'Eating some most delicious bugs, Yum, yum!',
        'One jumped into the pool, where it was nice and cool,',
        'Now there are four green speckled frogs, Glub, glub!'
      ],
      audioPrompt: 'Count on your fingers: Five frogs, then four frogs, splashing into the pond!'
    },
    handsOnGame: {
      id: 'game-star-collector',
      name: 'High-Five 1–5 Star Parade',
      instructions: 'Tap the 5 golden stars to light up the night sky! Watch the numbers 1, 2, 3, 4, 5 shine.'
    },
    quickChallenge: {
      question: 'Count the friendly summer bees buzzing in the flowers: 🐝 🐝 🐝 🐝 🐝. How many bees are there?',
      options: ['3 Bees', '4 Bees', '5 Bees! 🌟'],
      correctIndex: 2,
      explanation: 'Fantastic! Touch and count: 1, 2, 3, 4, 5! There are five busy summer bees!',
      hint: 'Count each bee with your finger, just like the five fingers on your hand!',
      audioVoice: 'Count the buzzing bees one by one: one, two, three, four, five!'
    },
    parentAtHomeToolkit: {
      title: 'Session 4 Home Play Guide',
      tips: [
        'Celebrate cardinal counting: after counting to 5, emphasize "So we have FIVE altogether!"',
        'Make numbers visible: put magnetic numerals 1–5 on the refrigerator at child eye-level.',
        'Get ready for Age 4 by encouraging child-led counting questions: "How many trees do you see?"'
      ]
    }
  }
];

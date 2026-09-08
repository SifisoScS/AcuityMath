import { GoogleGenAI } from '@google/genai';

let aiClient: GoogleGenAI | null = null;

export function getGeminiClient(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY' || apiKey.trim() === '') {
    return null;
  }
  if (!aiClient) {
    aiClient = new GoogleGenAI({ apiKey });
  }
  return aiClient;
}

export interface SocraticRequest {
  problemQuestion: string;
  options: string[];
  correctAnswer: string;
  studentAnswer?: string | null;
  studentAge: number;
  tier: string;
  hint?: string;
  explanation?: string;
  mode: 'hint' | 'explain_misconception' | 'socratic_question' | 'real_world_analogy' | 'custom';
  userMessage?: string;
}

export interface SocraticResponse {
  message: string;
  source: 'gemini-3.8-flash' | 'socratic-engine-fallback';
  followUpPrompt?: string;
}

/**
 * Generates a Socratic pedagogical coaching response tailored to age and learning context.
 */
export async function generateSocraticResponse(req: SocraticRequest): Promise<SocraticResponse> {
  const ai = getGeminiClient();

  const systemPrompt = `You are AcuityMath's Socratic Math Coach, an expert, supportive mathematics educator specializing in learners aged ${req.studentAge} (${req.tier} tier).

CRITICAL SOCRATIC PEDAGOGY DIRECTIVE:
- NEVER blurt out the direct solution or final answer right away.
- Guide the student to discover the breakthrough themselves using the Socratic method.
- Match your vocabulary, tone, and metaphors to the student's age (${req.studentAge} years old):
  * Ages 3-5: Use warm, joyful, concrete language with cheerful emojis/visual cues (toys, apples, puppies, stars). Very short sentences.
  * Ages 6-10: Encouraging, friendly, step-by-step chunking. Relate to everyday pizza, sharing, or building blocks.
  * Ages 11-13: Inquisitive, encouraging independence. Use balance scale, reverse operations, and real-world scenarios (money, speed, sports).
  * Ages 14-18: Mathematically clear, rigorous yet intuitive. Reference geometric properties, algebraic transformations, or rates of change.
- Keep your response concise (maximum 3-4 short paragraphs or structured bullet steps).
- Always end with ONE gentle, thought-provoking guiding question to check the student's next step.`;

  const userPrompt = `
Problem Question: ${req.problemQuestion}
Available Options: ${req.options.join(', ')}
Official Correct Answer: ${req.correctAnswer}
Official Hint: ${req.hint || 'N/A'}
Official Explanation: ${req.explanation || 'N/A'}
Student's Selected Answer: ${req.studentAnswer || 'None yet (Student is asking for guidance before answering)'}
Requested Coach Mode: ${req.mode}
${req.userMessage ? `Student's Question/Note: "${req.userMessage}"` : ''}

Please provide your Socratic guidance for mode "${req.mode}".`;

  if (ai) {
    try {
      const response = await ai.models.generateContent({
        model: 'gemini-3.8-flash',
        contents: userPrompt,
        config: {
          systemInstruction: systemPrompt,
          temperature: 0.6,
        },
      });

      const text = response.text?.trim();
      if (text && text.length > 0) {
        return {
          message: text,
          source: 'gemini-3.8-flash',
          followUpPrompt: getSuggestedFollowUp(req.mode, req.tier)
        };
      }
    } catch (error) {
      console.warn('[Gemini AI Coach] Error generating response, falling back to heuristic engine:', error);
    }
  }

  // Graceful heuristic fallback engine if Gemini API key is missing or offline
  return generateHeuristicSocraticFallback(req);
}

function getSuggestedFollowUp(mode: string, tier: string): string {
  if (mode === 'hint') return 'Would you like to try step 1 together?';
  if (mode === 'explain_misconception') return 'Does this explanation make sense, or should we see an analogy?';
  if (mode === 'real_world_analogy') return 'How would you apply this analogy back to our numbers?';
  return tier.includes('Early') ? 'What number do you see first?' : 'What is your first step?';
}

function generateHeuristicSocraticFallback(req: SocraticRequest): SocraticResponse {
  const isEarly = req.studentAge <= 5;
  const isElementary = req.studentAge >= 6 && req.studentAge <= 10;
  const isMiddle = req.studentAge >= 11 && req.studentAge <= 13;

  if (req.mode === 'explain_misconception' && req.studentAnswer) {
    if (isEarly) {
      return {
        message: `Great try! You picked ${req.studentAnswer}. Let's count our items one by one on our fingers or tap each picture slowly. Remember, counting each one only once gives us the real total! 🌟`,
        source: 'socratic-engine-fallback',
        followUpPrompt: 'Can you count with me from 1?'
      };
    }
    if (isElementary) {
      return {
        message: `You selected ${req.studentAnswer}. That's a super common path when we look at the numbers quickly! Notice what operation is being asked. Are we putting groups together (multiplying) or sharing them equally (dividing)? Check your step before the final calculation.`,
        source: 'socratic-engine-fallback',
        followUpPrompt: 'What operation does the question ask us to do first?'
      };
    }
    return {
      message: `You selected ${req.studentAnswer}. Let's inspect that choice: often this occurs if a sign was flipped during distribution, or if the order of operations (PEMDAS) was evaluated left-to-right before exponents/multiplication. Let's isolate the variable again step by step.`,
      source: 'socratic-engine-fallback',
      followUpPrompt: 'What happens if you isolate the variable term on one side first?'
    };
  }

  if (req.mode === 'real_world_analogy') {
    if (isEarly) {
      return {
        message: `Imagine you have a basket of delicious red apples! 🍎 If a friendly bunny gives you 2 more apples, your basket gets bigger! That is just like our problem here.`,
        source: 'socratic-engine-fallback',
        followUpPrompt: 'How many apples would be in the basket now?'
      };
    }
    if (isElementary) {
      return {
        message: `Think of this like sharing a large cheese pizza with your friends! 🍕 If the pizza is sliced into 8 equal pieces and you eat 2 slices, you have eaten 2 out of 8 parts, which is the same as 1 out of 4 quarter parts!`,
        source: 'socratic-engine-fallback',
        followUpPrompt: 'Can you see how 2/8 is equivalent to 1/4?'
      };
    }
    if (isMiddle) {
      return {
        message: `Think of this equation like an old-fashioned balance scale in a market. Whatever weights you add or remove from the left pan, you MUST do the exact same thing to the right pan to keep it perfectly level!`,
        source: 'socratic-engine-fallback',
        followUpPrompt: 'What operation will balance both sides equally?'
      };
    }
    return {
      message: `Think of the derivative as the speedometer on a moving sports car. It tells you your instantaneous speed at that exact millisecond, rather than your average speed over the whole trip!`,
      source: 'socratic-engine-fallback',
      followUpPrompt: 'How does the slope of the secant line approach the tangent line?'
    };
  }

  if (req.mode === 'hint') {
    return {
      message: req.hint
        ? `Here is a Socratic clue to point you forward: ${req.hint}`
        : `Take a breath and look at the key values given in the question. What is the problem specifically asking you to find?`,
      source: 'socratic-engine-fallback',
      followUpPrompt: 'What is the very first number or variable you want to work with?'
    };
  }

  // Default socratic question / step-by-step
  return {
    message: `Let's break this down together! Before looking at the options, what relationship do you notice between the numbers in the question? If you estimate first, does your intuition tell you the answer will be bigger or smaller?`,
    source: 'socratic-engine-fallback',
    followUpPrompt: 'Give your best estimate and tell me why!'
  };
}

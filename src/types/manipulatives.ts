import { AgeTier } from '../types';

export type LabToolId =
  | 'ten_frame'
  | 'subitizing'
  | 'shape_patterns'
  | 'fraction_visualizer'
  | 'base_ten'
  | 'coordinate_grapher'
  | 'unit_circle'
  | 'calculus_derivative';

export interface ManipulativeToolMeta {
  id: LabToolId;
  tier: AgeTier;
  title: string;
  subtitle: string;
  ageRange: string;
  badge: string;
  category: 'Counting & Number Sense' | 'Fractions & Place Value' | 'Algebra & Geometry' | 'Trigonometry & Calculus';
  concepts: string[];
}

export interface LabChallenge {
  id: string;
  prompt: string;
  targetValue: number | string;
  hint: string;
  xpReward: number;
}

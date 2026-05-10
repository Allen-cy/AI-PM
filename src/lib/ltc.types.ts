// LTC Type Definitions - separated to avoid circular imports
export interface RACIMatrix {
  roles: string[];
  workProducts: string[];
  assignments: string[][];
}

export interface LTCStage {
  id: string;
  number: number;
  name: string;
  alias: string;
  entryCriteria: string[];
  exitCriteria: string[];
  deliverables: string[];
  raciMatrix: RACIMatrix;
  duration: string;
  status: 'pending' | 'in-progress' | 'completed' | 'blocked';
}

export interface LTCProject {
  id: string;
  name: string;
  currentStage: number;
  stages: LTCStage[];
  startedAt: string;
  completedAt?: string;
}
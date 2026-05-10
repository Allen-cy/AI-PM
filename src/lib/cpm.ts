// CPM (Critical Path Method) Calculator - Pure local algorithm, no LLM

export interface Task {
  id: string;
  name: string;
  duration: number; // days
  predecessors: string[]; // list of task IDs that must complete before this starts
  es?: number; // Early Start
  ef?: number; // Early Finish
  ls?: number; // Late Start
  lf?: number; // Late Finish
  totalFloat?: number; // Total float/slack
  isCritical?: boolean;
}

export interface CPMResult {
  tasks: Task[];
  criticalPath: string[]; // ordered list of critical task IDs
  projectDuration: number;
  criticalDuration: number;
}

// Topological sort using Kahn's algorithm with adjacency list for correct successor lookup
// IMPORTANT: Works directly on the passed tasks array - modifies task objects in place
function topologicalSort(tasks: Task[]): Task[] {
  const inDegree = new Map<string, number>();
  // Build adjacency list: task -> list of successors that depend on it
  const successors = new Map<string, string[]>();
  tasks.forEach(t => {
    inDegree.set(t.id, t.predecessors.length);
    successors.set(t.id, []);
  });
  // Populate successors: for each task, add it to its predecessors' successor lists
  for (const t of tasks) {
    for (const predId of t.predecessors) {
      if (successors.has(predId)) {
        successors.get(predId)!.push(t.id);
      }
    }
  }

  const result: Task[] = [];
  // Build lookup map for queue push - map id to actual task object from input array
  const taskById = new Map(tasks.map(t => [t.id, t]));
  const queue: Task[] = [];
  // Initial queue: tasks with no predecessors (use actual task objects)
  for (const t of tasks) {
    if (t.predecessors.length === 0) queue.push(t);
  }

  while (queue.length > 0) {
    const task = queue.shift()!;
    result.push(task);

    // Only decrement in-degree for direct successors of this task
    const succList = successors.get(task.id) || [];
    for (const succId of succList) {
      const newDegree = (inDegree.get(succId) ?? 0) - 1;
      inDegree.set(succId, newDegree);
      if (newDegree === 0) {
        const succ = taskById.get(succId);
        if (succ) queue.push(succ);
      }
    }
  }

  return result;
}

export function calculateCPM(inputTasks: Task[]): CPMResult {
  if (inputTasks.length === 0) return { tasks: [], criticalPath: [], projectDuration: 0, criticalDuration: 0 };

  const tasks = inputTasks.map(t => ({ ...t })); // shallow copy for input safety
  // taskMap maps to actual task objects in the 'tasks' array
  const taskMap = new Map(tasks.map(t => [t.id, t]));

  // Forward pass - calculate ES and EF
  const sorted = topologicalSort(tasks);
  for (const task of sorted) {
    // ES = max(EF of all predecessors)
    const maxPredecessorEF = task.predecessors.reduce((max, predId) => {
      const pred = taskMap.get(predId);
      return Math.max(max, pred?.ef ?? 0);
    }, 0);
    task.es = maxPredecessorEF;
    task.ef = task.es + task.duration;
  }

  // Find project duration (max EF)
  const projectDuration = Math.max(...tasks.map(t => t.ef ?? 0));

  // Backward pass - calculate LS and LF
  // Start from tasks with no successors
  for (let i = sorted.length - 1; i >= 0; i--) {
    const task = sorted[i];
    const successors = tasks.filter(t => t.predecessors.includes(task.id));

    if (successors.length === 0) {
      // No successors = LF = project duration
      task.lf = projectDuration;
    } else {
      // LF = min(LS of all successors)
      task.lf = Math.min(...successors.map(s => s.ls ?? projectDuration));
    }
    task.ls = task.lf - task.duration;
    task.totalFloat = (task.lf ?? 0) - (task.ef ?? 0);
    task.isCritical = task.totalFloat === 0;
  }

  // Find all tasks on critical path (zero total float)
  const criticalTasks = tasks.filter(t => t.isCritical);

  // Build ordered critical path from start to end
  // Topologically sort ALL tasks, then filter to critical ones
  const criticalPath: string[] = [];

  if (criticalTasks.length > 0) {
    // Topological order of all tasks gives us proper precedence ordering
    const allSorted = topologicalSort(tasks);
    // Filter to just critical tasks, preserving network order
    const criticalInOrder = allSorted.filter(t => t.isCritical);

    // Deduplicate while preserving order
    const seen = new Set<string>();
    for (const t of criticalInOrder) {
      if (!seen.has(t.id)) {
        criticalPath.push(t.id);
        seen.add(t.id);
      }
    }
  }

  return { tasks, criticalPath, projectDuration, criticalDuration: projectDuration };
}

// Generate Gantt chart data
export function generateGanttData(tasks: Task[]): Array<{
  id: string;
  name: string;
  start: number;
  end: number;
  isCritical: boolean;
  progress?: number;
}> {
  return tasks.map(t => ({
    id: t.id,
    name: t.name,
    start: t.es ?? 0,
    end: t.ef ?? t.duration,
    isCritical: t.isCritical ?? false,
  }));
}

// Calculate multiple project scenarios for comparison
export function compareSchedules(baseline: Task[], current: Task[]): {
  baselineDuration: number;
  currentDuration: number;
  delta: number;
  impactedTasks: string[];
} {
  const baselineResult = calculateCPM(baseline);
  const currentResult = calculateCPM(current);

  const baselineDuration = baselineResult.projectDuration;
  const currentDuration = currentResult.projectDuration;
  const delta = currentDuration - baselineDuration;

  // Find tasks impacted by delay
  const currentMap = new Map(current.map(t => [t.id, t]));
  const impactedTasks = current
    .filter(t => {
      const baselineTask = baseline.find(b => b.id === t.id);
      return baselineTask && (t.es ?? 0) > (baselineTask.es ?? 0) + 1;
    })
    .map(t => t.id);

  return { baselineDuration, currentDuration, delta, impactedTasks };
}
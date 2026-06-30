import type { Task } from "@/lib/cpm";

export interface NetworkTask extends Task {
  es: number;
  ef: number;
  ls: number;
  lf: number;
  totalFloat: number;
  isCritical: boolean;
}

export interface NetworkNodePosition {
  x: number;
  y: number;
  rank: number;
  lane: number;
}

export interface NetworkEdge {
  fromId: string;
  toId: string;
  isCritical: boolean;
  path: string;
}

export interface NetworkLayout {
  positions: Map<string, NetworkNodePosition>;
  edges: NetworkEdge[];
  width: number;
  height: number;
  nodeWidth: number;
  nodeHeight: number;
}

const NODE_WIDTH = 172;
const NODE_HEIGHT = 66;
const COLUMN_GAP = 112;
const ROW_GAP = 34;
const LEFT_PAD = 42;
const RIGHT_PAD = 56;
const TOP_CORRIDOR_BASE = 58;
const BOTTOM_PAD = 44;

function topologicalTasks(tasks: NetworkTask[]): NetworkTask[] {
  const byId = new Map(tasks.map(task => [task.id, task]));
  const indegree = new Map(tasks.map(task => [task.id, 0]));
  const children = new Map<string, string[]>();

  for (const task of tasks) {
    for (const predId of task.predecessors) {
      if (!byId.has(predId)) continue;
      indegree.set(task.id, (indegree.get(task.id) ?? 0) + 1);
      children.set(predId, [...(children.get(predId) ?? []), task.id]);
    }
  }

  const queue = tasks
    .filter(task => (indegree.get(task.id) ?? 0) === 0)
    .sort((a, b) => (a.es - b.es) || a.id.localeCompare(b.id));
  const output: NetworkTask[] = [];

  while (queue.length > 0) {
    const current = queue.shift()!;
    output.push(current);
    for (const childId of children.get(current.id) ?? []) {
      indegree.set(childId, (indegree.get(childId) ?? 0) - 1);
      if ((indegree.get(childId) ?? 0) === 0) {
        const child = byId.get(childId);
        if (child) {
          queue.push(child);
          queue.sort((a, b) => (a.es - b.es) || a.id.localeCompare(b.id));
        }
      }
    }
  }

  if (output.length !== tasks.length) {
    return [...tasks].sort((a, b) => (a.es - b.es) || a.id.localeCompare(b.id));
  }
  return output;
}

export function buildCriticalEdges(criticalPath: string[]) {
  const criticalEdges = new Set<string>();
  criticalPath.forEach((id, index) => {
    const next = criticalPath[index + 1];
    if (next) criticalEdges.add(`${id}->${next}`);
  });
  return criticalEdges;
}

export function buildCriticalPathNetworkLayout(tasks: NetworkTask[], criticalPath: string[]): NetworkLayout {
  const ordered = topologicalTasks(tasks);
  const byId = new Map(tasks.map(task => [task.id, task]));
  const ranks = new Map<string, number>();

  for (const task of ordered) {
    const validPredecessors = task.predecessors.filter(predId => byId.has(predId));
    const rank = validPredecessors.length === 0
      ? 0
      : Math.max(...validPredecessors.map(predId => ranks.get(predId) ?? 0)) + 1;
    ranks.set(task.id, rank);
  }

  const layers = new Map<number, NetworkTask[]>();
  for (const task of ordered) {
    const rank = ranks.get(task.id) ?? 0;
    layers.set(rank, [...(layers.get(rank) ?? []), task]);
  }

  for (const [rank, layerTasks] of layers) {
    layers.set(rank, layerTasks.sort((a, b) => {
      if (a.isCritical !== b.isCritical) return a.isCritical ? -1 : 1;
      return (a.es - b.es) || a.id.localeCompare(b.id);
    }));
  }

  const criticalEdges = buildCriticalEdges(criticalPath);
  const rawEdges = ordered.flatMap(task =>
    task.predecessors
      .filter(predId => byId.has(predId))
      .map(predId => ({
        fromId: predId,
        toId: task.id,
        isCritical: criticalEdges.has(`${predId}->${task.id}`),
      })),
  );
  const longEdgeCount = rawEdges.filter(edge => (ranks.get(edge.toId) ?? 0) - (ranks.get(edge.fromId) ?? 0) > 1).length;
  const topPad = TOP_CORRIDOR_BASE + Math.min(96, longEdgeCount * 14);
  const maxRank = Math.max(0, ...[...layers.keys()]);
  const maxLayerSize = Math.max(1, ...[...layers.values()].map(layer => layer.length));
  const positions = new Map<string, NetworkNodePosition>();

  for (const [rank, layerTasks] of layers) {
    layerTasks.forEach((task, lane) => {
      positions.set(task.id, {
        x: LEFT_PAD + rank * (NODE_WIDTH + COLUMN_GAP),
        y: topPad + lane * (NODE_HEIGHT + ROW_GAP),
        rank,
        lane,
      });
    });
  }

  let longEdgeLane = 0;
  const edges = rawEdges.map(edge => {
    const from = positions.get(edge.fromId)!;
    const to = positions.get(edge.toId)!;
    const fromRank = ranks.get(edge.fromId) ?? 0;
    const toRank = ranks.get(edge.toId) ?? 0;
    const startX = from.x + NODE_WIDTH;
    const startY = from.y + NODE_HEIGHT / 2;
    const endX = to.x;
    const endY = to.y + NODE_HEIGHT / 2;
    const rankDistance = toRank - fromRank;

    if (rankDistance <= 1) {
      const gutterX = startX + COLUMN_GAP / 2;
      return {
        ...edge,
        path: `M ${startX} ${startY} L ${gutterX} ${startY} L ${gutterX} ${endY} L ${endX - 10} ${endY}`,
      };
    }

    const corridorY = TOP_CORRIDOR_BASE - 22 + (longEdgeLane % 8) * 12;
    longEdgeLane += 1;
    const exitX = startX + Math.min(44, COLUMN_GAP / 2);
    const enterX = endX - Math.min(44, COLUMN_GAP / 2);
    return {
      ...edge,
      path: `M ${startX} ${startY} L ${exitX} ${startY} L ${exitX} ${corridorY} L ${enterX} ${corridorY} L ${enterX} ${endY} L ${endX - 10} ${endY}`,
    };
  });

  return {
    positions,
    edges,
    width: LEFT_PAD + (maxRank + 1) * NODE_WIDTH + maxRank * COLUMN_GAP + RIGHT_PAD,
    height: topPad + maxLayerSize * NODE_HEIGHT + Math.max(0, maxLayerSize - 1) * ROW_GAP + BOTTOM_PAD,
    nodeWidth: NODE_WIDTH,
    nodeHeight: NODE_HEIGHT,
  };
}

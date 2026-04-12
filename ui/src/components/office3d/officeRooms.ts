/**
 * officeRooms — multi-room layout + pathfinding for the v12 office.
 *
 * Defines 5 rooms (CEO Office, Creative Studio, Creative Lab, Tech Lab, Lounge)
 * connected by portal openings in interior walls. Provides:
 *   - ROOMS:   room bounds + visual style (floor, walls, ambient)
 *   - PORTALS: door openings between rooms
 *   - INTERNAL_WALLS: derived list of physical walls between rooms
 *   - pointInRoom(pos): which room contains a position
 *   - findRoomSequence(from, to): BFS the room graph
 *   - computeRoomPath(start, end): full multi-room walking path
 *
 * Coordinate system follows officeLayout.ts: +X right, +Y up, +Z toward camera.
 */
import type { Vec3 } from "./officeLayout";

export type RoomId =
  | "ceo-office"
  | "creative-studio"
  | "creative-lab"
  | "tech-lab"
  | "lounge";

export type FloorMaterial =
  | "parquet-warm"
  | "epoxy-blue"
  | "carpet-gray"
  | "concrete";

export interface RoomDef {
  id: RoomId;
  label: string;
  /** Inner bounds (the floor patch). Walls live ON these boundaries. */
  bounds: { xMin: number; xMax: number; zMin: number; zMax: number };
  floorMaterial: FloorMaterial;
  /** Wall accent color (interior face) */
  wallColor: string;
  /** Center used as default destination for "walk to room" */
  center: Vec3;
  /**
   * Corridor waypoint(s) inside this room that agents route through to
   * avoid walking straight through desk clusters. When an intra-room path
   * is longer than ~2 units, the agent walks via these points.
   */
  corridors: Vec3[];
}

export interface PortalDef {
  /** Two rooms this portal connects */
  rooms: [RoomId, RoomId];
  /** Wall axis: "x" = vertical wall on a constant-X plane,
   *             "z" = horizontal wall on a constant-Z plane */
  axis: "x" | "z";
  /** Position of the wall along its axis */
  wallAt: number;
  /** Center of the door opening on the perpendicular axis */
  openCenter: number;
  /** Width of the door opening */
  openWidth: number;
}

export interface InternalWallDef {
  axis: "x" | "z";
  /** Wall position along its axis */
  at: number;
  /** Range covered along the perpendicular axis [min, max] */
  range: [number, number];
  /** Door openings along this wall (perpendicular axis center + width) */
  openings: Array<{ center: number; width: number }>;
}

const STAND_Y = 0;

export const ROOMS: RoomDef[] = [
  {
    id: "ceo-office",
    label: "CEO Office",
    bounds: { xMin: -15, xMax: -7, zMin: -9, zMax: -1 },
    floorMaterial: "parquet-warm",
    wallColor: "#3a2a1e",
    center: [-11, STAND_Y, -5],
    // Corridor runs along the front of the desk (z=-3.5) and left wall
    corridors: [[-13, STAND_Y, -3], [-9, STAND_Y, -3]],
  },
  {
    id: "creative-studio",
    label: "Creative Studio",
    bounds: { xMin: -7, xMax: 5, zMin: -9, zMax: -1 },
    floorMaterial: "parquet-warm",
    wallColor: "#4a3460",
    center: [-1, STAND_Y, -5],
    // Corridor along the front of the desk cluster (z=-2)
    corridors: [[-5, STAND_Y, -2], [3, STAND_Y, -2]],
  },
  {
    id: "creative-lab",
    label: "Creative Lab",
    bounds: { xMin: 5, xMax: 15, zMin: -9, zMax: -1 },
    floorMaterial: "concrete",
    wallColor: "#2a3340",
    center: [10, STAND_Y, -5],
    // Corridor front of desk (z=-2) and along the left side
    corridors: [[ 7, STAND_Y, -2], [13, STAND_Y, -2]],
  },
  {
    id: "lounge",
    label: "Lounge",
    bounds: { xMin: -15, xMax: -3, zMin: -1, zMax: 9 },
    floorMaterial: "carpet-gray",
    wallColor: "#3a2a20",
    center: [-9, STAND_Y, 4],
    // Open space — single central waypoint is enough
    corridors: [[-9, STAND_Y, 2]],
  },
  {
    id: "tech-lab",
    label: "Tech Lab",
    bounds: { xMin: -3, xMax: 15, zMin: -1, zMax: 9 },
    floorMaterial: "epoxy-blue",
    wallColor: "#1a2838",
    center: [6, STAND_Y, 4],
    // Corridor between the two desk clusters (x=5.5) and along back/front
    corridors: [[5.5, STAND_Y, 1], [5.5, STAND_Y, 7]],
  },
];

const ROOMS_BY_ID: Record<RoomId, RoomDef> = ROOMS.reduce(
  (acc, r) => {
    acc[r.id] = r;
    return acc;
  },
  {} as Record<RoomId, RoomDef>,
);

export function getRoom(id: RoomId): RoomDef {
  return ROOMS_BY_ID[id];
}

/**
 * Door openings connecting adjacent rooms. Each portal cuts a hole in the
 * shared wall. The wall axis ("x" or "z") matches the constant-axis of the
 * dividing plane; openCenter is the position along the perpendicular axis.
 */
export const PORTALS: PortalDef[] = [
  // Top row — between back-row rooms
  { rooms: ["ceo-office", "creative-studio"], axis: "x", wallAt: -7, openCenter: -5, openWidth: 1.8 },
  { rooms: ["creative-studio", "creative-lab"], axis: "x", wallAt: 5, openCenter: -5, openWidth: 1.8 },
  // Top → bottom row (along the z=-1 boundary)
  { rooms: ["ceo-office", "lounge"], axis: "z", wallAt: -1, openCenter: -11, openWidth: 1.8 },
  { rooms: ["creative-studio", "lounge"], axis: "z", wallAt: -1, openCenter: -5, openWidth: 1.8 },
  { rooms: ["creative-studio", "tech-lab"], axis: "z", wallAt: -1, openCenter: 1, openWidth: 1.8 },
  { rooms: ["creative-lab", "tech-lab"], axis: "z", wallAt: -1, openCenter: 10, openWidth: 1.8 },
  // Bottom row internal divider
  { rooms: ["lounge", "tech-lab"], axis: "x", wallAt: -3, openCenter: 4, openWidth: 1.8 },
];

/**
 * Physical interior walls derived from the room layout. Each wall is one
 * continuous straight segment at a constant axis position; openings are the
 * doorways carved out for the portals on that wall.
 *
 * The list is hand-authored (not auto-derived) so the renderer doesn't have
 * to reason about overlapping room boundaries. Renderer just renders these.
 */
export const INTERNAL_WALLS: InternalWallDef[] = [
  // Vertical walls (constant X)
  {
    axis: "x",
    at: -7,
    range: [-9, -1],
    openings: [{ center: -5, width: 1.8 }],
  },
  {
    axis: "x",
    at: 5,
    range: [-9, -1],
    openings: [{ center: -5, width: 1.8 }],
  },
  {
    axis: "x",
    at: -3,
    range: [-1, 9],
    openings: [{ center: 4, width: 1.8 }],
  },
  // Horizontal wall (constant Z) — the long divider between top and bottom
  {
    axis: "z",
    at: -1,
    range: [-15, 15],
    openings: [
      { center: -11, width: 1.8 },
      { center: -5, width: 1.8 },
      { center: 1, width: 1.8 },
      { center: 10, width: 1.8 },
    ],
  },
];

/** Find which room a 3D point belongs to. Returns null if outside all rooms. */
export function pointInRoom(p: Vec3): RoomId | null {
  for (const r of ROOMS) {
    if (
      p[0] >= r.bounds.xMin &&
      p[0] <= r.bounds.xMax &&
      p[2] >= r.bounds.zMin &&
      p[2] <= r.bounds.zMax
    ) {
      return r.id;
    }
  }
  return null;
}

/** Adjacency list built once from PORTALS */
const ADJACENCY: Record<RoomId, Array<{ to: RoomId; portal: PortalDef }>> = (() => {
  const adj: Partial<Record<RoomId, Array<{ to: RoomId; portal: PortalDef }>>> = {};
  for (const r of ROOMS) adj[r.id] = [];
  for (const p of PORTALS) {
    adj[p.rooms[0]]!.push({ to: p.rooms[1], portal: p });
    adj[p.rooms[1]]!.push({ to: p.rooms[0], portal: p });
  }
  return adj as Record<RoomId, Array<{ to: RoomId; portal: PortalDef }>>;
})();

/** BFS the room graph. Returns the sequence of rooms (inclusive endpoints). */
export function findRoomSequence(from: RoomId, to: RoomId): RoomId[] {
  if (from === to) return [from];
  const visited = new Set<RoomId>([from]);
  const queue: Array<{ room: RoomId; path: RoomId[] }> = [
    { room: from, path: [from] },
  ];
  while (queue.length > 0) {
    const { room, path } = queue.shift()!;
    for (const { to: next } of ADJACENCY[room]) {
      if (visited.has(next)) continue;
      const newPath = [...path, next];
      if (next === to) return newPath;
      visited.add(next);
      queue.push({ room: next, path: newPath });
    }
  }
  return [];
}

/** Get the portal connecting two adjacent rooms (if any). */
export function findPortal(from: RoomId, to: RoomId): PortalDef | null {
  for (const { to: t, portal } of ADJACENCY[from]) {
    if (t === to) return portal;
  }
  return null;
}

/**
 * Two waypoints for crossing a portal: an "approach" point on the `from`
 * side and an "exit" point on the `to` side, both offset from the wall to
 * avoid clipping.
 */
export function portalWaypoints(portal: PortalDef, fromRoom: RoomId): [Vec3, Vec3] {
  const offset = 0.7;
  const fromDef = getRoom(fromRoom);
  if (portal.axis === "x") {
    // Vertical wall — fromRoom is on one side along X
    const fromIsLeft = fromDef.bounds.xMax === portal.wallAt;
    const fromX = fromIsLeft ? portal.wallAt - offset : portal.wallAt + offset;
    const toX = fromIsLeft ? portal.wallAt + offset : portal.wallAt - offset;
    return [
      [fromX, STAND_Y, portal.openCenter],
      [toX, STAND_Y, portal.openCenter],
    ];
  } else {
    // Horizontal wall — fromRoom is on one side along Z
    const fromIsTop = fromDef.bounds.zMax === portal.wallAt;
    const fromZ = fromIsTop ? portal.wallAt - offset : portal.wallAt + offset;
    const toZ = fromIsTop ? portal.wallAt + offset : portal.wallAt - offset;
    return [
      [portal.openCenter, STAND_Y, fromZ],
      [portal.openCenter, STAND_Y, toZ],
    ];
  }
}

/**
 * Find the nearest corridor waypoint in a room to a given position.
 */
function nearestCorridor(room: RoomDef, pos: Vec3): Vec3 | null {
  if (room.corridors.length === 0) return null;
  let best = room.corridors[0];
  let bestDist = Math.hypot(pos[0] - best[0], pos[2] - best[2]);
  for (let i = 1; i < room.corridors.length; i++) {
    const c = room.corridors[i];
    const d = Math.hypot(pos[0] - c[0], pos[2] - c[2]);
    if (d < bestDist) {
      best = c;
      bestDist = d;
    }
  }
  return best;
}

/**
 * Multi-room walking path from start to end.
 *   1. Find start/end rooms (pointInRoom)
 *   2. BFS the room graph for the room sequence
 *   3. For each adjacent transition, insert the portal entry/exit waypoints
 *   4. Final waypoint = end position
 *
 * Same-room paths route via the nearest corridor waypoint to avoid walking
 * through desk clusters. Short paths (<2 units) go direct.
 */
export function computeRoomPath(start: Vec3, end: Vec3): Vec3[] {
  const startRoom = pointInRoom(start);
  const endRoom = pointInRoom(end);
  if (!startRoom || !endRoom) {
    return [end];
  }
  if (startRoom === endRoom) {
    const dist = Math.hypot(start[0] - end[0], start[2] - end[2]);
    if (dist < 2) return [end];
    // Route via corridor waypoints to avoid desks
    const room = getRoom(startRoom);
    const path: Vec3[] = [];
    const corridorStart = nearestCorridor(room, start);
    const corridorEnd = nearestCorridor(room, end);
    if (corridorStart) path.push(corridorStart);
    if (corridorEnd && corridorEnd !== corridorStart) path.push(corridorEnd);
    path.push(end);
    return path;
  }
  const sequence = findRoomSequence(startRoom, endRoom);
  if (sequence.length === 0) {
    return [end];
  }
  const path: Vec3[] = [];
  for (let i = 0; i < sequence.length - 1; i++) {
    const a = sequence[i];
    const b = sequence[i + 1];
    const portal = findPortal(a, b);
    if (!portal) continue;
    const [enter, exit] = portalWaypoints(portal, a);
    path.push(enter);
    path.push(exit);
  }
  path.push(end);
  return path;
}

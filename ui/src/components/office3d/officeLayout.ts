/**
 * Office 3D layout — fixed positions for room, furniture, agents, and targets.
 *
 * Coordinate system (Three.js standard):
 *   +X = right  (toward window)
 *   +Y = up
 *   +Z = toward camera / front of room
 *
 * Room bounds: x=[-8, 8], z=[-6, 6]. Walls at edges.
 * Window on +X wall (right side).
 */

export type Vec3 = [number, number, number];

export const ROOM = {
  width: 16,   // X extent
  depth: 12,   // Z extent
  height: 4,   // wall height
  wallThickness: 0.2,
} as const;

/** Window cutout on the right (+X) wall — source of golden-hour light */
export const WINDOW = {
  width: 6,           // Z extent
  height: 2.4,        // Y extent
  centerY: 2.2,       // center height
  centerZ: 0,         // center along Z
} as const;

/** Fixed floor height for agents sitting on chairs / standing.
 *  SEAT_Y: group Y when seated. The Agent3D capsule is built around
 *          local 0.5, so world body center = SEAT_Y + 0.5. Chair seat
 *          top is ~0.46, so SEAT_Y = 0.46 places the bottom of the
 *          capsule approximately at chair top.
 *  STAND_Y: group Y when standing (feet roughly touch the floor). */
export const FLOOR_Y = 0;
export const SEAT_Y = 0.46;
export const STAND_Y = 0;

/** Light positions */
export const LIGHT_SUN_POS: Vec3 = [10, 8, 3];
export const LIGHT_SUN_TARGET: Vec3 = [-2, 0, 0];
export const LIGHT_CEO_LAMP_POS: Vec3 = [-5.5, 2, -4];

/** Dust particle cluster (Sparkles) — inside the sun beam */
export const DUST_CENTER: Vec3 = [3, 2, 0];
export const DUST_SIZE: Vec3 = [8, 3, 8];

/** Camera */
export const CAMERA = {
  position: [11, 8.5, 13] as Vec3,
  lookAt: [-1, 1, 0] as Vec3,
  fov: 32,
  near: 0.1,
  far: 60,
} as const;

/** Shared desk positions — each desk has N seats */
export interface DeskLayout {
  id: string;
  label: string;
  position: Vec3;
  rotation: number; // Y rotation in radians
  seats: Vec3[];    // seat world positions (where agent torso sits)
  leaderSeat?: number; // index of seat where leader sits
  /** Spot in front of leader where reporting agents stand */
  reportSpot: Vec3;
}

export const DESKS: DeskLayout[] = [
  // CEO corner desk — back-left. Single seat BEHIND desk (closer to back wall).
  {
    id: "ceo",
    label: "CEO",
    position: [-5.5, 0, -4],
    rotation: 0,
    seats: [[-5.5, SEAT_Y, -5.0]],
    leaderSeat: 0,
    reportSpot: [-5.5, STAND_Y, -2.5],
  },
  // Creative dept — center-left. 4 seats in 2 rows, both rows OUTSIDE desk bbox.
  // Desk bbox z=[-0.1, 2.1]. Front row at z=-0.9, back row at z=2.9.
  {
    id: "creative",
    label: "CREATIVE",
    position: [-2.5, 0, 1],
    rotation: 0,
    seats: [
      [-3.8, SEAT_Y, -0.9],  // leader — front-left
      [-1.2, SEAT_Y, -0.9],  // front-right
      [-3.8, SEAT_Y, 2.9],   // back-left
      [-1.2, SEAT_Y, 2.9],   // back-right
    ],
    leaderSeat: 0,
    reportSpot: [-3.8, STAND_Y, -1.8],
  },
  // Tech dept — center-right. Same geometry as creative.
  {
    id: "tech",
    label: "TECH",
    position: [3, 0, 1],
    rotation: 0,
    seats: [
      [1.8, SEAT_Y, -0.9],
      [4.2, SEAT_Y, -0.9],
      [1.8, SEAT_Y, 2.9],
      [4.2, SEAT_Y, 2.9],
    ],
    leaderSeat: 0,
    reportSpot: [1.8, STAND_Y, -1.8],
  },
];

/** Relax zone (couch + coffee table) — back-right */
export const RELAX = {
  couchPosition: [4, 0, -4.5] as Vec3,
  couchRotation: 0,
  coffeeTablePosition: [4, 0, -3.3] as Vec3,
  seats: [
    [3.2, SEAT_Y, -4.5] as Vec3,
    [4.8, SEAT_Y, -4.5] as Vec3,
  ],
  /** Standing spot near coffee table (for agents that walk over) */
  standSpot: [3.8, STAND_Y, -3.0] as Vec3,
} as const;

/** Center of the room — for CEO panoramic walks */
export const ROOM_CENTER: Vec3 = [0, STAND_Y, 0];

/**
 * Corridor waypoints — "lanes" that agents route through when walking from
 * one zone to another, to avoid clipping through desks.
 *
 * Layout strategy:
 *   - Front corridor at z = -1.8 (south of desks)
 *   - Back corridor at z = 3.7 (north of desks)
 *   - East corridor at x = 6 (east of tech desk, toward window)
 *   - West corridor at x = -6.5 (west of ceo, creative)
 *
 * To walk from A to B:
 *   1. Nearest corridor entry from A
 *   2. (optional) intermediate corridor node
 *   3. Nearest corridor exit to B
 */
export const CORRIDORS = {
  frontZ: -1.8,
  backZ: 3.7,
  eastX: 6,
  westX: -6.5,
} as const;

/** Pre-computed nav waypoints agents cycle through to avoid desks. */
export interface NavPath {
  waypoints: Vec3[];
}

/**
 * Compute a path from start to end that routes around desk footprints.
 *
 * Desk zone is roughly z ∈ [-0.1, 2.1] (front edge to back edge of shared desks).
 * We classify both endpoints as "front" (z < 1) or "back" (z ≥ 1) and route:
 *   - Same side: L-shape via the shared corridor (frontZ or backZ)
 *   - Opposite sides: U-shape via the east or west perimeter corridor
 *
 * Straight segments never cross the desk zone because every waypoint sits
 * in a corridor lane or at the endpoint itself (which is always off-desk).
 */
export function computePath(start: Vec3, end: Vec3): Vec3[] {
  const [sx, sy, sz] = start;
  const [ex, ey, ez] = end;
  const y = Math.max(sy, ey);

  // Which corridor band does each endpoint belong to?
  const startBand: "front" | "back" = sz < 1 ? "front" : "back";
  const endBand: "front" | "back" = ez < 1 ? "front" : "back";
  const startCorridor = startBand === "front" ? CORRIDORS.frontZ : CORRIDORS.backZ;
  const endCorridor = endBand === "front" ? CORRIDORS.frontZ : CORRIDORS.backZ;

  const raw: Vec3[] = [];

  if (startBand === endBand) {
    // L-shape: start → (sx, corridorZ) → (ex, corridorZ) → end
    raw.push([sx, y, startCorridor]);
    raw.push([ex, y, endCorridor]);
  } else {
    // U-shape via perimeter: pick the side closer to both endpoints in X
    const avgX = (sx + ex) / 2;
    const bridgeX =
      Math.abs(avgX - CORRIDORS.eastX) < Math.abs(avgX - CORRIDORS.westX)
        ? CORRIDORS.eastX
        : CORRIDORS.westX;
    raw.push([sx, y, startCorridor]);
    raw.push([bridgeX, y, startCorridor]);
    raw.push([bridgeX, y, endCorridor]);
    raw.push([ex, y, endCorridor]);
  }
  raw.push([ex, ey, ez]);

  // Drop waypoints that are closer than 0.2 units to the previous one
  const path: Vec3[] = [];
  let prev: Vec3 = [sx, sy, sz];
  for (const p of raw) {
    const dx = p[0] - prev[0];
    const dz = p[2] - prev[2];
    if (Math.hypot(dx, dz) > 0.2) {
      path.push(p);
      prev = p;
    }
  }
  if (path.length === 0) path.push(end);
  return path;
}

/** Flatten all seat positions with metadata for agent assignment */
export interface SeatSlot {
  deskId: string;
  seatIndex: number;
  position: Vec3;
  isLeader: boolean;
  isCEO: boolean;
  reportSpot: Vec3;
  /** Y rotation (radians) so the agent faces the center of the desk */
  facing: number;
}

export function buildSeatSlots(): SeatSlot[] {
  const slots: SeatSlot[] = [];
  for (const desk of DESKS) {
    desk.seats.forEach((pos, i) => {
      // Face the desk center. atan2(dx, dz) gives rotation around Y in Three.js.
      const dx = desk.position[0] - pos[0];
      const dz = desk.position[2] - pos[2];
      const facing = Math.atan2(dx, dz);
      slots.push({
        deskId: desk.id,
        seatIndex: i,
        position: pos,
        isLeader: i === desk.leaderSeat,
        isCEO: desk.id === "ceo",
        reportSpot: desk.reportSpot,
        facing,
      });
    });
  }
  return slots;
}

/** Department color palette (diffuse color for agent body) */
export const DEPT_COLORS: Record<string, string> = {
  ceo: "#d4af37",        // gold
  creative: "#c084fc",   // violet
  tech: "#60a5fa",       // blue
  finance: "#34d399",    // green
  marketing: "#f472b6",  // pink
  research: "#fbbf24",   // amber
  default: "#94a3b8",    // slate
};

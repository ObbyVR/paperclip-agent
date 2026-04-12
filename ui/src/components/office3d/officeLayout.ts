/**
 * Office 3D layout — fixed positions for room, furniture, agents, and targets.
 *
 * Coordinate system (Three.js standard):
 *   +X = right  (toward window)
 *   +Y = up
 *   +Z = toward camera / front of room
 *
 * v12: the room is divided into 5 sub-rooms (CEO Office, Creative Studio,
 * Creative Lab, Tech Lab, Lounge) by interior walls with portal openings.
 * See `officeRooms.ts` for the room graph + multi-room pathfinding.
 *
 * Outer room bounds: x=[-15, 15], z=[-9, 9]. Window on +X wall.
 */

import { computeRoomPath } from "./officeRooms";

export type Vec3 = [number, number, number];

export const ROOM = {
  width: 30,   // X extent — widened in v12 for multi-room layout
  depth: 18,   // Z extent
  height: 4,   // wall height
  wallThickness: 0.2,
} as const;

/** Window cutout on the right (+X) wall — falls inside Creative Lab */
export const WINDOW = {
  width: 6,           // Z extent
  height: 2.4,        // Y extent
  centerY: 2.2,       // center height
  centerZ: -5,        // moved up so it sits in Creative Lab (z=[-9,-1])
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
export const LIGHT_SUN_POS: Vec3 = [16, 9, -3];
export const LIGHT_SUN_TARGET: Vec3 = [-2, 0, 0];
export const LIGHT_CEO_LAMP_POS: Vec3 = [-12.5, 2, -7];

/** Dust particle cluster (Sparkles) — inside the sun beam */
export const DUST_CENTER: Vec3 = [6, 2, -5];
export const DUST_SIZE: Vec3 = [10, 3, 8];

/** Camera — pulled back and slightly higher to frame the larger 30×18 office */
export const CAMERA = {
  position: [22, 16, 22] as Vec3,
  lookAt: [0, 1, 0] as Vec3,
  fov: 38,
  near: 0.1,
  far: 90,
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

/**
 * v12 desks — repositioned into per-room layouts.
 *
 * Capacity: 18 seats total
 *   ceo (CEO Office)         → 2 seats
 *   creative (Creative Studio) → 4 seats
 *   creative-lab (Creative Lab) → 4 seats
 *   tech (Tech Lab)          → 4 seats
 *   tech-lab (Tech Lab)      → 4 seats   ← second desk in same room
 *
 * Tech Lab hosts BOTH "tech" and "tech-lab" desks side by side, so the
 * existing dept→desk fan-out logic in OfficeAgents keeps working unchanged.
 */
export const DESKS: DeskLayout[] = [
  // CEO desk inside CEO Office (xMin=-15, xMax=-7, zMin=-9, zMax=-1)
  {
    id: "ceo",
    label: "CEO",
    position: [-11, 0, -5],
    rotation: 0,
    seats: [
      [-11.6, SEAT_Y, -6.0], // leader (CEO)
      [-10.4, SEAT_Y, -6.0], // chief of staff
    ],
    leaderSeat: 0,
    reportSpot: [-11, STAND_Y, -3.5],
  },
  // Creative dept inside Creative Studio (xMin=-7, xMax=5, zMin=-9, zMax=-1)
  {
    id: "creative",
    label: "CREATIVE",
    position: [-1, 0, -5],
    rotation: 0,
    seats: [
      [-2.3, SEAT_Y, -6.6], // front-left (leader)
      [0.3, SEAT_Y, -6.6],  // front-right
      [-2.3, SEAT_Y, -3.4], // back-left
      [0.3, SEAT_Y, -3.4],  // back-right
    ],
    leaderSeat: 0,
    reportSpot: [-2.3, STAND_Y, -2.4],
  },
  // Creative Lab inside Creative Lab room (xMin=5, xMax=15, zMin=-9, zMax=-1)
  {
    id: "creative-lab",
    label: "CREATIVE LAB",
    position: [10, 0, -5],
    rotation: 0,
    seats: [
      [8.7, SEAT_Y, -6.6],  // front-left (leader)
      [11.3, SEAT_Y, -6.6], // front-right
      [8.7, SEAT_Y, -3.4],  // back-left
      [11.3, SEAT_Y, -3.4], // back-right
    ],
    leaderSeat: 0,
    reportSpot: [8.7, STAND_Y, -2.4],
  },
  // Tech dept (first desk) inside Tech Lab (xMin=-3, xMax=15, zMin=-1, zMax=9)
  {
    id: "tech",
    label: "TECH",
    position: [1, 0, 4],
    rotation: 0,
    seats: [
      [-0.3, SEAT_Y, 2.4],  // front-left (leader)
      [2.3, SEAT_Y, 2.4],   // front-right
      [-0.3, SEAT_Y, 5.6],  // back-left
      [2.3, SEAT_Y, 5.6],   // back-right
    ],
    leaderSeat: 0,
    reportSpot: [-0.3, STAND_Y, 1.4],
  },
  // Tech Lab (second desk) inside the same Tech Lab room
  {
    id: "tech-lab",
    label: "TECH LAB",
    position: [10, 0, 4],
    rotation: 0,
    seats: [
      [8.7, SEAT_Y, 2.4],   // front-left (leader)
      [11.3, SEAT_Y, 2.4],  // front-right
      [8.7, SEAT_Y, 5.6],   // back-left
      [11.3, SEAT_Y, 5.6],  // back-right
    ],
    leaderSeat: 0,
    reportSpot: [8.7, STAND_Y, 1.4],
  },
  // R&D desk inside the Lounge room (right side, away from couch)
  // Lounge bounds: xMin=-15, xMax=-3, zMin=-1, zMax=9
  {
    id: "research",
    label: "R&D",
    position: [-6, 0, 2],
    rotation: 0,
    seats: [
      [-7.3, SEAT_Y, 0.4],  // front-left (leader)
      [-4.7, SEAT_Y, 0.4],  // front-right
      [-7.3, SEAT_Y, 3.6],  // back-left
      [-4.7, SEAT_Y, 3.6],  // back-right
    ],
    leaderSeat: 0,
    reportSpot: [-7.3, STAND_Y, -0.6],
  },
];

/** Relax zone (couch + coffee table) — inside the Lounge room */
export const RELAX = {
  couchPosition: [-9, 0, 5] as Vec3,
  couchRotation: 0,
  coffeeTablePosition: [-9, 0, 6.2] as Vec3,
  seats: [
    [-9.8, SEAT_Y, 5] as Vec3,
    [-8.2, SEAT_Y, 5] as Vec3,
  ],
  /** Standing spot near coffee table (for agents that walk over) */
  standSpot: [-9, STAND_Y, 6.5] as Vec3,
} as const;

/**
 * Center the CEO uses for "panoramic" ambient walks. In v12 this is the
 * center of the CEO Office room so the CEO never wanders into open space.
 */
export const ROOM_CENTER: Vec3 = [-11, STAND_Y, -5];

/**
 * Compute a path from start to end. v12: delegates to the multi-room
 * pathfinder which routes through portal openings between rooms.
 *
 * Within a single room the path is a straight line — rooms are small enough
 * that fancy desk avoidance isn't required for v12.
 */
export function computePath(start: Vec3, end: Vec3): Vec3[] {
  return computeRoomPath(start, end);
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

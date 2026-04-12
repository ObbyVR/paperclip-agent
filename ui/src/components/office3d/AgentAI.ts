/**
 * AgentAI — behavior FSM for office agents.
 *
 * Each agent has a controller that transitions between states driven by:
 *  - external events (task finished, status change from Paperclip data)
 *  - internal timers (ambient behaviors: coffee break, peer chat)
 *
 * The controller tick() is called every frame from useFrame; it updates
 * position/rotation/pose, and the render component reads them via refs.
 */
import * as THREE from "three";
import type { Vec3 } from "./officeLayout";
import { SEAT_Y, STAND_Y, RELAX, ROOM_CENTER, computePath } from "./officeLayout";

export type AgentBehaviorState =
  | "seated_working"
  | "seated_idle"
  | "standing_up"
  | "walking_to_leader"
  | "reporting"
  | "walking_to_coffee"
  | "at_coffee"
  | "walking_to_peer"
  | "chatting_with_peer"
  | "walking_home"
  | "sitting_down";

export interface AgentPose {
  position: THREE.Vector3;
  rotation: number; // Y rotation radians
  bodyScaleY: number; // 1.0 = standing, 0.75 = seated
  bobPhase: number;   // for walking animation
  talkPhase: number;  // for reporting/chatting anim
}

export interface AgentInit {
  id: string;
  homePos: Vec3;
  /** position where agent stands in front of their leader to report */
  reportSpot: Vec3;
  role: "ceo" | "leader" | "member";
  /** id of this agent's leader (whom they report to) */
  leaderId?: string;
  isPaused?: boolean;
  /** seat facing rotation (radians, Y axis) */
  seatFacing?: number;
}

const WALK_SPEED = 1.4; // units per second
const ROT_SPEED = 6.0;

export class AgentController {
  id: string;
  state: AgentBehaviorState;
  homePos: THREE.Vector3;
  reportSpot: THREE.Vector3;
  currentPos: THREE.Vector3;
  /** Queue of waypoints the agent walks through (last = final destination) */
  waypoints: THREE.Vector3[];
  rotation: number;
  targetRotation: number;
  stateStart: number;
  stateDuration: number;
  role: "ceo" | "leader" | "member";
  leaderId?: string;
  bodyScaleY: number;
  bobPhase: number;
  talkPhase: number;
  /** Default rotation when seated (faces desk) */
  seatFacing: number;
  /** When true, the controller is in the relax zone and doesn't wander */
  isPaused: boolean;

  constructor(init: AgentInit) {
    this.id = init.id;
    this.homePos = new THREE.Vector3(...init.homePos);
    this.reportSpot = new THREE.Vector3(...init.reportSpot);
    this.role = init.role;
    this.leaderId = init.leaderId;
    this.isPaused = init.isPaused ?? false;
    this.seatFacing = init.seatFacing ?? 0;
    this.currentPos = this.homePos.clone();
    this.waypoints = [];
    this.rotation = this.seatFacing;
    this.targetRotation = this.seatFacing;
    this.bodyScaleY = 0.75; // start seated
    this.bobPhase = 0;
    this.talkPhase = 0;

    if (this.isPaused) {
      // Paused agents start in the relax zone
      const seatIdx = Math.abs(hashStr(init.id)) % RELAX.seats.length;
      this.currentPos.set(...RELAX.seats[seatIdx]);
      this.state = "at_coffee";
    } else {
      this.state = "seated_working";
    }

    this.stateStart = 0;
    this.stateDuration = 8 + Math.random() * 12; // initial working stint
  }

  /** Plan a path from current position to dest via corridor waypoints. */
  setDestination(dest: THREE.Vector3) {
    const path = computePath(
      [this.currentPos.x, this.currentPos.y, this.currentPos.z],
      [dest.x, dest.y, dest.z],
    );
    this.waypoints = path.map((p) => new THREE.Vector3(...p));
  }

  get targetPos(): THREE.Vector3 | null {
    return this.waypoints[0] ?? null;
  }

  /** Set by hook when Paperclip data indicates task finished */
  triggerTaskFinished(now: number, leaderController: AgentController | null) {
    if (this.role === "ceo") return; // CEO doesn't report
    if (this.isPaused) return;
    if (
      this.state === "walking_to_leader" ||
      this.state === "reporting" ||
      this.state === "standing_up"
    ) {
      return; // already reporting
    }
    this.transitionTo("standing_up", now, 0.6);
    // Next: walk to leader (set in tick when standing_up completes)
  }

  transitionTo(next: AgentBehaviorState, now: number, duration: number) {
    this.state = next;
    this.stateStart = now;
    this.stateDuration = duration;
    // Update body pose for new state
    if (next === "seated_working" || next === "seated_idle" || next === "at_coffee") {
      this.bodyScaleY = 0.75;
    } else {
      this.bodyScaleY = 1.0;
    }
  }

  tick(
    delta: number,
    now: number,
    allControllers: Map<string, AgentController>,
    rng: () => number
  ) {
    const stateAge = now - this.stateStart;

    switch (this.state) {
      case "seated_working": {
        // Breathing animation
        this.bodyScaleY = 0.75 + Math.sin(now * 1.5 + this.bobPhase) * 0.02;
        if (stateAge >= this.stateDuration) {
          // Roll dice for next behavior
          const r = rng();
          if (this.role === "ceo") {
            // CEO does periodic ambient walk-arounds toward the room center
            // (20% probability) — unlike other agents, never to the coffee
            // area. The remaining 80% keeps the CEO at their desk.
            if (!this.isPaused && r < 0.2) {
              this.transitionTo("standing_up", now, 0.6);
              this.pendingAfterStandUp = "panoramic";
            } else {
              this.transitionTo("seated_idle", now, 6 + rng() * 8);
            }
          } else if (!this.isPaused && r < 0.3) {
            // Go to coffee
            this.transitionTo("standing_up", now, 0.6);
            this.pendingAfterStandUp = "coffee";
          } else if (!this.isPaused && r < 0.5) {
            // Chat with a random peer
            this.transitionTo("standing_up", now, 0.6);
            this.pendingAfterStandUp = "peer";
          } else {
            // Stay seated, switch to idle briefly
            this.transitionTo("seated_idle", now, 4 + rng() * 6);
          }
        }
        break;
      }

      case "seated_idle": {
        this.bodyScaleY = 0.75 + Math.sin(now * 1.2 + this.bobPhase) * 0.015;
        // Small head sway around seat facing direction
        this.rotation = this.seatFacing + Math.sin(now * 0.5 + this.bobPhase) * 0.25;
        this.targetRotation = this.rotation;
        if (stateAge >= this.stateDuration) {
          this.transitionTo("seated_working", now, 10 + rng() * 15);
        }
        break;
      }

      case "standing_up": {
        // Lerp seat -> stand pose
        const t = Math.min(1, stateAge / this.stateDuration);
        this.bodyScaleY = 0.75 + t * 0.25;
        this.currentPos.y = SEAT_Y + (STAND_Y - SEAT_Y) * t;
        if (t >= 1) {
          // Decide where to go
          const pending = this.pendingAfterStandUp;
          this.pendingAfterStandUp = undefined;
          if (pending === "coffee") {
            const dest = new THREE.Vector3(...RELAX.standSpot);
            this.setDestination(dest);
            this.transitionTo("walking_to_coffee", now, 999);
          } else if (pending === "panoramic") {
            // CEO ambient walk: pick a spot in the central room area and go
            // stand there for a moment before walking back home.
            const cx = ROOM_CENTER[0] + (rng() - 0.5) * 3;
            const cz = ROOM_CENTER[2] + (rng() - 0.5) * 2.5;
            const dest = new THREE.Vector3(cx, STAND_Y, cz);
            this.setDestination(dest);
            // Reuse walking_to_coffee since it routes to a standing spot and
            // then transitions to a pause (at_coffee) before returning home.
            // Semantically this is a CEO "walk around" rather than coffee.
            this.transitionTo("walking_to_coffee", now, 999);
          } else if (pending === "peer") {
            const peer = this.pickRandomPeer(allControllers, rng);
            if (peer) {
              // Walk to the peer's report spot (in front of their desk,
              // guaranteed to be in open space) instead of raw position
              // offset which can land inside a desk.
              const dest = peer.reportSpot.clone();
              dest.y = STAND_Y;
              this.setDestination(dest);
              this.transitionTo("walking_to_peer", now, 999);
            } else {
              const dest = this.homePos.clone();
              dest.y = STAND_Y;
              this.setDestination(dest);
              this.transitionTo("walking_home", now, 999);
            }
          } else {
            // Default path: go to leader for reporting
            const dest = this.reportSpot.clone();
            this.setDestination(dest);
            this.transitionTo("walking_to_leader", now, 999);
          }
        }
        break;
      }

      case "walking_to_leader":
      case "walking_to_coffee":
      case "walking_to_peer":
      case "walking_home": {
        if (!this.targetPos) {
          this.transitionTo("seated_working", now, 10);
          break;
        }
        const arrived = this.walkStep(delta);
        // Bob
        this.bodyScaleY = 1.0 + Math.sin(now * 8 + this.bobPhase) * 0.03;
        if (arrived) {
          if (this.state === "walking_to_leader") {
            this.transitionTo("reporting", now, 3 + rng() * 1.5);
          } else if (this.state === "walking_to_coffee") {
            this.transitionTo("at_coffee", now, 4 + rng() * 3);
            // Snap to seat or stand at coffee table — non-CEO only.
            // The CEO reuses this state for panoramic walks and should
            // remain standing at the destination (no coffee seat).
            if (this.role !== "ceo" && rng() < 0.5 && RELAX.seats.length > 0) {
              const seatIdx = Math.floor(rng() * RELAX.seats.length);
              this.currentPos.set(...RELAX.seats[seatIdx]);
              this.bodyScaleY = 0.75;
            }
          } else if (this.state === "walking_to_peer") {
            this.transitionTo("chatting_with_peer", now, 3 + rng() * 2);
          } else {
            // walking_home
            this.currentPos.copy(this.homePos);
            this.currentPos.y = SEAT_Y;
            this.transitionTo("sitting_down", now, 0.6);
          }
        }
        break;
      }

      case "reporting": {
        // Oscillate body to mimic talking
        this.talkPhase = Math.sin(now * 4 + this.bobPhase) * 0.12;
        this.rotation = this.targetRotation + this.talkPhase;
        if (stateAge >= this.stateDuration) {
          const dest = this.homePos.clone();
          dest.y = STAND_Y;
          this.setDestination(dest);
          this.transitionTo("walking_home", now, 999);
        }
        break;
      }

      case "at_coffee": {
        // CEO panoramic walks reuse this state but should stay standing —
        // bob a tiny bit in place rather than "seated" scale.
        if (this.role === "ceo") {
          this.bodyScaleY = 1.0 + Math.sin(now * 1.1 + this.bobPhase) * 0.015;
          // Slow head sway to feel present
          this.rotation += Math.sin(now * 0.6 + this.bobPhase) * 0.003;
        } else {
          this.bodyScaleY = 0.75 + Math.sin(now * 1.2 + this.bobPhase) * 0.02;
        }
        if (this.isPaused) {
          // Paused agents stay here indefinitely
          break;
        }
        if (stateAge >= this.stateDuration) {
          const dest = this.homePos.clone();
          dest.y = STAND_Y;
          this.currentPos.y = STAND_Y;
          this.bodyScaleY = 1.0;
          this.setDestination(dest);
          this.transitionTo("walking_home", now, 999);
        }
        break;
      }

      case "chatting_with_peer": {
        this.talkPhase = Math.sin(now * 3.5 + this.bobPhase) * 0.1;
        this.rotation = this.targetRotation + this.talkPhase;
        if (stateAge >= this.stateDuration) {
          const dest = this.homePos.clone();
          dest.y = STAND_Y;
          this.setDestination(dest);
          this.transitionTo("walking_home", now, 999);
        }
        break;
      }

      case "sitting_down": {
        const t = Math.min(1, stateAge / this.stateDuration);
        this.bodyScaleY = 1.0 - t * 0.25;
        this.currentPos.y = STAND_Y + (SEAT_Y - STAND_Y) * t;
        // Rotate back to seat facing
        this.targetRotation = this.seatFacing;
        if (t >= 1) {
          this.currentPos.copy(this.homePos);
          this.rotation = this.seatFacing;
          this.transitionTo("seated_working", now, 12 + rng() * 18);
        }
        break;
      }
    }

    // Smooth rotation toward target
    const diff = this.targetRotation - this.rotation;
    const wrapped = Math.atan2(Math.sin(diff), Math.cos(diff));
    this.rotation += wrapped * Math.min(1, ROT_SPEED * delta);
  }

  private pendingAfterStandUp?: "coffee" | "peer" | "panoramic";

  /**
   * Move along the waypoint queue by WALK_SPEED*delta.
   * When reaching a waypoint, shift it off and continue to the next.
   * Returns true only when ALL waypoints are consumed.
   */
  private walkStep(delta: number): boolean {
    while (this.waypoints.length > 0) {
      const next = this.waypoints[0];
      const toTarget = new THREE.Vector3().subVectors(next, this.currentPos);
      toTarget.y = 0;
      const dist = toTarget.length();
      if (dist < 0.1) {
        this.waypoints.shift();
        continue;
      }
      this.targetRotation = Math.atan2(toTarget.x, toTarget.z);
      let step = WALK_SPEED * delta;
      if (step > dist) step = dist;
      toTarget.normalize().multiplyScalar(step);
      this.currentPos.x += toTarget.x;
      this.currentPos.z += toTarget.z;
      // Keep Y at walking height
      if (this.state.startsWith("walking")) {
        this.currentPos.y = STAND_Y;
      }
      return false;
    }
    return true;
  }

  private pickRandomPeer(
    all: Map<string, AgentController>,
    rng: () => number
  ): AgentController | null {
    const candidates: AgentController[] = [];
    all.forEach((c) => {
      if (c.id === this.id) return;
      if (c.role === "ceo") return;
      if (c.isPaused) return;
      if (c.state !== "seated_working" && c.state !== "seated_idle") return;
      candidates.push(c);
    });
    if (candidates.length === 0) return null;
    return candidates[Math.floor(rng() * candidates.length)];
  }
}

/** Deterministic hash for a string id (stable seed) */
export function hashStr(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (h * 31 + s.charCodeAt(i)) | 0;
  }
  return h;
}

/** Simple seeded RNG — Mulberry32 */
export function makeRng(seed: number): () => number {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

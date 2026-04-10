/**
 * OfficeAgents — allocates 3D agents to seats, runs the FSM tick, renders them.
 *
 * Responsibilities:
 *  1. Map Paperclip agents to fixed seat slots deterministically
 *  2. Instantiate one AgentController per agent, keep them ref-stable
 *  3. Each frame: tick all controllers, push pose into group refs
 *  4. Diff agent.status to trigger "task finished" events
 */
import { useEffect, useMemo, useRef } from "react";
import { useFrame, type ThreeEvent } from "@react-three/fiber";
import * as THREE from "three";
import type { Agent } from "@paperclipai/shared";
import { Agent3D } from "./Agent3D";
import {
  AgentController,
  hashStr,
  makeRng,
  type AgentInit,
} from "./AgentAI";
import {
  buildSeatSlots,
  DESKS,
  DEPT_COLORS,
  type SeatSlot,
} from "./officeLayout";

interface OfficeAgentsProps {
  agents: Agent[];
  onAgentClick: (agent: Agent) => void;
}

/** Infer department id from agent name/role for color/seat assignment. */
function inferDeptId(a: Agent): string {
  const n = (a.name ?? "").toLowerCase();
  const role = (a.role ?? "").toLowerCase();
  if (role === "ceo" || n.includes("ceo")) return "ceo";
  if (n.includes("creativ") || n.includes("design") || n.includes("art")) return "creative";
  if (n.includes("tech") || role === "cto" || role === "engineer") return "tech";
  if (n.includes("finanz") || n.includes("finance") || n.includes("cfo")) return "finance";
  if (n.includes("marketing") || n.includes("growth")) return "marketing";
  if (n.includes("ricerca") || n.includes("research")) return "research";
  return "default";
}

/**
 * Assign agents to desks deterministically.
 * CEO goes to ceo desk seat 0.
 * Other agents are distributed to their dept's desk if any, else wrap to any free seat.
 */
function assignAgentsToSeats(agents: Agent[]): Map<string, SeatSlot> {
  const slots = buildSeatSlots();
  const assigned = new Map<string, SeatSlot>();
  const freeSlotsByDesk = new Map<string, SeatSlot[]>();
  for (const s of slots) {
    if (!freeSlotsByDesk.has(s.deskId)) freeSlotsByDesk.set(s.deskId, []);
    freeSlotsByDesk.get(s.deskId)!.push(s);
  }

  // Pass 1: CEO
  const ceoAgent = agents.find((a) => inferDeptId(a) === "ceo");
  if (ceoAgent) {
    const ceoSlot = freeSlotsByDesk.get("ceo")?.[0];
    if (ceoSlot) {
      assigned.set(ceoAgent.id, ceoSlot);
      freeSlotsByDesk.set("ceo", []);
    }
  }

  // Pass 2: dept-matched agents
  const unassigned: Agent[] = [];
  for (const a of agents) {
    if (assigned.has(a.id)) continue;
    const dept = inferDeptId(a);
    const candidates = freeSlotsByDesk.get(dept);
    if (candidates && candidates.length > 0) {
      // Prefer leader slot first if this agent looks like a leader (by role)
      const isLeaderRole =
        (a.role ?? "").toLowerCase().includes("lead") ||
        (a.role ?? "").toLowerCase().includes("head") ||
        candidates.some((c) => c.isLeader);
      const slot = isLeaderRole
        ? candidates.find((c) => c.isLeader) ?? candidates[0]
        : candidates.find((c) => !c.isLeader) ?? candidates[0];
      assigned.set(a.id, slot);
      freeSlotsByDesk.set(
        dept,
        candidates.filter((c) => c !== slot)
      );
    } else {
      unassigned.push(a);
    }
  }

  // Pass 3: wrap overflow into any remaining seat
  for (const a of unassigned) {
    let placed = false;
    for (const [, freeList] of freeSlotsByDesk) {
      if (freeList.length > 0) {
        assigned.set(a.id, freeList[0]);
        freeList.shift();
        placed = true;
        break;
      }
    }
    if (!placed) {
      // No more seats — skip this agent (too many for the layout)
    }
  }

  return assigned;
}

interface AgentSlot {
  agent: Agent;
  slot: SeatSlot;
  deptId: string;
  color: string;
  accent: string;
}

export function OfficeAgents({ agents, onAgentClick }: OfficeAgentsProps) {
  // Filter out terminated / excess agents, cap at layout capacity
  const liveAgents = useMemo(() => {
    return (agents ?? []).filter((a) => a.status !== "terminated").slice(0, 20);
  }, [agents]);

  // Deterministic seat assignment (stable across renders if ids don't change)
  const assignment = useMemo(() => assignAgentsToSeats(liveAgents), [liveAgents]);

  const slotList: AgentSlot[] = useMemo(() => {
    const list: AgentSlot[] = [];
    for (const a of liveAgents) {
      const slot = assignment.get(a.id);
      if (!slot) continue;
      const deptId = inferDeptId(a);
      const color = DEPT_COLORS[deptId] ?? DEPT_COLORS.default;
      list.push({ agent: a, slot, deptId, color, accent: "#2a1810" });
    }
    return list;
  }, [liveAgents, assignment]);

  // Stable controllers keyed by agent id
  const controllersRef = useRef<Map<string, AgentController>>(new Map());
  const prevStatusRef = useRef<Map<string, string>>(new Map());
  const rngRef = useRef(makeRng(42));

  // Sync controllers with current slot list
  useEffect(() => {
    const map = controllersRef.current;
    const alive = new Set<string>();
    for (const item of slotList) {
      alive.add(item.agent.id);
      let ctrl = map.get(item.agent.id);
      if (!ctrl) {
        const init: AgentInit = {
          id: item.agent.id,
          homePos: item.slot.position,
          reportSpot: item.slot.reportSpot,
          role: item.slot.isCEO ? "ceo" : item.slot.isLeader ? "leader" : "member",
          leaderId: findDeptLeaderId(slotList, item.slot.deskId, item.agent.id),
          isPaused: item.agent.status === "paused",
          seatFacing: item.slot.facing,
        };
        ctrl = new AgentController(init);
        // Offset bob phase per agent so they don't breathe in sync
        ctrl.bobPhase = (hashStr(item.agent.id) % 1000) / 160;
        map.set(item.agent.id, ctrl);
      } else {
        // Update pause state if changed
        if (ctrl.isPaused !== (item.agent.status === "paused")) {
          ctrl.isPaused = item.agent.status === "paused";
        }
      }
    }
    // Remove controllers for agents no longer present
    for (const id of Array.from(map.keys())) {
      if (!alive.has(id)) map.delete(id);
    }
  }, [slotList]);

  // Group refs for pose updates
  const groupRefs = useRef<Map<string, THREE.Group>>(new Map());

  // Per-frame tick
  useFrame((state, delta) => {
    const now = state.clock.getElapsedTime();
    const ctrls = controllersRef.current;
    const rng = rngRef.current;

    // Diff status to trigger task finished events
    for (const item of slotList) {
      const prev = prevStatusRef.current.get(item.agent.id);
      const cur = item.agent.status ?? "";
      if (prev && prev !== cur) {
        const wasActive = prev === "active" || prev === "running";
        const isIdle = cur === "idle";
        if (wasActive && isIdle) {
          const ctrl = ctrls.get(item.agent.id);
          if (ctrl) {
            ctrl.triggerTaskFinished(now, null);
          }
        }
      }
      prevStatusRef.current.set(item.agent.id, cur);
    }

    // Tick all
    ctrls.forEach((ctrl) => ctrl.tick(delta, now, ctrls, rng));

    // Apply poses to group refs + toggle speech bubble visibility + animate limbs
    for (const item of slotList) {
      const ctrl = ctrls.get(item.agent.id);
      const group = groupRefs.current.get(item.agent.id);
      if (!ctrl || !group) continue;
      group.position.copy(ctrl.currentPos);
      group.rotation.y = ctrl.rotation;
      group.scale.y = ctrl.bodyScaleY;

      // Bubble visible while reporting to a leader or chatting with a peer
      const bubble = group.getObjectByName("bubble");
      if (bubble) {
        const talking =
          ctrl.state === "reporting" || ctrl.state === "chatting_with_peer";
        if (bubble.visible !== talking) bubble.visible = talking;
        if (talking) {
          const pulse = 1 + Math.sin(now * 4 + ctrl.bobPhase) * 0.08;
          bubble.scale.set(0.6 * pulse, 0.45 * pulse, 1);
        }
      }

      // Limb animation — legs + arms swing while walking, idle pose otherwise
      const leftLeg = group.getObjectByName("leftLeg");
      const rightLeg = group.getObjectByName("rightLeg");
      const leftArm = group.getObjectByName("leftArm");
      const rightArm = group.getObjectByName("rightArm");

      if (leftLeg && rightLeg && leftArm && rightArm) {
        const isWalking = ctrl.state.startsWith("walking");
        if (isWalking) {
          // Stride cadence ~6Hz. Legs oscillate ±0.5 rad, arms counter.
          const phase = now * 7 + ctrl.bobPhase;
          const swing = Math.sin(phase) * 0.55;
          leftLeg.rotation.x = swing;
          rightLeg.rotation.x = -swing;
          leftArm.rotation.x = -swing * 0.7;
          rightArm.rotation.x = swing * 0.7;
        } else if (ctrl.state === "reporting" || ctrl.state === "chatting_with_peer") {
          // Subtle gesture while talking — arms wave a bit
          const phase = now * 3 + ctrl.bobPhase;
          leftArm.rotation.x = Math.sin(phase) * 0.15 - 0.1;
          rightArm.rotation.x = Math.sin(phase + Math.PI) * 0.15 - 0.1;
          leftLeg.rotation.x = 0;
          rightLeg.rotation.x = 0;
        } else {
          // Ease limbs back to rest pose
          leftLeg.rotation.x *= 0.85;
          rightLeg.rotation.x *= 0.85;
          leftArm.rotation.x *= 0.85;
          rightArm.rotation.x *= 0.85;
        }
      }
    }
  });

  const setRef = (id: string) => (g: THREE.Group | null) => {
    if (g) groupRefs.current.set(id, g);
    else groupRefs.current.delete(id);
  };

  return (
    <group>
      {slotList.map((item) => (
        <Agent3D
          key={item.agent.id}
          ref={setRef(item.agent.id)}
          color={item.color}
          accent={item.accent}
          isLeader={item.slot.isLeader && !item.slot.isCEO}
          isCEO={item.slot.isCEO}
          onClick={(e: ThreeEvent<MouseEvent>) => {
            e.stopPropagation();
            onAgentClick(item.agent);
          }}
        />
      ))}
    </group>
  );
}

function findDeptLeaderId(
  slotList: AgentSlot[],
  deskId: string,
  selfId: string
): string | undefined {
  const leader = slotList.find(
    (s) => s.slot.deskId === deskId && s.slot.isLeader && s.agent.id !== selfId
  );
  return leader?.agent.id;
}

import type { CommunityLane } from "@/lib/community-lane";
import { parseCommunityLane } from "@/lib/community-lane";

/** Survives sessions; merged with `users.community_lane` when logged in. */
export const COMMUNITY_LANE_STORAGE_KEY = "sarvaone_community_lane";

const LEGACY_COMMUNITY_LANE_KEYS = ["aisaravanna_community_lane"] as const;

export function readStoredCommunityLane(): CommunityLane | null {
  if (typeof window === "undefined") return null;
  try {
    for (const k of [COMMUNITY_LANE_STORAGE_KEY, ...LEGACY_COMMUNITY_LANE_KEYS]) {
      const lane = parseCommunityLane(localStorage.getItem(k));
      if (lane) return lane;
    }
  } catch {
    return null;
  }
  return null;
}

export function writeStoredCommunityLane(lane: CommunityLane): void {
  try {
    localStorage.setItem(COMMUNITY_LANE_STORAGE_KEY, lane);
  } catch {
    /* ignore quota / private mode */
  }
}

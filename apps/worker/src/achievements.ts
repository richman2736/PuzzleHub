import type { Difficulty } from "@puzzlehub/game-core";

import type { CompletionEvent, CompletionStore } from "./completion";

// Deterministic achievement evaluation. Achievements are a pure function of the
// completion-event log: replaying the same events always unlocks the same
// achievements with the same unlock timestamp (the completedAt of the event that
// first satisfied the rule). The queue consumer replays and persists, so this is
// idempotent and rebuildable.

export interface AchievementDefinition {
  id: string;
  title: string;
  description: string;
}

export const achievementCatalog: AchievementDefinition[] = [
  { id: "first_solve", title: "First Solve", description: "Complete your first puzzle." },
  { id: "first_daily", title: "Daily Debut", description: "Complete a daily challenge." },
  { id: "no_mistake_solve", title: "Flawless", description: "Complete a puzzle with no mistakes." },
  { id: "streak_3", title: "On a Roll", description: "Reach a 3-day streak." },
  { id: "streak_7", title: "Unstoppable", description: "Reach a 7-day streak." },
  {
    id: "hard_completed",
    title: "Hard Mode",
    description: "Complete a hard, expert, or master puzzle.",
  },
];

export interface UnlockedAchievement {
  achievementId: string;
  unlockedAt: string;
}

export interface AchievementStore {
  unlock(deviceId: string, achievement: UnlockedAchievement): Promise<void>;
  listByDevice(deviceId: string): Promise<UnlockedAchievement[]>;
}

const hardDifficulties = new Set<Difficulty>(["hard", "expert", "master"]);

function addUtcDay(date: string): string {
  const next = new Date(`${date}T00:00:00.000Z`);
  next.setUTCDate(next.getUTCDate() + 1);
  return next.toISOString().slice(0, 10);
}

// Evaluate all unlocked achievements from a device's completion events. Events
// are expected oldest-first. The unlock timestamp is the completedAt of the
// triggering event, so results are stable across replays.
export function evaluateAchievements(events: CompletionEvent[]): UnlockedAchievement[] {
  const unlocked = new Map<string, string>();
  const unlock = (id: string, at: string): void => {
    if (!unlocked.has(id)) {
      unlocked.set(id, at);
    }
  };

  let streak = 0;
  let lastPlayedDate: string | null = null;

  for (const event of events) {
    const playedDate = event.completedAt.slice(0, 10);

    if (lastPlayedDate === null || playedDate > lastPlayedDate) {
      if (lastPlayedDate !== null && playedDate === addUtcDay(lastPlayedDate)) {
        streak += 1;
      } else {
        streak = 1;
      }
      lastPlayedDate = playedDate;
    }

    unlock("first_solve", event.completedAt);

    if (event.isDaily) {
      unlock("first_daily", event.completedAt);
    }

    if (event.mistakes === 0) {
      unlock("no_mistake_solve", event.completedAt);
    }

    if (hardDifficulties.has(event.difficulty)) {
      unlock("hard_completed", event.completedAt);
    }

    if (streak >= 3) {
      unlock("streak_3", event.completedAt);
    }

    if (streak >= 7) {
      unlock("streak_7", event.completedAt);
    }
  }

  return [...unlocked.entries()].map(([achievementId, unlockedAt]) => ({
    achievementId,
    unlockedAt,
  }));
}

// Consumer entrypoint: replay events, evaluate, and persist any newly unlocked
// achievements. Persisting is idempotent (first unlock wins).
export async function evaluateAndPersistAchievements(
  completionStore: CompletionStore,
  achievementStore: AchievementStore,
  deviceId: string,
): Promise<UnlockedAchievement[]> {
  const events = await completionStore.listByDevice(deviceId);
  const unlocked = evaluateAchievements(events);

  for (const achievement of unlocked) {
    await achievementStore.unlock(deviceId, achievement);
  }

  return unlocked;
}

export class InMemoryAchievementStore implements AchievementStore {
  private readonly rows = new Map<string, UnlockedAchievement>();

  unlock(deviceId: string, achievement: UnlockedAchievement): Promise<void> {
    const key = `${deviceId}:${achievement.achievementId}`;

    if (!this.rows.has(key)) {
      this.rows.set(key, achievement);
    }

    return Promise.resolve();
  }

  listByDevice(deviceId: string): Promise<UnlockedAchievement[]> {
    const prefix = `${deviceId}:`;
    const matching = [...this.rows.entries()]
      .filter(([key]) => key.startsWith(prefix))
      .map(([, value]) => value);

    return Promise.resolve(matching);
  }
}

export class D1AchievementStore implements AchievementStore {
  constructor(private readonly db: D1Database) {}

  async unlock(deviceId: string, achievement: UnlockedAchievement): Promise<void> {
    await this.db
      .prepare(
        "INSERT OR IGNORE INTO device_achievements (device_id, achievement_id, unlocked_at) VALUES (?, ?, ?)",
      )
      .bind(deviceId, achievement.achievementId, achievement.unlockedAt)
      .run();
  }

  async listByDevice(deviceId: string): Promise<UnlockedAchievement[]> {
    const { results } = await this.db
      .prepare(
        "SELECT achievement_id, unlocked_at FROM device_achievements WHERE device_id = ? ORDER BY unlocked_at ASC",
      )
      .bind(deviceId)
      .all<{ achievement_id: string; unlocked_at: string }>();

    return results.map((row) => ({
      achievementId: row.achievement_id,
      unlockedAt: row.unlocked_at,
    }));
  }
}

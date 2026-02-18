/**
 * ApplicationTracker - tracks application status through the state machine
 * and emits progress events via Redis pub/sub.
 */

import pino from "pino";
import type Redis from "ioredis";
import type {
  IApplicationTracker,
  ApplicationPhase,
  StateTransition,
  ProgressUpdate,
} from "@valet/shared/types";

const logger = pino({ name: "application-tracker" });

/** Redis channel for progress updates */
const PROGRESS_CHANNEL = "valet:progress";

/** Valid state transitions for the application lifecycle */
const VALID_TRANSITIONS: Record<ApplicationPhase, ApplicationPhase[]> = {
  provisioning: ["navigating", "failed"],
  navigating: ["analyzing", "failed"],
  analyzing: ["filling", "failed"],
  filling: ["uploading", "reviewing", "submitting", "failed"],
  uploading: ["reviewing", "filling", "failed"],
  reviewing: ["submitting", "filling", "waiting_human", "failed"],
  submitting: ["verifying", "failed"],
  verifying: ["completed", "failed"],
  waiting_human: ["filling", "reviewing", "submitting", "failed"],
  completed: [],
  failed: [],
};

export class ApplicationTracker implements IApplicationTracker {
  private redis: Redis;
  private phaseMap = new Map<string, ApplicationPhase>();
  private historyMap = new Map<string, StateTransition[]>();

  constructor(redis: Redis) {
    this.redis = redis;
  }

  async transition(
    taskId: string,
    userId: string,
    toPhase: ApplicationPhase,
    trigger: string,
    metadata?: Record<string, unknown>,
  ): Promise<void> {
    const currentPhase = this.phaseMap.get(taskId) ?? "provisioning";

    // Validate transition
    const allowed = VALID_TRANSITIONS[currentPhase];
    if (allowed && !allowed.includes(toPhase)) {
      throw new Error(
        `Invalid transition: ${currentPhase} -> ${toPhase} for task ${taskId}`,
      );
    }

    const transition: StateTransition = {
      taskId,
      from: currentPhase,
      to: toPhase,
      trigger,
      timestamp: new Date().toISOString(),
      metadata,
    };

    // Update in-memory state
    this.phaseMap.set(taskId, toPhase);
    const history = this.historyMap.get(taskId) ?? [];
    history.push(transition);
    this.historyMap.set(taskId, history);

    // Publish via Redis pub/sub
    try {
      await this.redis.publish(
        PROGRESS_CHANNEL,
        JSON.stringify({
          type: "state_change",
          taskId,
          userId,
          from: currentPhase,
          to: toPhase,
          trigger,
          timestamp: transition.timestamp,
          metadata,
        }),
      );
    } catch (err) {
      logger.warn(
        { taskId, error: String(err) },
        "Failed to publish state transition via Redis",
      );
    }

    logger.info(
      { taskId, from: currentPhase, to: toPhase, trigger },
      "Application phase transition",
    );
  }

  async emitProgress(update: ProgressUpdate): Promise<void> {
    try {
      await this.redis.publish(
        PROGRESS_CHANNEL,
        JSON.stringify({
          type: "progress",
          ...update,
        }),
      );
    } catch (err) {
      logger.warn(
        { taskId: update.taskId, error: String(err) },
        "Failed to publish progress update via Redis",
      );
    }
  }

  async getCurrentPhase(taskId: string): Promise<ApplicationPhase | null> {
    return this.phaseMap.get(taskId) ?? null;
  }

  async getHistory(taskId: string): Promise<StateTransition[]> {
    return this.historyMap.get(taskId) ?? [];
  }
}

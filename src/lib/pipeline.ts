import { extractJson } from "./extract-json";
import { mockStream, type MockBehavior, type MockState } from "./anthropic-mock";

export interface GenerateInput {
  /** Drives the mock streaming client (see anthropic-mock.ts). */
  behavior: MockBehavior;
  /** Hands the finished draft to the next pipeline stage. May reject. */
  advanceToNextStage: () => Promise<void>;
  /** Returns true once the draft passes review. Scripted by callers/tests. */
  reviewPasses: (attempt: number) => boolean;
}

export interface GenerateResult {
  status: "ok" | "error";
  attempts: number;
}

const MAX_REVISIONS = 3;
const MAX_STREAM_ATTEMPTS = 3;

function isRateLimitError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "status" in error &&
    error.status === 429
  );
}

/**
 * Runs one content-generation pass: stream a draft, extract it, revise until it
 * passes review, then hand off to the next stage.
 *
 * This is a faithful (stripped-down) reproduction of the real pipeline — and it
 * ships with three real bugs from that pipeline. Your job is to fix them so the
 * test suite passes. See the README for the symptoms. (Do not edit the tests.)
 */
export async function generate(input: GenerateInput): Promise<GenerateResult> {
  const state: MockState = {calls: 0 };

  // Retry transient failures or incomplete model responses.
  for (
    let streamAttempt = 1;
    streamAttempt <= MAX_STREAM_ATTEMPTS;
    streamAttempt += 1
  ) {
    let text: string;
    try {
      text = await mockStream(input.behavior, state);
    } catch (error) {
      if (
        !isRateLimitError(error) ||
        streamAttempt === MAX_STREAM_ATTEMPTS
      ) {
        return {status: "error", attempts: 0 };
      }

      continue;
    }
    try {
      extractJson(text);
      break;
    } catch {
      if (streamAttempt === MAX_STREAM_ATTEMPTS) {
        return {status: "error", attempts: 0 };
      }
    }
  }

  // Revise until the draft passes review.
  let attempt = 0;
  let passedReview = input.reviewPasses(attempt);

  while (!passedReview && attempt < MAX_REVISIONS) {
    attempt += 1;
    passedReview = input.reviewPasses(attempt);
  }

  if (!passedReview) {
    return {status: "error", attempts: attempt };
  }

  // Kick off the next stage and return.
  try {
    await input.advanceToNextStage();
  } catch {
    return {status: "error", attempts: attempt };
  }

  return {status: "ok", attempts: attempt };
}

export { MAX_REVISIONS };

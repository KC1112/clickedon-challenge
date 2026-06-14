import { describe, expect, it } from "vitest";
import { generate, MAX_REVISIONS } from "../lib/pipeline";

describe("revision boundary", () => {
  it("succeeds when review passes on the final permitted revision", async () => {
    let handOffs = 0;

    const result = await generate({
      behavior: "ok",
      advanceToNextStage: async () => {
        handOffs += 1;
      },
      reviewPasses: (attempt) => attempt === MAX_REVISIONS,
    });

    expect(result.status).toBe("ok");
    expect(result.attempts).toBe(MAX_REVISIONS);
    expect(handOffs).toBe(1);
  });
});

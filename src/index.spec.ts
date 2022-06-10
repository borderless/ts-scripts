import { describe, it, expect } from "vitest";
import { main } from "./index.js";

describe("ts-scripts", () => {
  it("should export a main function", () => {
    expect(main).toBeInstanceOf(Function);
  });
});

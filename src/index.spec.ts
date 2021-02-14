import { main } from "./index";

describe("ts-scripts", () => {
  it("should export a main function", () => {
    expect(main).toBeInstanceOf(Function);
  });
});

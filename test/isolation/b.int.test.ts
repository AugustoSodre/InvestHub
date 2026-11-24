import { it } from "vitest";
import { assertOnlyOwnRowsVisible } from "./isolation";

it("file B sees only its own rows", async () => {
  await assertOnlyOwnRowsVisible("file-b");
});

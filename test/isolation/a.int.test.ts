import { it } from "vitest";
import { assertOnlyOwnRowsVisible } from "./isolation";

it("file A sees only its own rows", async () => {
  await assertOnlyOwnRowsVisible("file-a");
});

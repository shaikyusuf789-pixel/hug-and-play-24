
import { getIdeas } from "./src/lib/engine.functions";

async function test() {
  const result = await getIdeas({ data: {} });
  console.log(JSON.stringify(result, null, 2));
}

test();

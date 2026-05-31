
import { runIdeaEngine } from "./src/lib/engine.functions";

async function run() {
  console.log("Running Idea Engine...");
  const res = await runIdeaEngine({ data: {} });
  console.log(JSON.stringify(res, null, 2));
}

run();

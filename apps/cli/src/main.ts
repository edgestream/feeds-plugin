#!/usr/bin/env node
import { createFeeds } from "@edgestream/feeds-runtime";
import { runCli } from "./index.js";

const controller = new AbortController();
const cancel = () => controller.abort();
process.once("SIGINT", cancel);
try {
  process.exitCode = await runCli(process.argv.slice(2), () => createFeeds(), {
    stdout: text => { process.stdout.write(text); },
    stderr: text => { process.stderr.write(text); },
  }, { signal: controller.signal });
} finally {
  process.removeListener("SIGINT", cancel);
}

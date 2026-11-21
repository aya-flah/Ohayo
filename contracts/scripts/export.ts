import { writeWebBundle } from "./deploy";

/** Refresh the website's ABI + address bundle without deploying. */
writeWebBundle().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});

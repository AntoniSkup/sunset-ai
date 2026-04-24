import { defineConfig } from "@trigger.dev/sdk/v3";

export default defineConfig({
  project: "proj_asnwpfmudabxtxkwfrja",
  runtime: "node",
  logLevel: "log",
  // The max compute seconds a task is allowed to run. If the task run exceeds this duration, it will be stopped.
  // You can override this on an individual task.
  // See https://trigger.dev/docs/runs/max-duration
  experimental_processKeepAlive: true,
  maxDuration: 3600,
  retries: {
    enabledInDev: true,
    default: {
      maxAttempts: 1,
      minTimeoutInMs: 1000,
      maxTimeoutInMs: 10000,
      factor: 2,
      randomize: true,
    },
  },
  build: {
    // esbuild ships per-platform native binaries that are loaded via a relative
    // path from the API entrypoint at runtime. Bundling it into the Trigger
    // worker breaks that lookup ("The esbuild JavaScript API cannot be
    // bundled..."). The package must be installed at runtime instead, which is
    // exactly what `external` does (Trigger emits a generated package.json
    // pinned to the version in node_modules).
    external: ["esbuild"],
  },
  dirs: ["./src/trigger"],
});

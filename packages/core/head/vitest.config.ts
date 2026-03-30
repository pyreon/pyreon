import { createVitestConfig } from "@vitus-labs/tools-vitest";
import { mergeConfig } from "vite";
import { sharedConfig } from "../../../vitest.shared";

export default mergeConfig(createVitestConfig({ environment: "happy-dom" }), sharedConfig);

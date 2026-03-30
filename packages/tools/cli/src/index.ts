#!/usr/bin/env node

/**
 * @pyreon/cli — Developer tools for Pyreon
 *
 * Commands:
 *   pyreon doctor [--fix] [--json]  — Scan project for React patterns, bad imports, etc.
 *   pyreon context                  — Generate .pyreon/context.json for AI tools
 */

import { generateContext } from "./context";
import { type DoctorOptions, doctor } from "./doctor";

const args = process.argv.slice(2);
const command = args[0];

function printUsage(): void {
  console.log(`
  pyreon <command> [options]

  Commands:
    doctor [--fix] [--json] [--ci]   Scan for React patterns, bad imports, and common mistakes
    context [--out <path>]           Generate .pyreon/context.json for AI tools

  Options:
    --help                           Show this help message
    --version                        Show version
`);
}

async function main(): Promise<void> {
  if (!command || command === "--help" || command === "-h") {
    printUsage();
    return;
  }

  if (command === "--version" || command === "-v") {
    console.log("0.4.0");
    return;
  }

  if (command === "doctor") {
    const options: DoctorOptions = {
      fix: args.includes("--fix"),
      json: args.includes("--json"),
      ci: args.includes("--ci"),
      cwd: process.cwd(),
    };
    const exitCode = await doctor(options);
    if (options.ci && exitCode > 0) {
      process.exit(1);
    }
    return;
  }

  if (command === "context") {
    const outIdx = args.indexOf("--out");
    const outPath = outIdx >= 0 ? args[outIdx + 1] : undefined;
    await generateContext({ cwd: process.cwd(), outPath });
    return;
  }

  console.error(`Unknown command: ${command}`);
  printUsage();
  process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

export type { ContextOptions, ProjectContext } from "./context";
export type { DoctorOptions } from "./doctor";
export { doctor, generateContext };

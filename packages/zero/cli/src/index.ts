import cac from "cac"
import { build } from "./commands/build"
import { context } from "./commands/context"
import { create } from "./commands/create"
import { dev } from "./commands/dev"
import { doctor } from "./commands/doctor"
import { preview } from "./commands/preview"

const cli = cac("zero")

cli
  .command("[root]", "Start dev server")
  .alias("dev")
  .option("--port <port>", "Server port", { default: 3000 })
  .option("--host [host]", "Server host")
  .option("--open", "Open browser on start")
  .action(dev)

cli
  .command("build [root]", "Build for production")
  .option("--mode <mode>", "Rendering mode override")
  .action(build)

cli
  .command("preview [root]", "Preview production build")
  .option("--port <port>", "Server port", { default: 3000 })
  .option("--host [host]", "Server host")
  .action(preview)

cli
  .command("doctor [root]", "Check for React patterns and framework issues")
  .option("--fix", "Auto-fix fixable issues")
  .option("--json", "Output as JSON")
  .option("--ci", "CI mode — exit with code 1 on errors")
  .action(doctor)

cli
  .command("context [root]", "Generate project context for AI tools")
  .option("--out <path>", "Output path (default: .pyreon/context.json)")
  .action(context)

cli.command("create <name>", "Scaffold a new Pyreon Zero project").action(create)

cli.help()
cli.version("0.0.1")
cli.parse()

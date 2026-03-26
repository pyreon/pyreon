import { existsSync } from "node:fs"
import { cp, readFile, writeFile } from "node:fs/promises"
import { basename, join, resolve } from "node:path"

export async function create(name: string | undefined) {
  if (!name) {
    console.error("Usage: zero create <project-name>")
    process.exit(1)
  }

  const targetDir = resolve(process.cwd(), name)

  if (existsSync(targetDir)) {
    console.error(`Directory "${name}" already exists.`)
    process.exit(1)
  }

  try {
    // Resolve template directory relative to this package
    const templateDir = resolve(
      import.meta.dirname,
      "../../node_modules/@pyreon/create-zero/templates/default",
    )

    // Fallback: try workspace resolution
    let sourceDir = templateDir
    if (!existsSync(sourceDir)) {
      const altDir = resolve(import.meta.dirname, "../../../create-zero/templates/default")
      if (existsSync(altDir)) {
        sourceDir = altDir
      } else {
        console.error(
          "Template not found. Install @pyreon/create-zero or use: bun create @pyreon/zero",
        )
        process.exit(1)
      }
    }

    // Copy template
    await cp(sourceDir, targetDir, { recursive: true })

    // Update package.json with project name
    const pkgPath = join(targetDir, "package.json")
    const pkg = JSON.parse(await readFile(pkgPath, "utf-8"))
    pkg.name = basename(name)
    await writeFile(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`)

    // Create .gitignore (npm strips .gitignore from packages)
    await writeFile(join(targetDir, ".gitignore"), "node_modules\ndist\n.DS_Store\n*.local\n")

    console.log(`\nCreated "${name}"!\n`)
    console.log("Next steps:")
    console.log(`  cd ${name}`)
    console.log("  bun install")
    console.log("  bun run dev")
    console.log("")
  } catch (error) {
    console.error("Failed to create project:", (error as Error).message)
    process.exit(1)
  }
}

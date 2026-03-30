import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { createServer } from "vite";

export interface DevOptions {
  port?: number;
  host?: string | boolean;
  open?: boolean;
}

export async function dev(root: string | undefined, options: DevOptions) {
  try {
    const projectRoot = resolve(root ?? ".");

    const server = await createServer({
      root: projectRoot,
      server: {
        port: options.port ?? 3000,
        host: options.host === true ? "0.0.0.0" : options.host || false,
        ...(options.open != null ? { open: options.open } : {}),
      },
    });

    await server.listen();
    server.printUrls();

    // Print route table after server starts
    await printRouteTable(projectRoot);
  } catch (error) {
    console.error("Failed to start dev server:", (error as Error).message);
    process.exit(1);
  }
}

async function printRouteTable(projectRoot: string) {
  try {
    const routesDir = join(projectRoot, "src/routes");
    if (!existsSync(routesDir)) return;

    const { scanRouteFiles, parseFileRoutes } = await import("@pyreon/zero");
    const { isApiRoute, apiFilePathToPattern } = await import("@pyreon/zero/api-routes");

    const files = await scanRouteFiles(routesDir);
    const pageRoutes = parseFileRoutes(files).filter(
      (r) => !r.isLayout && !r.isError && !r.isLoading && !isApiRoute(r.filePath),
    );
    const apiFiles = files.filter(isApiRoute);

    if (pageRoutes.length === 0 && apiFiles.length === 0) return;

    console.log("");
    console.log("  \x1b[36m Routes\x1b[0m");
    console.log("");

    for (const route of pageRoutes) {
      const mode = route.renderMode.toUpperCase();
      console.log(`  \x1b[2m${mode.padEnd(4)}\x1b[0m ${route.urlPath}`);
    }

    if (apiFiles.length > 0) {
      console.log("");
      console.log("  \x1b[33m API Routes\x1b[0m");
      console.log("");
      for (const file of apiFiles) {
        console.log(`  \x1b[2mAPI \x1b[0m ${apiFilePathToPattern(file)}`);
      }
    }

    console.log("");
  } catch {
    // Route table is informational — don't fail dev server
  }
}

FROM oven/bun:1@sha256:9114c058aeae42162ee16dd5084b95fe9473970bb6bcb5b232ab1630f0546895 AS build
WORKDIR /app
COPY package.json bun.lock* ./
RUN bun install --frozen-lockfile
COPY . .
RUN bun run build

FROM oven/bun:1@sha256:9114c058aeae42162ee16dd5084b95fe9473970bb6bcb5b232ab1630f0546895
WORKDIR /app
# The bun adapter's dist/ tree is self-contained: dist/index.ts (the
# emitted Bun.serve() runner — Bun runs TS natively) + dist/server/
# (SSR bundle — externals are node:* builtins only) + dist/client/
# (static assets). No node_modules needed at runtime.
COPY --from=build /app/dist ./dist
EXPOSE 3000
CMD ["bun", "dist/index.ts"]

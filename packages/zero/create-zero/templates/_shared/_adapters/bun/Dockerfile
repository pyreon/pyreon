FROM oven/bun:1@sha256:5ff609364c049b54eb0ff560ec96319729a972078ef2c755d758f0c6ef89c2d6 AS build
WORKDIR /app
COPY package.json bun.lock* ./
RUN bun install --frozen-lockfile
COPY . .
RUN bun run build

FROM oven/bun:1@sha256:5ff609364c049b54eb0ff560ec96319729a972078ef2c755d758f0c6ef89c2d6
WORKDIR /app
# The bun adapter's dist/ tree is self-contained: dist/index.ts (the
# emitted Bun.serve() runner — Bun runs TS natively) + dist/server/
# (SSR bundle — externals are node:* builtins only) + dist/client/
# (static assets). No node_modules needed at runtime.
COPY --from=build /app/dist ./dist
EXPOSE 3000
CMD ["bun", "dist/index.ts"]

FROM oven/bun:1@sha256:e10577f0db68676a7024391c6e5cb4b879ebd17188ab750cf10024a6d700e5c4 AS build
WORKDIR /app
COPY package.json bun.lock* ./
RUN bun install --frozen-lockfile
COPY . .
RUN bun run build

FROM oven/bun:1@sha256:e10577f0db68676a7024391c6e5cb4b879ebd17188ab750cf10024a6d700e5c4
WORKDIR /app
# The bun adapter's dist/ tree is self-contained: dist/index.ts (the
# emitted Bun.serve() runner — Bun runs TS natively) + dist/server/
# (SSR bundle — externals are node:* builtins only) + dist/client/
# (static assets). No node_modules needed at runtime.
COPY --from=build /app/dist ./dist
EXPOSE 3000
CMD ["bun", "dist/index.ts"]

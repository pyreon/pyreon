FROM oven/bun:1@sha256:ec06c3b6cea04192ae6770c434f668ca41d343ad19fa6472216c7b48be39c598 AS build
WORKDIR /app
COPY package.json bun.lock* ./
RUN bun install --frozen-lockfile
COPY . .
RUN bun run build

FROM oven/bun:1@sha256:ec06c3b6cea04192ae6770c434f668ca41d343ad19fa6472216c7b48be39c598
WORKDIR /app
# The bun adapter's dist/ tree is self-contained: dist/index.ts (the
# emitted Bun.serve() runner — Bun runs TS natively) + dist/server/
# (SSR bundle — externals are node:* builtins only) + dist/client/
# (static assets). No node_modules needed at runtime.
COPY --from=build /app/dist ./dist
# Production mode: dev-only diagnostics stay off and error responses stay
# generic. The server bundle also bakes this in; setting it here covers
# anything read at runtime.
ENV NODE_ENV=production
# Never run the server as root.
USER bun
EXPOSE 3000
CMD ["bun", "dist/index.ts"]

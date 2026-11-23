FROM oven/bun:1@sha256:3aa040e5445efa09d75bb428a64ba50db13e2b3ac9b6b0c7f145615f62b2ee18 AS build
WORKDIR /app
COPY package.json bun.lock* ./
RUN bun install --frozen-lockfile
COPY . .
RUN bun run build

# Production dependencies only. The server bundle imports the app's
# packages (@pyreon/*, and whatever else the routes use) from node_modules
# at runtime.
FROM oven/bun:1@sha256:3aa040e5445efa09d75bb428a64ba50db13e2b3ac9b6b0c7f145615f62b2ee18 AS deps
WORKDIR /app
COPY package.json bun.lock* ./
RUN bun install --frozen-lockfile --production

FROM oven/bun:1@sha256:3aa040e5445efa09d75bb428a64ba50db13e2b3ac9b6b0c7f145615f62b2ee18
WORKDIR /app
# dist/index.ts (the emitted Bun.serve() runner — Bun runs TS natively) +
# dist/server/ (SSR bundle) + dist/client/ (static assets). The SSR bundle
# resolves its package imports from /app/node_modules.
COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
# Production mode: dev-only diagnostics stay off and error responses stay
# generic. The server bundle also bakes this in; setting it here covers
# anything read at runtime.
ENV NODE_ENV=production
# Never run the server as root.
USER bun
EXPOSE 3000
CMD ["bun", "dist/index.ts"]

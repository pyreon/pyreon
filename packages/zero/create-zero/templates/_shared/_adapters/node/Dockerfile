# Build with Bun (the project's package manager: bun.lock, `bun run build`)
# from the official image. Do not swap this for `corepack prepare bun`:
# corepack never supported Bun, and Node 25+ no longer ships corepack.
FROM oven/bun:1@sha256:3aa040e5445efa09d75bb428a64ba50db13e2b3ac9b6b0c7f145615f62b2ee18 AS build
WORKDIR /app
COPY package.json bun.lock* ./
RUN bun install --frozen-lockfile
COPY . .
RUN bun run build

# Production dependencies only. The server bundle imports the app's
# packages (@pyreon/*, and whatever else the routes use) from node_modules
# at runtime. Installed on Alpine (musl), like the runtime image, so a
# native addon gets the matching binary.
FROM oven/bun:1-alpine@sha256:da816670775f4c2b4e990b6b1847cf5540dcdc721a42033dd331ce7a88ba6a3b AS deps
WORKDIR /app
COPY package.json bun.lock* ./
RUN bun install --frozen-lockfile --production

# Run on Node: the node adapter emits a node:http runner.
FROM node:26-alpine@sha256:6bd9ab43c0ec0190ca7b2d193906cb8b7edf6e7f4afa43ddeccd6452710bffb5
WORKDIR /app
# dist/index.js (the emitted node:http runner) + dist/server/ (SSR bundle)
# + dist/client/ (static assets); dist/package.json marks it ESM. The SSR
# bundle resolves its package imports from /app/node_modules.
COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
# Production mode: dev-only diagnostics stay off and error responses stay
# generic. The server bundle also bakes this in; setting it here covers
# anything read at runtime.
ENV NODE_ENV=production
# Never run the server as root.
USER node
EXPOSE 3000
CMD ["node", "dist/index.js"]

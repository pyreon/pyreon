# Build with Bun (the project's package manager: bun.lock, `bun run build`)
# from the official image. Do not swap this for `corepack prepare bun`:
# corepack never supported Bun, and Node 25+ no longer ships corepack.
FROM oven/bun:1@sha256:1d22548f177f4ff38e0c15baa3c2c46c6c2060ba2d1bc573bb4720b407548f1d AS build
WORKDIR /app
COPY package.json bun.lock* ./
RUN bun install --frozen-lockfile
COPY . .
RUN bun run build

# Production dependencies only. The server bundle imports the app's
# packages (@pyreon/*, and whatever else the routes use) from node_modules
# at runtime. Installed on Alpine (musl), like the runtime image, so a
# native addon gets the matching binary.
FROM oven/bun:1-alpine@sha256:4cf82f5686b196504fe119db3fcd9185b191f82ece82c40680e597228ec6070a AS deps
WORKDIR /app
COPY package.json bun.lock* ./
RUN bun install --frozen-lockfile --production

# Run on Node: the node adapter emits a node:http runner.
FROM node:26-alpine@sha256:c6ad9e9c1d80f6eb607c26b4b0a132ff7a2344fad1c78ea3baa2a7d4c8de6d94
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

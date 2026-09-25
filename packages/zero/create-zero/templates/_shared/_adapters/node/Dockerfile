FROM node:24-alpine@sha256:d32cdf619f63fe0471182d08996dd516c6275bb5fd31ae06e55a570bd9e1ad43 AS build
WORKDIR /app
COPY package.json bun.lock* ./
RUN corepack enable && corepack prepare bun@latest --activate && bun install --frozen-lockfile
COPY . .
RUN bun run build

FROM node:24-alpine@sha256:d32cdf619f63fe0471182d08996dd516c6275bb5fd31ae06e55a570bd9e1ad43
WORKDIR /app
# The node adapter's dist/ tree is self-contained: dist/index.js (the
# emitted node:http runner) + dist/server/ (SSR bundle — externals are
# node:* builtins only) + dist/client/ (static assets). No node_modules
# or root package.json needed at runtime (dist/package.json marks ESM).
COPY --from=build /app/dist ./dist
# Production mode: dev-only diagnostics stay off and error responses stay
# generic. The server bundle also bakes this in; setting it here covers
# anything read at runtime.
ENV NODE_ENV=production
# Never run the server as root.
USER node
EXPOSE 3000
CMD ["node", "dist/index.js"]

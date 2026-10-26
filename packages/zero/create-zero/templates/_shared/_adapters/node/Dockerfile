FROM node:26-alpine@sha256:40cd011b55415bc894e45b02fdd5a5dfde056921b7d23a64c74f80497af48797 AS build
WORKDIR /app
COPY package.json bun.lock* ./
RUN corepack enable && corepack prepare bun@latest --activate && bun install --frozen-lockfile
COPY . .
RUN bun run build

FROM node:26-alpine@sha256:40cd011b55415bc894e45b02fdd5a5dfde056921b7d23a64c74f80497af48797
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

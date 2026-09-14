FROM node:26-alpine@sha256:ef24c5053d50fdc3e4e56eb4e7ddb7861874ab0fdc797046ba897581deb8e868 AS build
WORKDIR /app
COPY package.json bun.lock* ./
RUN corepack enable && corepack prepare bun@latest --activate && bun install --frozen-lockfile
COPY . .
RUN bun run build

FROM node:26-alpine@sha256:ef24c5053d50fdc3e4e56eb4e7ddb7861874ab0fdc797046ba897581deb8e868
WORKDIR /app
# The node adapter's dist/ tree is self-contained: dist/index.js (the
# emitted node:http runner) + dist/server/ (SSR bundle — externals are
# node:* builtins only) + dist/client/ (static assets). No node_modules
# or root package.json needed at runtime (dist/package.json marks ESM).
COPY --from=build /app/dist ./dist
EXPOSE 3000
CMD ["node", "dist/index.js"]

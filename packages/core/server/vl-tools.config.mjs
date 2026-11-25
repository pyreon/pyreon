// The server-island marker module (`serverIsland()` and the fragment fetch,
// `src/server-island.ts`) is its own lib chunk. A browser app that never uses
// a server island imports `@pyreon/server/client` for the islands runtime,
// which shares the island codec and the fragment base with it; in one chunk
// file, an app bundler that pulls any of it in (zero's islands runtime
// activates server islands on demand) carries the marker code into the same
// output chunk as the runtime. Its own file lets the bundler load it only
// where a page has a server island (`@pyreon/zero`'s `islandsRuntimeChunk`).
export default {
  build: {
    plugins: [
      {
        name: 'pyreon-server:server-island-chunk',
        outputOptions(options) {
          return {
            ...options,
            codeSplitting: {
              includeDependenciesRecursively: false,
              groups: [{ name: 'server-island', test: /[\\/]src[\\/]server-island\.ts$/ }],
            },
          }
        },
      },
    ],
  },
}

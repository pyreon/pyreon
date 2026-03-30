export default {
  build: {
    typescript: false,
    entries: [
      { input: 'src/index.ts', file: 'lib/index.js' },
      { input: 'src/client.ts', file: 'lib/client.js' },
      { input: 'src/config.ts', file: 'lib/config.js' },
      { input: 'src/image.tsx', file: 'lib/image.js' },
      { input: 'src/link.tsx', file: 'lib/link.js' },
      { input: 'src/script.tsx', file: 'lib/script.js' },
      { input: 'src/font.ts', file: 'lib/font.js' },
      { input: 'src/cache.ts', file: 'lib/cache.js' },
      { input: 'src/seo.ts', file: 'lib/seo.js' },
      { input: 'src/theme.tsx', file: 'lib/theme.js' },
      { input: 'src/image-plugin.ts', file: 'lib/image-plugin.js' },
    ],
  },
}

export default {
  build: {
    outputDir: 'dist',
    typescript: false,
    bundleAll: true,
    entries: [
      { input: 'src/devtools.ts', file: 'dist/devtools.js', format: 'iife' },
      { input: 'src/panel.ts', file: 'dist/panel.js', format: 'iife' },
      {
        input: 'src/content-script.ts',
        file: 'dist/content-script.js',
        format: 'iife',
      },
      { input: 'src/page-hook.ts', file: 'dist/page-hook.js', format: 'iife' },
      { input: 'src/background.ts', file: 'dist/background.js', format: 'es' },
    ],
    copyFiles: [
      { from: 'manifest.json', to: 'dist/manifest.json' },
      { from: 'src/panel.css', to: 'dist/panel.css' },
      { from: 'devtools.html', to: 'dist/devtools.html' },
      { from: 'panel.html', to: 'dist/panel.html' },
      { from: 'icons', to: 'dist/icons' },
    ],
  },
}

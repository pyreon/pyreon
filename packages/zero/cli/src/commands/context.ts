import { resolve } from 'node:path'

export interface ContextOptions {
  out?: string
}

export async function context(root: string | undefined, options: ContextOptions) {
  try {
    const { generateContext } = await import('@pyreon/cli')
    const cwd = resolve(root ?? '.')
    await generateContext({
      cwd,
      outPath: options.out,
    })
  } catch (error) {
    console.error('[Pyreon] Context generation failed:', error)
    process.exit(1)
  }
}

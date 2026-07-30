/** A rocketstyle chain in a file WITH a relative import — the shape the
 * relative-path bug silently dropped. */
import { box } from './kit'

export const Chip = box
  .attrs({ tag: 'span' })
  .variants((t: { accent: string }) => ({
    solid: { backgroundColor: t.accent },
    outline: { borderColor: t.accent },
  }))

/**
 * A rocketstyle CHAIN in a file with a RELATIVE import — the two shapes that
 * were historically broken together, kept here as a living regression fixture:
 *
 *   - the chain is a call expression the static scanner structurally cannot
 *     see, so this component reaches the catalog ONLY through rocketstyle
 *     discovery (`IS_ROCKETSTYLE` + `getStaticDimensions` on the loaded
 *     module), in `atlas scan` and `atlas dev` alike;
 *   - the `./chip-kit` import means a loader handed a RELATIVE path cannot
 *     even evaluate this module — the bug that silently dropped every
 *     rocketstyle component from files with sibling imports.
 *
 * The variant values below dereference theme tokens, so its axes exist in the
 * catalog only because `atlas.config.ts` exports the theme they are read
 * against.
 */
import { chipBase } from './chip-kit'

export const Chip = chipBase
  .attrs({ tag: 'span', css: 'display:inline-flex;align-items:center;' })
  .theme((t: { accent: string; text: string }) => ({
    padding: '3px 10px',
    borderRadius: '12px',
    fontSize: '12px',
    fontWeight: 600,
    color: t.text,
  }))
  // The callback param is typed by rocketstyle from the (empty) local theme
  // augmentation, so the token read narrows the RUNTIME theme the config
  // supplies — same shape the demo catalog handles with its `dim()` helper,
  // inlined here because this file must not import the workbench package.
  .variants((t) => {
    const tok = t as unknown as { accent: string }
    return {
      solid: { backgroundColor: tok.accent, color: '#fff' },
      outline: {
        backgroundColor: 'transparent',
        borderWidth: '1px',
        borderStyle: 'solid',
        borderColor: tok.accent,
      },
    }
  })

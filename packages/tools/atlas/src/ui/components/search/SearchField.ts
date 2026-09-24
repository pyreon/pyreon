import { el, type InputEl } from '../../kit'

export const SearchField = el
  .attrs({ tag: 'input' })
  .theme((t) => ({
    flex: '1', border: 'none', background: 'transparent', color: t.text,
    fontSize: '15px', padding: '12px 0',
    extendCss: `outline:none;font-family:inherit;&::placeholder{color:${t.faint};}`,
  })) as unknown as InputEl

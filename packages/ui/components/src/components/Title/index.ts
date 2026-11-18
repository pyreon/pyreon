import { tones, txt } from '../../factory'

const Title = txt
  .config({ name: 'Title' })
  .attrs({ tag: 'h2' })
  .theme((t, m) => ({
    color: tones(t, m).text,
    fontWeight: t.fontWeight.bold,
    lineHeight: t.lineHeight.small,
    margin: 0,
  }))
  .sizes((t) => ({
    h1: { fontSize: t.headingSize.level1 },
    h2: { fontSize: t.headingSize.level2 },
    h3: { fontSize: t.headingSize.level3 },
    h4: { fontSize: t.headingSize.level4 },
    h5: { fontSize: t.headingSize.level5 },
    h6: { fontSize: t.headingSize.level6 },
  }))

export default Title

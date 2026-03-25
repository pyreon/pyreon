import { Text } from "@pyreon/elements"
import rocketstyle from "@pyreon/rocketstyle"

const DocHeading = rocketstyle({
  dimensions: {
    levels: "level",
  },
  useBooleans: true,
})({ name: "DocHeading", component: Text })
  .theme({
    fontWeight: "bold",
    color: "#1a1a2e",
    marginBottom: 12,
  })
  .levels({
    h1: { fontSize: 32, lineHeight: 1.2 },
    h2: { fontSize: 24, lineHeight: 1.3 },
    h3: { fontSize: 20, lineHeight: 1.4 },
    h4: { fontSize: 18, lineHeight: 1.4 },
    h5: { fontSize: 16, lineHeight: 1.5 },
    h6: { fontSize: 14, lineHeight: 1.5 },
  })
  .statics({ _documentType: "heading" as const })
  .attrs<{ level?: string; tag: string; _documentProps: { level: number } }>((props) => {
    const lvl = props.level ?? "h1"
    const num = Number.parseInt(String(lvl).replace("h", ""), 10) || 1
    return {
      tag: lvl,
      _documentProps: { level: num },
    }
  })

export default DocHeading

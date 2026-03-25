import { Element } from "@pyreon/elements"
import rocketstyle from "@pyreon/rocketstyle"

const DocQuote = rocketstyle()({ name: "DocQuote", component: Element })
  .theme({
    borderColor: "#4f46e5",
    padding: "8px 16px",
    fontStyle: "italic",
    color: "#666666",
  })
  .statics({ _documentType: "quote" as const })
  .attrs<{ borderColor?: string; tag: string; _documentProps: Record<string, unknown> }>(
    (props) => ({
      tag: "blockquote",
      _documentProps: props.borderColor ? { borderColor: props.borderColor } : {},
    }),
  )

export default DocQuote

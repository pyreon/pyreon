import { Element } from "@pyreon/elements"
import rocketstyle from "@pyreon/rocketstyle"

const DocPageBreak = rocketstyle()({ name: "DocPageBreak", component: Element })
  .statics({ _documentType: "page-break" as const })
  .attrs<{ tag: string; _documentProps: Record<string, unknown> }>((_props) => ({
    tag: "div",
    _documentProps: {},
  }))

export default DocPageBreak

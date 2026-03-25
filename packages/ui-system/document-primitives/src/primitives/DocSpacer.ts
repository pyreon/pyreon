import { Element } from "@pyreon/elements"
import rocketstyle from "@pyreon/rocketstyle"

const DocSpacer = rocketstyle()({ name: "DocSpacer", component: Element })
  .statics({ _documentType: "spacer" as const })
  .attrs<{ height?: number; tag: string; _documentProps: { height: number } }>((props) => ({
    tag: "div",
    _documentProps: { height: props.height ?? 16 },
  }))

export default DocSpacer

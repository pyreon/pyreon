import { Element } from "@pyreon/elements"
import rocketstyle from "@pyreon/rocketstyle"

const DocImage = rocketstyle()({ name: "DocImage", component: Element })
  .statics({ _documentType: "image" as const })
  .attrs<{
    src?: string
    alt?: string
    width?: number | string
    height?: number | string
    caption?: string
    tag: string
    _documentProps: Record<string, unknown>
  }>((props) => ({
    tag: "img",
    _documentProps: {
      src: props.src ?? "",
      ...(props.alt ? { alt: props.alt } : {}),
      ...(props.width ? { width: props.width } : {}),
      ...(props.height ? { height: props.height } : {}),
      ...(props.caption ? { caption: props.caption } : {}),
    },
  }))

export default DocImage

import { Text } from "@pyreon/elements";
import rocketstyle from "@pyreon/rocketstyle";

const DocCode = rocketstyle()({ name: "DocCode", component: Text })
  .theme({
    fontFamily: "ui-monospace, monospace",
    fontSize: 13,
    backgroundColor: "#f5f5f5",
    padding: "8px 12px",
    borderRadius: 4,
  })
  .statics({ _documentType: "code" as const })
  .attrs<{ language?: string; tag: string; _documentProps: Record<string, unknown> }>((props) => ({
    tag: "pre",
    _documentProps: props.language ? { language: props.language } : {},
  }));

export default DocCode;

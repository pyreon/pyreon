import { Text } from "@pyreon/elements";
import rocketstyle from "@pyreon/rocketstyle";

const DocListItem = rocketstyle()({ name: "DocListItem", component: Text })
  .theme({
    fontSize: 14,
    lineHeight: 1.5,
  })
  .statics({ _documentType: "list-item" as const })
  .attrs<{ tag: string; _documentProps: Record<string, unknown> }>((_props) => ({
    tag: "li",
    _documentProps: {},
  }));

export default DocListItem;

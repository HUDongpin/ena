import { createElement } from "react";

export default function Image({
  alt = "",
  fill: _fill,
  priority: _priority,
  ...rest
}: {
  alt?: string;
  fill?: boolean;
  priority?: boolean;
  [key: string]: unknown;
}) {
  return createElement("img", { alt, ...rest });
}

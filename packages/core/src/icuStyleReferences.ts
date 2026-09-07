import { parse, TYPE, type MessageFormatElement } from "@formatjs/icu-messageformat-parser";

export type IcuFormatType = "number" | "date" | "time";

export interface IcuStyleReference {
  type: IcuFormatType;
  style: string;
  isSkeleton: boolean;
}

/** Visit syntax, never quoted literal text. Shared by authoring analyses. */
export function visitIcuElements(
  elements: MessageFormatElement[],
  visit: (element: MessageFormatElement) => void,
) {
  for (const element of elements) {
    visit(element);
    if (element.type === TYPE.tag) visitIcuElements(element.children, visit);
    if (element.type === TYPE.select || element.type === TYPE.plural) {
      for (const option of Object.values(element.options)) visitIcuElements(option.value, visit);
    }
  }
}

export function extractIcuStyleReferences(
  value: string | MessageFormatElement[],
): IcuStyleReference[] {
  const references: IcuStyleReference[] = [];
  visitIcuElements(typeof value === "string" ? parse(value) : value, (element) => {
    if (element.type !== TYPE.number && element.type !== TYPE.date && element.type !== TYPE.time)
      return;
    const style = element.style;
    if (!style) return;
    const type = TYPE[element.type] as IcuFormatType;
    if (typeof style === "string") {
      references.push({ type, style, isSkeleton: false });
    } else {
      const skeleton =
        "pattern" in style
          ? style.pattern
          : style.tokens.map((token) => [token.stem, ...token.options].join("/")).join(" ");
      references.push({ type, style: `::${skeleton}`, isSkeleton: true });
    }
  });
  return references;
}

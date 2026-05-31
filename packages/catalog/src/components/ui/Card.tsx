import type { ReactNode } from "react";

import { themeClasses } from "../../theme";

export function Card(props: { children: ReactNode; className?: string }) {
  return (
    <section className={`${themeClasses.panel} ${props.className || ""}`}>{props.children}</section>
  );
}

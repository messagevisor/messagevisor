import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { SearchHighlight } from "./SearchHighlight";

describe("SearchHighlight", function () {
  it("highlights case-insensitive text matches with the shared mark styling", function () {
    const html = renderToStaticMarkup(
      React.createElement(SearchHighlight, { text: "Welcome back", query: "welcome" }),
    );

    expect(html).toContain("<mark");
    expect(html).toContain("bg-amber-100");
    expect(html).toContain(">Welcome</mark>");
  });

  it("escapes query text before matching", function () {
    const html = renderToStaticMarkup(
      React.createElement(SearchHighlight, { text: "Use plan.* literally", query: "plan.*" }),
    );

    expect(html).toContain(">plan.*</mark>");
  });
});

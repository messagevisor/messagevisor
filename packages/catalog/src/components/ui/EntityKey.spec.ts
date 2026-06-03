import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { EntityKey } from "./EntityKey";

describe("EntityKey", function () {
  it("highlights namespace queries that include dots", function () {
    const html = renderToStaticMarkup(
      React.createElement(EntityKey, {
        value: "auth.xyz.login",
        highlightQuery: ["auth.xyz"],
      }),
    );

    expect(html).toContain("<mark");
    expect(html).toContain("auth");
    expect(html).toContain("xyz");
    expect(html).toContain("<wbr");
  });

  it("highlights trailing namespace dots while preserving word-break hints", function () {
    const html = renderToStaticMarkup(
      React.createElement(EntityKey, {
        value: "auth.signin.title",
        highlightQuery: ["auth."],
      }),
    );

    expect(html).toContain("<mark");
    expect(html).toContain("auth");
    expect(html).toContain("<wbr");
  });
});

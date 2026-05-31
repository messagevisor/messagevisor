import * as React from "react";
import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";

import { MessagevisorProvider } from "./MessagevisorProvider";
import { createTestInstance } from "./testUtils";
import { useSdk } from "./useSdk";

describe("useSdk", function () {
  it("returns the provided SDK instance", function () {
    const instance = createTestInstance();
    const seen: unknown[] = [];

    function TestComponent() {
      seen.push(useSdk());

      return <p>ok</p>;
    }

    const { rerender } = render(
      <MessagevisorProvider instance={instance}>
        <TestComponent />
      </MessagevisorProvider>,
    );

    rerender(
      <MessagevisorProvider instance={instance}>
        <TestComponent />
      </MessagevisorProvider>,
    );

    expect(screen.getByText("ok")).toBeInTheDocument();
    expect(seen).toEqual([instance, instance]);
  });

  it("throws a clear error outside MessagevisorProvider", function () {
    function Orphan() {
      useSdk();

      return <p>orphan</p>;
    }

    expect(() => render(<Orphan />)).toThrow("useSdk must be used within MessagevisorProvider.");
  });
});

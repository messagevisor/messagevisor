import * as React from "react";
import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";

import { MessagevisorProvider } from "./MessagevisorProvider";
import { createTestInstance } from "./testUtils";
import { useSdk } from "./useSdk";

describe("MessagevisorProvider", function () {
  it("supplies the same instance to descendants", function () {
    const instance = createTestInstance();
    let seen: ReturnType<typeof useSdk> | undefined;

    function TestComponent() {
      seen = useSdk();

      return <p>ready</p>;
    }

    render(
      <MessagevisorProvider instance={instance}>
        <TestComponent />
      </MessagevisorProvider>,
    );

    expect(screen.getByText("ready")).toBeInTheDocument();
    expect(seen).toBe(instance);
  });
});

/** @jest-environment jsdom */

import * as React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

import { CopyEntityKeyButton } from "./EntityDetailPage";

describe("CopyEntityKeyButton", function () {
  afterEach(function () {
    jest.restoreAllMocks();
  });

  it("copies with the Clipboard API and announces success", async function () {
    const writeText = jest.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
    render(<CopyEntityKeyButton entityKey="checkout.title" />);

    fireEvent.click(screen.getByRole("button", { name: "Copy checkout.title" }));

    await waitFor(() => expect(writeText).toHaveBeenCalledWith("checkout.title"));
    expect(await screen.findByRole("button", { name: "Copied checkout.title" })).toBeTruthy();
  });

  it("uses the legacy copy fallback when Clipboard access fails", async function () {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: jest.fn().mockRejectedValue(new Error("denied")) },
    });
    document.execCommand = jest.fn().mockReturnValue(true);
    render(<CopyEntityKeyButton entityKey="checkout.title" />);

    fireEvent.click(screen.getByRole("button", { name: "Copy checkout.title" }));

    await waitFor(() => expect(document.execCommand).toHaveBeenCalledWith("copy"));
    expect(await screen.findByRole("button", { name: "Copied checkout.title" })).toBeTruthy();
  });

  it("announces failure when no copy mechanism succeeds", async function () {
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: undefined });
    document.execCommand = jest.fn().mockReturnValue(false);
    render(<CopyEntityKeyButton entityKey="checkout.title" />);

    fireEvent.click(screen.getByRole("button", { name: "Copy checkout.title" }));

    expect(
      await screen.findByRole("button", { name: "Could not copy checkout.title" }),
    ).toBeTruthy();
  });
});

/** @jest-environment jsdom */

import * as React from "react";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

import { EntityTests } from "./EntityTests";

describe("EntityTests", function () {
  beforeEach(function () {
    window.requestAnimationFrame = (callback) => {
      callback(0);
      return 1;
    };
    window.cancelAnimationFrame = () => {};
    Element.prototype.scrollIntoView = jest.fn();
  });

  it("renders canonical matrix metadata and runtime expectations", function () {
    render(
      <MemoryRouter initialEntries={["/messages/welcome/tests?assertion=welcome:1.2"]}>
        <EntityTests
          tests={[
            {
              key: "welcome",
              entityType: "message",
              entityKey: "welcome",
              authoredAssertions: [{ matrix: { locale: ["en", "nl"] } }],
              assertions: [
                {
                  assertionIndex: 0,
                  matrixIndex: 1,
                  matrixValues: { locale: "nl" },
                  matrixCount: 2,
                  locale: "nl",
                  expectedTranslation: "Hallo",
                  expectedByRuntime: { swift: "Hallo Swift" },
                },
              ],
            },
          ]}
        />
      </MemoryRouter>,
    );

    expect(screen.getByText("Assertion 1.2")).toBeTruthy();
    expect(screen.getByText("Matrix case 2 of 2")).toBeTruthy();
    expect(screen.getAllByText("nl").length).toBeGreaterThan(0);
    expect(screen.getByText("expectedByRuntime")).toBeTruthy();
    expect(screen.getByText("Hallo Swift")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Link to assertion 1.2" }).getAttribute("href")).toBe(
      "/messages/welcome/tests?assertion=welcome%3A1.2",
    );
    expect(Element.prototype.scrollIntoView).toHaveBeenCalled();
  });

  it("uses assertion keys for labels and shows promotion protection", function () {
    render(
      <MemoryRouter initialEntries={["/messages/welcome/tests"]}>
        <EntityTests
          tests={[
            {
              key: "welcome",
              entityType: "message",
              entityKey: "welcome",
              authoredAssertions: [
                {
                  key: "production-copy",
                  promotable: false,
                  matrix: { locale: ["en", "nl"] },
                },
              ],
              assertions: [
                {
                  assertionIndex: 0,
                  matrixIndex: 0,
                  matrixValues: { locale: "en" },
                  matrixCount: 2,
                  key: "production-copy",
                  promotable: false,
                  locale: "en",
                  expectedTranslation: "Hello",
                },
              ],
            },
          ]}
        />
      </MemoryRouter>,
    );

    expect(screen.getByText("Assertion production-copy.1")).toBeTruthy();
    expect(screen.getByText("not promotable")).toBeTruthy();
    expect(
      screen
        .getByRole("link", { name: "Link to assertion production-copy.1" })
        .getAttribute("href"),
    ).toBe("/messages/welcome/tests?assertion=welcome%3Aproduction-copy.1");
  });

  it("renders an accessible empty state", function () {
    render(
      <MemoryRouter>
        <EntityTests tests={[]} />
      </MemoryRouter>,
    );
    expect(screen.getByText("No tests found")).toBeTruthy();
  });
});

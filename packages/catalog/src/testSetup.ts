import { TextDecoder, TextEncoder } from "node:util";
import * as React from "react";

Object.assign(globalThis, { TextDecoder, TextEncoder });
Object.assign(globalThis, { React });

jest.mock("react-markdown", () => ({
  __esModule: true,
  default: ({ children }: { children?: React.ReactNode }) =>
    React.createElement(React.Fragment, null, children),
}));

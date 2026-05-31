import type { ReactNode } from "react";
import { NavLink } from "react-router-dom";

export interface TabItem {
  label: string;
  to: string;
  end?: boolean;
}

export function Tabs(props: { tabs: TabItem[]; children: ReactNode }) {
  return (
    <div>
      <nav className="border-b border-border">
        {props.tabs.map((tab) => (
          <NavLink
            key={tab.to}
            to={tab.to}
            end={tab.end}
            className={({ isActive }) =>
              [
                "inline-block min-w-28 border-b-2 px-3 pb-4 pt-2 text-center text-sm font-medium",
                isActive
                  ? "border-primary text-primary"
                  : "border-transparent text-muted hover:border-border hover:text-text",
              ].join(" ")
            }
          >
            {tab.label}
          </NavLink>
        ))}
      </nav>
      <div className="px-6 py-6">{props.children}</div>
    </div>
  );
}

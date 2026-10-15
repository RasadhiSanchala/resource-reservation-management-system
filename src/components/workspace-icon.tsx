import type { SVGProps } from "react";

export type WorkspaceIconName =
  | "calendar" | "calendar-check" | "clock" | "grid" | "layers"
  | "check" | "check-circle" | "x-circle" | "search" | "pin"
  | "users" | "plus" | "arrow-right" | "arrow-left" | "edit"
  | "power" | "filter" | "refresh" | "shield" | "info"
  | "briefcase" | "chevron-right" | "alert" | "file-text" | "sparkles"
  | "list" | "sliders" | "archive" | "repeat" | "monitor";

const drawings: Record<WorkspaceIconName, string> = {
  calendar: "M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z",
  "calendar-check": "M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2ZM8 16l3 3 5-6",
  clock: "M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20ZM12 6v6l4 2",
  grid: "M3 3h8v8H3zM13 3h8v8h-8zM3 13h8v8H3zM13 13h8v8h-8z",
  layers: "m12 3 9 5-9 5-9-5 9-5ZM3 12l9 5 9-5M3 16l9 5 9-5",
  check: "M20 6 9 17l-5-5",
  "check-circle": "M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20ZM7 12l3 3 7-7",
  "x-circle": "M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20ZM9 9l6 6m0-6-6 6",
  search: "M11 3a8 8 0 1 0 0 16 8 8 0 0 0 0-16Zm6 14 4 4",
  pin: "M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 1 1 16 0ZM12 10a2.5 2.5 0 1 0 0 .01",
  users: "M16 20v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 10a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM22 20v-2a4 4 0 0 0-3-3.87M16 2.13a4 4 0 0 1 0 7.75",
  plus: "M12 5v14M5 12h14",
  "arrow-right": "M5 12h14m-7-7 7 7-7 7",
  "arrow-left": "M19 12H5m7 7-7-7 7-7",
  edit: "M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L9 17l-4 1 1-4L16.5 3.5Z",
  power: "M12 2v10M6.3 5.9a9 9 0 1 0 11.4 0",
  filter: "M4 7h16M7 12h10M10 17h4",
  refresh: "M20 7v5h-5M4 17v-5h5M5.5 9A7 7 0 0 1 18 6l2 1M4 17l2 1a7 7 0 0 0 12.5-3",
  shield: "M12 2l9 4v6c0 5-4 8-9 10-5-2-9-5-9-10V6l9-4Zm-4 10 3 3 5-5",
  info: "M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20ZM12 11v6M12 7h.01",
  briefcase: "M3 7h18v13H3V7ZM9 7V4h6v3M3 12h18",
  "chevron-right": "m9 18 6-6-6-6",
  alert: "M12 3 2 21h20L12 3ZM12 9v5M12 18h.01",
  "file-text": "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6ZM14 2v6h6M8 13h8M8 17h8",
  sparkles: "m12 3 2 6 6 2-6 2-2 6-2-6-6-2 6-2 2-6ZM19 17v5M16.5 19.5h5",
  list: "M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01",
  sliders: "M4 7h16M4 17h16M9 4v6M15 14v6",
  archive: "M3 4h18v5H3V4ZM5 9v12h14V9M10 13h4",
  repeat: "M17 2l4 4-4 4M3 11V9a3 3 0 0 1 3-3h15M7 22l-4-4 4-4M21 13v2a3 3 0 0 1-3 3H3",
  monitor: "M3 4h18v14H3V4ZM8 22h8M12 18v4",
};

export function WorkspaceIcon({
  name,
  size = 20,
  className,
  ...props
}: SVGProps<SVGSVGElement> & { name: WorkspaceIconName; size?: number }) {
  return (
    <svg
      aria-hidden="true"
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      {...props}
    >
      <path d={drawings[name]} />
    </svg>
  );
}

import type { ReactNode } from "react";

const drawings = {
  music: (
    <>
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="2" />
      <path d="M7 5.5A7 7 0 0 0 5.5 7M17 18.5a7 7 0 0 0 1.5-1.5" />
    </>
  ),
  radio: (
    <>
      <rect x="3" y="8" width="18" height="13" rx="3" />
      <path d="m6 8 12-5M7 12h6M7 16h3" />
      <circle cx="17" cy="15" r="1.5" />
    </>
  ),
  community: (
    <>
      <circle cx="9" cy="8" r="3" />
      <path d="M3 21v-3a6 6 0 0 1 12 0v3M17 5a3 3 0 0 1 0 6M21 21v-3a6 6 0 0 0-3-5" />
    </>
  ),
  archive: (
    <>
      <rect x="3" y="3" width="18" height="5" rx="1" />
      <path d="M5 8v13h14V8M10 12h4" />
    </>
  ),
  terminal: (
    <>
      <rect x="2" y="4" width="20" height="16" rx="2" />
      <path d="m6 9 3 3-3 3M12 15h5" />
    </>
  ),
  bnl: (
    <>
      <rect x="4" y="7" width="16" height="14" rx="3" />
      <path d="M12 3v4M8 12h.01M16 12h.01M9 17h6M1 12v4M23 12v4" />
    </>
  ),
  journal: (
    <>
      <path d="M5 3h13a2 2 0 0 1 2 2v16H7a3 3 0 0 1-3-3V5a2 2 0 0 1 2-2M4 17h16M9 7h7M9 11h5" />
    </>
  ),
  merch: (
    <>
      <path d="m8 3-6 4 3 5 3-2v11h8V10l3 2 3-5-6-4a4 4 0 0 1-8 0Z" />
    </>
  ),
  arrow: <path d="M4 12h16m-6-6 6 6-6 6" />,
  chevron: <path d="m6 9 6 6 6-6" />,
  send: (
    <>
      <path d="m22 2-7 20-4-9-9-4 20-7ZM11 13 22 2" />
    </>
  ),
  check: <path d="m4 12 5 5L20 6" />,
  play: <path d="m8 4 13 8-13 8V4Z" />,
  globe: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18M12 3c-5 5-5 13 0 18 5-5 5-13 0-18Z" />
    </>
  ),
  trophy: (
    <>
      <path d="M8 3h8v6a4 4 0 0 1-8 0V3ZM8 5H3v2a5 5 0 0 0 5 5M16 5h5v2a5 5 0 0 1-5 5M12 13v5M7 21h10M9 18h6v3" />
    </>
  ),
  mail: (
    <>
      <rect x="2" y="5" width="20" height="14" rx="2" />
      <path d="m3 6 9 7 9-7" />
    </>
  ),
  book: (
    <>
      <path d="M12 5v16M12 5C8 2 4 3 2 4v15c4-1 7-1 10 2 3-3 6-3 10-2V4c-2-1-6-2-10 1Z" />
    </>
  ),
  spark: <path d="m12 2 3 7 7 3-7 3-3 7-3-7-7-3 7-3 3-7Z" />,
} satisfies Record<string, ReactNode>;

export type PublicIconName = keyof typeof drawings;
/** Decorative companion to visible text; never the sole label for an action. */
export function PublicIcon({
  name,
  className = "",
}: {
  name: PublicIconName;
  className?: string;
}) {
  return (
    <svg
      className={className}
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {drawings[name]}
    </svg>
  );
}

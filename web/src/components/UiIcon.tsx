const paths = {
  camera: "M3 6h4l2-3h6l2 3h4v15H3z M16 13a4 4 0 1 1-8 0 4 4 0 0 1 8 0z",
  image: "M3 3h18v18H3z M3 16l5-5 5 5 3-3 5 5 M16 8h.01",
  proposal: "M12 3v3 M5 6h14v13H5z M2 10v5 M22 10v5 M9 11h.01 M15 11h.01 M9 15h6",
  source: "M6 3h8l4 4v14H6z M14 3v5h4 M9 12h6 M9 16h6",
  approved: "m5 12 4 4L19 6",
  manual: "m15 5 4 4 M4 20l4-1L20 7a2.8 2.8 0 0 0-4-4L4 15z",
  close: "m6 6 12 12 M18 6 6 18",
  unchecked: "M4 4h16v16H4z",
  checked: "M4 4h16v16H4z M7.5 12l3 3 6-6",
};

export function UiIcon({ name, className = "size-4 shrink-0" }: { name: keyof typeof paths; className?: string }) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d={paths[name]} />
    </svg>
  );
}

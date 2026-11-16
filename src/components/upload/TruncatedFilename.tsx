"use client";

import React from "react";

interface TruncatedFilenameProps {
  name: string;
  className?: string;
}

/**
 * Preserves the full filename in the DOM for assistive tech & Ctrl+F while
 * truncating only the stem so the file extension stays visible in narrow flex items.
 */
export function TruncatedFilename({
  name,
  className = "",
}: TruncatedFilenameProps) {
  const dotIdx = name.lastIndexOf(".");
  const hasExtension = dotIdx > 0 && dotIdx < name.length - 1;
  const stem = hasExtension ? name.slice(0, dotIdx) : name;
  const ext = hasExtension ? name.slice(dotIdx) : "";

  return (
    <span
      className={`inline-flex min-w-0 max-w-full items-baseline whitespace-nowrap ${className}`}
    >
      <span className="truncate">{stem}</span>
      {ext ? <span className="shrink-0">{ext}</span> : null}
    </span>
  );
}

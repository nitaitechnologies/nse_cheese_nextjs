"use client";

import { useState } from "react";

export default function CopySymbol({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);

  function copyWithSelection(): boolean {
    const area = document.createElement("textarea");
    area.value = value;
    area.style.position = "fixed";
    area.style.top = "0";
    area.style.left = "-9999px";
    document.body.appendChild(area);
    area.focus();
    area.select();
    area.setSelectionRange(0, value.length);
    const ok = document.execCommand("copy");
    area.remove();
    return ok;
  }

  function markCopied() {
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1200);
  }

  function copy() {
    if (copyWithSelection()) {
      markCopied();
      return;
    }
    void navigator.clipboard.writeText(value).then(markCopied).catch(() => undefined);
  }

  return (
    <button
      type="button"
      className="min-h-8 shrink-0 rounded-lg border border-line px-2 text-xs text-muted"
      aria-label={copied ? `Copied ${value}` : `Copy ${value}`}
      onClick={() => void copy()}
    >
      {copied ? "Copied" : "Copy"}
    </button>
  );
}

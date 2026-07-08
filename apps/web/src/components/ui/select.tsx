import * as React from "react";
import { cn } from "../../lib/utils.js";

// A styled native <select> — a custom chevron replaces the OS arrow so it
// matches the input styling across platforms.
function Select({ className, ref, ...props }: React.SelectHTMLAttributes<HTMLSelectElement> & { ref?: React.Ref<HTMLSelectElement> }) {
  return (
    <select
      ref={ref}
      className={cn(
        "flex h-9 w-full appearance-none rounded-md border border-input bg-background pl-3 pr-8 py-1 text-sm text-foreground shadow-xs transition-[color,border-color,box-shadow] duration-[var(--duration-fast)] ease-[var(--ease-out)]",
        "bg-[position:right_0.5rem_center] bg-no-repeat bg-[length:1rem]",
        "[background-image:url('data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 24 24%22 fill=%22none%22 stroke=%22gray%22 stroke-width=%222%22 stroke-linecap=%22round%22 stroke-linejoin=%22round%22><polyline points=%226 9 12 15 18 9%22/></svg>')]",
        "hover:border-input/70",
        "focus-visible:outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40",
        "disabled:cursor-not-allowed disabled:opacity-50",
        className
      )}
      {...props}
    />
  );
}

export { Select };

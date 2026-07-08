import * as React from "react";
import { cn } from "../../lib/utils.js";

// Native checkbox styled as a pill toggle. The moving thumb is a radial-gradient
// background on the input itself (no extra DOM), shifted on :checked. Track
// color switches to the accent when on.
function Switch({ className, ref, ...props }: React.InputHTMLAttributes<HTMLInputElement> & { ref?: React.Ref<HTMLInputElement> }) {
  return (
    <input
      type="checkbox"
      role="switch"
      ref={ref}
      className={cn(
        "peer relative inline-flex h-5 w-9 shrink-0 cursor-pointer appearance-none items-center rounded-full border border-transparent bg-input transition-colors duration-[var(--duration-fast)] ease-[var(--ease-out)]",
        "bg-[radial-gradient(circle_at_0.625rem_center,white_0.5rem,transparent_0.5rem)] bg-[length:100%_100%] bg-no-repeat",
        "checked:bg-primary checked:bg-[radial-gradient(circle_at_1.625rem_center,white_0.5rem,transparent_0.5rem)]",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        "disabled:cursor-not-allowed disabled:opacity-50",
        className
      )}
      {...props}
    />
  );
}

export { Switch };

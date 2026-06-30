import * as React from "react";
import { cn } from "../../lib/utils.js";

function Select({ className, ref, ...props }: React.SelectHTMLAttributes<HTMLSelectElement> & { ref?: React.Ref<HTMLSelectElement> }) {
  return (
    <select
      ref={ref}
      className={cn(
        "flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-hidden focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
        className
      )}
      {...props}
    />
  );
}

export { Select };

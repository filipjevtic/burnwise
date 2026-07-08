import * as React from "react";
import { cn } from "../../lib/utils.js";

// Dense, technical data table: uppercase eyebrow headers, tabular figures so
// columns of numbers align, hairline row separators, quiet hover.
function Table({ className, ref, ...props }: React.HTMLAttributes<HTMLTableElement> & { ref?: React.Ref<HTMLTableElement> }) {
  return (
    <div className="relative w-full overflow-x-auto">
      <table
        ref={ref}
        className={cn("w-full caption-bottom border-collapse text-sm tabular-nums", className)}
        {...props}
      />
    </div>
  );
}

function TableHeader({ className, ref, ...props }: React.HTMLAttributes<HTMLTableSectionElement> & { ref?: React.Ref<HTMLTableSectionElement> }) {
  return <thead ref={ref} className={cn("[&_tr]:border-b [&_tr]:border-border", className)} {...props} />;
}

function TableBody({ className, ref, ...props }: React.HTMLAttributes<HTMLTableSectionElement> & { ref?: React.Ref<HTMLTableSectionElement> }) {
  return <tbody ref={ref} className={cn("[&_tr:last-child]:border-0", className)} {...props} />;
}

function TableRow({ className, ref, ...props }: React.HTMLAttributes<HTMLTableRowElement> & { ref?: React.Ref<HTMLTableRowElement> }) {
  return (
    <tr
      ref={ref}
      className={cn(
        "border-b border-border/70 transition-colors duration-[var(--duration-fast)] hover:bg-accent/50 data-[state=selected]:bg-accent",
        className
      )}
      {...props}
    />
  );
}

function TableHead({ className, ref, ...props }: React.ThHTMLAttributes<HTMLTableCellElement> & { ref?: React.Ref<HTMLTableCellElement> }) {
  return (
    <th
      ref={ref}
      className={cn(
        "h-9 px-3 text-left align-middle text-[0.6875rem] font-medium uppercase tracking-wider text-muted-foreground has-[[role=checkbox]]:pr-0",
        className
      )}
      {...props}
    />
  );
}

function TableCell({ className, ref, ...props }: React.TdHTMLAttributes<HTMLTableCellElement> & { ref?: React.Ref<HTMLTableCellElement> }) {
  return <td ref={ref} className={cn("px-3 py-2.5 align-middle has-[[role=checkbox]]:pr-0", className)} {...props} />;
}

export { Table, TableHeader, TableBody, TableRow, TableHead, TableCell };

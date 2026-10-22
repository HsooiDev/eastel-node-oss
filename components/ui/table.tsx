interface TableProps {
  children: React.ReactNode;
  className?: string;
}

export function Table({ children, className = "" }: TableProps) {
  return (
    <div className="admin-ui-table-wrap w-full overflow-x-auto rounded-lg border border-border">
      <table className={`w-full text-sm ${className}`}>{children}</table>
    </div>
  );
}

interface TableHeadProps {
  children: React.ReactNode;
  className?: string;
}

export function TableHead({ children, className = "" }: TableHeadProps) {
  return (
    <thead className={`border-b border-border bg-surface-alt ${className}`}>
      {children}
    </thead>
  );
}

interface TableBodyProps {
  children: React.ReactNode;
  className?: string;
}

export function TableBody({ children, className = "" }: TableBodyProps) {
  return <tbody className={className}>{children}</tbody>;
}

interface TableRowProps {
  children: React.ReactNode;
  className?: string;
}

export function TableRow({ children, className = "" }: TableRowProps) {
  return (
    <tr
      className={`border-b border-border last:border-0 hover:bg-surface-alt/50 transition-colors ${className}`}
    >
      {children}
    </tr>
  );
}

interface TableCellProps {
  colSpan?: number;
  children: React.ReactNode;
  className?: string;
  align?: "left" | "center" | "right";
}

export function TableCell({
  colSpan,
  children,
  className = "",
  align = "left",
}: TableCellProps) {
  return (
    <td colSpan={colSpan} className={`px-4 py-3 text-${align} text-foreground ${className}`}>
      {children}
    </td>
  );
}

interface TableHeaderCellProps {
  children: React.ReactNode;
  className?: string;
  align?: "left" | "center" | "right";
}

export function TableHeaderCell({
  children,
  className = "",
  align = "left",
}: TableHeaderCellProps) {
  return (
    <th
      className={`px-4 py-3 text-${align} text-xs font-medium uppercase tracking-wider text-foreground-muted ${className}`}
    >
      {children}
    </th>
  );
}

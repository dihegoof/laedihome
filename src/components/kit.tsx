import { cva, type VariantProps } from "class-variance-authority";
import { X } from "lucide-react";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/utils";

export const btn = cva(
  "inline-flex items-center justify-center gap-2 rounded-xl text-sm font-semibold transition-all active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none whitespace-nowrap",
  {
    variants: {
      variant: {
        primary: "bg-primary text-primary-foreground shadow-soft hover:brightness-110",
        soft: "bg-primary-soft text-primary hover:brightness-97",
        outline: "border border-border bg-card text-foreground hover:bg-secondary",
        ghost: "text-muted-foreground hover:bg-secondary hover:text-foreground",
        accent: "bg-accent text-accent-foreground shadow-soft hover:brightness-105",
        danger: "bg-destructive text-destructive-foreground hover:brightness-110",
        dangerGhost: "border border-destructive/30 text-destructive hover:bg-destructive/10",
      },
      size: {
        sm: "h-9 px-3 text-[13px]",
        md: "h-11 px-4",
        lg: "h-12 px-5 text-base",
        icon: "h-9 w-9",
      },
    },
    defaultVariants: { variant: "primary", size: "md" },
  },
);

export function Button({
  className,
  variant,
  size,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & VariantProps<typeof btn>) {
  return <button className={cn(btn({ variant, size }), className)} {...props} />;
}

export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-foreground/40 p-0 backdrop-blur-[2px] sm:items-center sm:p-4"
      onClick={onClose}
    >
      <div
        className="max-h-[92dvh] w-full max-w-md overflow-y-auto rounded-t-3xl border border-border bg-card p-5 shadow-lift sm:rounded-3xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <h2 className="text-xl">{title}</h2>
          <button
            onClick={onClose}
            aria-label="Fechar"
            className="rounded-full p-1.5 text-muted-foreground transition-colors hover:bg-secondary"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="space-y-3">{children}</div>
        {footer && <div className="mt-5 flex flex-wrap gap-2">{footer}</div>}
      </div>
    </div>
  );
}

export function Field({
  label,
  children,
}: {
  label?: string;
  children: ReactNode;
}) {
  return (
    <label className="block space-y-1.5">
      {label && (
        <span className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
          {label}
        </span>
      )}
      {children}
    </label>
  );
}

export function EmptyState({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-2xl border border-dashed border-border bg-card/60 px-4 py-10 text-center text-sm text-muted-foreground">
      {children}
    </div>
  );
}

export function Pill({
  children,
  tone = "muted",
}: {
  children: ReactNode;
  tone?: "muted" | "primary" | "accent" | "danger" | "success";
}) {
  const tones = {
    muted: "bg-secondary text-secondary-foreground",
    primary: "bg-primary-soft text-primary",
    accent: "bg-accent/15 text-accent",
    danger: "bg-destructive/12 text-destructive",
    success: "bg-success/15 text-success",
  } as const;
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold",
        tones[tone],
      )}
    >
      {children}
    </span>
  );
}

export function Spinner({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "inline-block h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent",
        className,
      )}
    />
  );
}

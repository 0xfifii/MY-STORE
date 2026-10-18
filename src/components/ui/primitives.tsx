import clsx from "clsx";
import Link from "next/link";
import { forwardRef } from "react";
import { Loader2 } from "lucide-react";
import type { StockStatus } from "@/lib/format";

type Variant = "primary" | "secondary" | "ghost" | "danger" | "outline-danger";
type Size = "sm" | "md" | "lg";

const variantClass: Record<Variant, string> = {
  primary: "bg-burgundy text-white hover:bg-burgundy-hover disabled:bg-burgundy/50",
  secondary: "bg-white text-ink border border-line hover:border-burgundy/40 hover:bg-rose disabled:opacity-60",
  ghost: "text-burgundy hover:bg-rose disabled:opacity-50",
  danger: "bg-bad text-white hover:bg-bad/90 disabled:opacity-60",
  "outline-danger": "border border-bad/40 text-bad bg-white hover:bg-bad-bg disabled:opacity-60",
};
const sizeClass: Record<Size, string> = {
  sm: "h-8 px-3 text-sm gap-1.5",
  md: "h-10 px-4 text-sm gap-2",
  lg: "h-12 px-5 text-base gap-2",
};

export function buttonClass(variant: Variant = "primary", size: Size = "md", extra?: string) {
  return clsx(
    "inline-flex items-center justify-center rounded-md font-semibold whitespace-nowrap transition-colors disabled:cursor-not-allowed",
    variantClass[variant],
    sizeClass[size],
    extra,
  );
}

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: Size; loading?: boolean };

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "primary", size = "md", loading, className, children, disabled, ...rest },
  ref,
) {
  return (
    <button ref={ref} className={buttonClass(variant, size, className)} disabled={disabled || loading} {...rest}>
      {loading && <Loader2 className="size-4 animate-spin" aria-hidden />}
      {children}
    </button>
  );
});

export function LinkButton({
  href, variant = "primary", size = "md", className, children, ...rest
}: { href: string; variant?: Variant; size?: Size; className?: string; children: React.ReactNode } & Omit<React.AnchorHTMLAttributes<HTMLAnchorElement>, "href">) {
  return (
    <Link href={href} className={buttonClass(variant, size, className)} {...rest}>
      {children}
    </Link>
  );
}

export function Field({
  label, htmlFor, hint, error, required, children, className,
}: {
  label: string; htmlFor?: string; hint?: React.ReactNode; error?: string | null; required?: boolean;
  children: React.ReactNode; className?: string;
}) {
  return (
    <div className={clsx("flex flex-col gap-1.5", className)}>
      <label htmlFor={htmlFor} className="text-sm font-medium text-ink">
        {label}
        {required ? <span className="text-burgundy"> *</span> : <span className="font-normal text-muted"> (optional)</span>}
      </label>
      {children}
      {error ? <p className="text-sm text-bad">{error}</p> : hint ? <p className="text-xs text-muted">{hint}</p> : null}
    </div>
  );
}

export const inputClass =
  "h-11 w-full rounded-md border border-line bg-white px-3 text-[15px] text-ink placeholder:text-muted/70 focus:border-burgundy focus:outline-none focus:ring-2 focus:ring-burgundy/15 disabled:bg-canvas disabled:text-muted";

export const Input = forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(function Input(
  { className, ...rest },
  ref,
) {
  return <input ref={ref} className={clsx(inputClass, className)} {...rest} />;
});

export const Select = forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(function Select(
  { className, children, ...rest },
  ref,
) {
  return (
    <select ref={ref} className={clsx(inputClass, "pr-8", className)} {...rest}>
      {children}
    </select>
  );
});

export const Textarea = forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(function Textarea(
  { className, ...rest },
  ref,
) {
  return <textarea ref={ref} rows={3} className={clsx(inputClass, "h-auto py-2", className)} {...rest} />;
});

export function StatusBadge({ status }: { status: StockStatus }) {
  const map = {
    in_stock: { cls: "bg-ok-bg text-ok", label: "In stock" },
    low: { cls: "bg-warn-bg text-warn", label: "Low stock" },
    out: { cls: "bg-bad-bg text-bad", label: "Out of stock" },
  }[status];
  return (
    <span className={clsx("inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap", map.cls)}>
      <span className="size-1.5 rounded-full bg-current" aria-hidden />
      {map.label}
    </span>
  );
}

export function TxnTypeBadge({ type, direction }: { type: string; direction: number }) {
  if (type === "stock_in") return <span className="rounded bg-ok-bg px-2 py-0.5 text-xs font-semibold text-ok">Stock in</span>;
  if (type === "stock_out") return <span className="rounded bg-rose px-2 py-0.5 text-xs font-semibold text-burgundy">Stock out</span>;
  return (
    <span className="rounded bg-warn-bg px-2 py-0.5 text-xs font-semibold text-warn">
      Correction {direction > 0 ? "(+)" : "(−)"}
    </span>
  );
}

export function PageHeader({
  title, description, actions, back,
}: { title: string; description?: React.ReactNode; actions?: React.ReactNode; back?: { href: string; label: string } }) {
  return (
    <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        {back && (
          <Link href={back.href} className="mb-2 inline-block text-sm font-medium text-burgundy hover:underline">
            ← {back.label}
          </Link>
        )}
        <h1 className="font-display text-2xl font-bold tracking-tight text-ink sm:text-[28px]">{title}</h1>
        {description && <p className="mt-1 text-sm text-muted">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function Panel({ title, actions, children, className, bodyClass }: {
  title?: React.ReactNode; actions?: React.ReactNode; children: React.ReactNode; className?: string; bodyClass?: string;
}) {
  return (
    <section className={clsx("rounded-lg border border-line bg-white", className)}>
      {(title || actions) && (
        <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3 sm:px-5">
          {title && <h2 className="text-[15px] font-semibold text-ink">{title}</h2>}
          {actions}
        </div>
      )}
      <div className={bodyClass ?? "p-4 sm:p-5"}>{children}</div>
    </section>
  );
}

export function EmptyState({ icon, title, body, action }: { icon?: React.ReactNode; title: string; body?: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center px-6 py-12 text-center">
      {icon && <div className="mb-3 flex size-12 items-center justify-center rounded-full bg-rose text-burgundy">{icon}</div>}
      <p className="font-semibold text-ink">{title}</p>
      {body && <p className="mt-1 max-w-sm text-sm text-muted">{body}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={clsx("animate-spin text-burgundy", className ?? "size-5")} aria-label="Loading" />;
}

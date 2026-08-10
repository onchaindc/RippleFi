type BalanceCardProps = {
  title: string;
  value: string;
  suffix: string;
  description: string;
  loading?: boolean;
};

export function BalanceCard({
  title,
  value,
  suffix,
  description,
  loading = false,
}: BalanceCardProps) {
  return (
    <article className="glass-panel rounded-xl border p-4 transition duration-200 hover:border-white/10 sm:p-5">
      <div>
        <p className="text-xs font-medium text-[#89939e]">{title}</p>
        <div className="mt-3 flex min-h-9 items-baseline gap-2">
          <span className="font-mono text-2xl font-semibold tracking-[-0.025em] sm:text-3xl">
            {loading ? "..." : value}
          </span>
          <span className="text-xs font-medium text-[#7d8790]">{suffix}</span>
        </div>
      </div>
      <p className="mt-3 text-[11px] text-[#68737d]">{description}</p>
    </article>
  );
}

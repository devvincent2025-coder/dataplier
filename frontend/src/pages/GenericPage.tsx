type GenericPageProps = {
  title: string;
  description: string;
  items: string[];
  badge?: string;
};

export function GenericPage({ title, description, items, badge }: GenericPageProps) {
  return (
    <div className="space-y-6">
      <section className="rounded border border-slate-200 bg-white p-8 shadow-panel">
        {badge ? <p className="text-xs uppercase tracking-[0.24em] text-orange-600">{badge}</p> : null}
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-950">{title}</h1>
        <p className="mt-3 max-w-3xl text-slate-600">{description}</p>
      </section>

      <section className="grid gap-4 md:grid-cols-2">
        {items.map((item) => (
          <div key={item} className="rounded border border-slate-200 bg-white p-5 shadow-panel">
            <p className="text-sm font-medium text-slate-900">{item}</p>
          </div>
        ))}
      </section>
    </div>
  );
}

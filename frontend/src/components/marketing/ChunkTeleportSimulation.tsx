/**
 * Parallel chunk workers + schema morph — visual story for “smart chunk teleportation”.
 */
export function ChunkTeleportSimulation() {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-900 p-6 text-white shadow-xl sm:p-8">
      <div className="mb-6 flex items-center justify-between gap-4">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.25em] text-orange-300/90">Simulation</p>
          <h3 className="mt-1 text-lg font-semibold tracking-tight">Chunk teleportation</h3>
          <p className="mt-1 max-w-md text-sm text-slate-400">One dataset splits into optimized workers, then reconciles on the target.</p>
        </div>
        <div className="hidden rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-right font-mono text-[10px] text-slate-400 sm:block">
          <div>throughput ↑ 4.2×</div>
          <div className="text-ember">latency ↓ 38%</div>
        </div>
      </div>
      <div className="relative grid gap-4 sm:grid-cols-[1fr_auto_1fr] sm:items-center">
        <div className="rounded-xl border border-white/10 bg-white/5 p-4">
          <p className="text-xs font-medium text-slate-300">Source object</p>
          <p className="mt-2 font-mono text-sm text-white">orders_2026.parquet</p>
          <p className="mt-1 text-[11px] text-slate-500">2.4 TB · row groups analyzed</p>
          <div className="mt-4 h-2 overflow-hidden rounded-full bg-white/10">
            <div className="sim-chunk-master h-full w-full rounded-full bg-gradient-to-r from-ember to-amber-400" />
          </div>
        </div>
        <div className="flex justify-center gap-2 sm:flex-col sm:py-4">
          {[0, 1, 2, 3].map((i) => (
            <div
              key={i}
              className="sim-worker flex h-10 w-10 items-center justify-center rounded-lg border border-orange-400/30 bg-orange-500/20 font-mono text-xs font-bold text-orange-200"
              style={{ animationDelay: `${i * 0.15}s` }}
            >
              W{i + 1}
            </div>
          ))}
        </div>
        <div className="rounded-xl border border-ember/30 bg-gradient-to-br from-orange-950/80 to-slate-900 p-4">
          <p className="text-xs font-medium text-orange-200/90">Target schema</p>
          <div className="mt-3 space-y-2 font-mono text-[11px]">
            <div className="flex justify-between border-b border-white/10 py-1 text-slate-400">
              <span>order_id</span>
              <span className="text-ember">UUID → VARCHAR</span>
            </div>
            <div className="flex justify-between border-b border-white/10 py-1 text-slate-400">
              <span>ts</span>
              <span className="text-ember">TIMESTAMP_TZ</span>
            </div>
            <div className="flex justify-between py-1 text-slate-400">
              <span>amount</span>
              <span className="text-ember">DECIMAL(18,2)</span>
            </div>
          </div>
          <p className="mt-3 text-[10px] uppercase tracking-wider text-slate-500">Universal schema translator</p>
        </div>
      </div>
    </div>
  );
}

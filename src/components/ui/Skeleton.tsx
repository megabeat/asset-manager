'use client';

/**
 * Skeleton loading placeholders.
 * Pulse animation via CSS keyframes in globals.css.
 */

export function SkeletonLine({ width = '100%', height = '1rem', className = '' }: { width?: string; height?: string; className?: string }) {
  return (
    <div
      className={`skeleton-pulse rounded ${className}`}
      style={{ width, height }}
    />
  );
}

export function SkeletonCard({ lines = 2 }: { lines?: number }) {
  return (
    <div className="section-card">
      {Array.from({ length: lines }).map((_, i) => (
        <SkeletonLine key={i} width={i === 0 ? '40%' : '70%'} height={i === 0 ? '0.75rem' : '1.5rem'} className={i > 0 ? 'mt-2' : ''} />
      ))}
    </div>
  );
}

export function SkeletonTable({ rows = 4, cols = 5 }: { rows?: number; cols?: number }) {
  return (
    <div className="section-card">
      <SkeletonLine width="30%" height="1.25rem" className="mb-3" />
      <div className="space-y-2">
        {Array.from({ length: rows }).map((_, r) => (
          <div key={r} className="flex gap-3">
            {Array.from({ length: cols }).map((_, c) => (
              <SkeletonLine key={c} width={`${Math.floor(100 / cols)}%`} height="1rem" />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

export function AssetPageSkeleton() {
  return (
    <div className="py-4">
      {/* Title */}
      <SkeletonLine width="140px" height="2rem" />
      <SkeletonLine width="260px" height="0.85rem" className="mt-2" />

      {/* KPI cards */}
      <div className="form-grid mt-4">
        <SkeletonCard />
        <SkeletonCard />
      </div>

      {/* Collapsed form placeholder */}
      <div className="section-card mt-4">
        <SkeletonLine width="120px" height="1rem" />
      </div>

      {/* Summary table */}
      <SkeletonTable rows={4} cols={4} />

      {/* Treemap placeholder */}
      <div className="section-card mt-4">
        <SkeletonLine width="30%" height="1.25rem" className="mb-3" />
        <SkeletonLine width="100%" height="200px" />
      </div>

      {/* Detail table */}
      <SkeletonTable rows={5} cols={6} />
    </div>
  );
}

export function DashboardSkeleton() {
  return (
    <div className="py-4">
      <SkeletonLine width="140px" height="2rem" />
      <div className="form-grid mt-4">
        <SkeletonCard />
        <SkeletonCard />
        <SkeletonCard />
      </div>
      <SkeletonTable rows={4} cols={3} />
      <div className="section-card mt-4">
        <SkeletonLine width="30%" height="1.25rem" className="mb-3" />
        <SkeletonLine width="100%" height="250px" />
      </div>
    </div>
  );
}

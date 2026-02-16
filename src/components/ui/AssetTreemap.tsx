'use client';

import { useMemo, useState } from 'react';
import { hierarchy, treemap, treemapSquarify } from 'd3-hierarchy';

export type TreemapItem = {
  name: string;
  value: number;
  category?: string;
  fill: string;
};

type LayoutRect = TreemapItem & {
  x0: number; y0: number; x1: number; y1: number;
};

type Props = {
  data: TreemapItem[];
  width?: number;
  height?: number;
};

function formatWon(v: number): string {
  if (v >= 1_0000_0000) {
    const eok = Math.floor(v / 1_0000_0000);
    const man = Math.floor((v % 1_0000_0000) / 1_0000);
    return man > 0 ? `${eok}억 ${man}만원` : `${eok}억원`;
  }
  if (v >= 1_0000) return `${Math.floor(v / 1_0000)}만원`;
  return `${Math.round(v).toLocaleString()}원`;
}

export default function AssetTreemap({ data, width = 800, height = 420 }: Props) {
  const [tooltip, setTooltip] = useState<{ item: TreemapItem; x: number; y: number } | null>(null);

  const rects = useMemo<LayoutRect[]>(() => {
    if (data.length === 0) return [];

    const root = hierarchy<{ name: string; value?: number; children?: TreemapItem[] }>({ name: 'root', children: data.map((d) => ({ ...d })) })
      .sum((d) => d.value ?? 0)
      .sort((a, b) => (b.value ?? 0) - (a.value ?? 0));

    treemap<{ name: string; value?: number; children?: TreemapItem[] }>()
      .size([width, height])
      .padding(3)
      .tile(treemapSquarify.ratio(1.2))(root);

    return (root.leaves() as unknown as Array<{ data: TreemapItem; x0: number; y0: number; x1: number; y1: number }>).map((leaf) => ({
      ...leaf.data,
      x0: leaf.x0,
      y0: leaf.y0,
      x1: leaf.x1,
      y1: leaf.y1,
    }));
  }, [data, width, height]);

  if (rects.length === 0) return null;

  return (
    <div className="relative">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="h-full w-full"
        style={{ maxHeight: height }}
      >
        {rects.map((r, i) => {
          const w = r.x1 - r.x0;
          const h = r.y1 - r.y0;
          const fontSize = Math.min(w / 7, h / 2.5, 14);
          const showLabel = w > 36 && h > 22 && fontSize >= 8;
          const maxChars = Math.max(2, Math.floor(w / (fontSize * 0.58)));

          return (
            <g
              key={`${r.name}-${i}`}
              onMouseEnter={(e) => {
                const svgRect = e.currentTarget.closest('svg')?.getBoundingClientRect();
                if (svgRect) {
                  setTooltip({
                    item: r,
                    x: e.clientX - svgRect.left,
                    y: e.clientY - svgRect.top,
                  });
                }
              }}
              onMouseMove={(e) => {
                const svgRect = e.currentTarget.closest('svg')?.getBoundingClientRect();
                if (svgRect) {
                  setTooltip({
                    item: r,
                    x: e.clientX - svgRect.left,
                    y: e.clientY - svgRect.top,
                  });
                }
              }}
              onMouseLeave={() => setTooltip(null)}
              style={{ cursor: 'default' }}
            >
              <rect
                x={r.x0}
                y={r.y0}
                width={w}
                height={h}
                fill={r.fill}
                rx={4}
                stroke="rgba(255,255,255,0.85)"
                strokeWidth={2}
              />
              {showLabel && (
                <text
                  x={r.x0 + w / 2}
                  y={r.y0 + h / 2}
                  textAnchor="middle"
                  dominantBaseline="central"
                  fill="#fff"
                  fontSize={fontSize}
                  fontWeight={600}
                  style={{ pointerEvents: 'none', userSelect: 'none' }}
                >
                  {r.name.length > maxChars ? r.name.slice(0, maxChars) + '…' : r.name}
                </text>
              )}
            </g>
          );
        })}
      </svg>

      {tooltip && (
        <div
          className="pointer-events-none absolute z-50 rounded-lg border border-[var(--line)] bg-[var(--surface)] px-3 py-2 shadow-md"
          style={{
            left: tooltip.x + 12,
            top: tooltip.y - 10,
            transform: 'translateY(-100%)',
          }}
        >
          <p className="m-0 text-[0.85rem] font-semibold">{tooltip.item.name}</p>
          {tooltip.item.category && (
            <p className="m-0 mt-0.5 text-[0.75rem] text-[var(--muted)]">{tooltip.item.category}</p>
          )}
          <p className="m-0 mt-1 text-[0.85rem]">{formatWon(tooltip.item.value)}</p>
        </div>
      )}
    </div>
  );
}

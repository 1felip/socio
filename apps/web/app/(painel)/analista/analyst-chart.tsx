import type { ChartSpec } from '@socio/agents';
import { formatAxisValue, formatChartLabel, formatChartValue } from '@/lib/chart-format';

const W = 640;
const H = 240;
const PAD = { top: 12, right: 12, bottom: 44, left: 64 };

function Bars({ spec }: { spec: Extract<ChartSpec, { type: 'bar' | 'line' }> }) {
  const values = spec.points.map((p) => p.value);
  const max = Math.max(0, ...values);
  const min = Math.min(0, ...values);
  const span = max - min || 1;
  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;
  const y = (v: number) => PAD.top + innerH - ((v - min) / span) * innerH;
  const step = innerW / Math.max(1, spec.points.length);
  const labelEvery = Math.ceil(spec.points.length / 10);
  const ticks = [min, min + span / 2, max];

  // Posição e chave estável por ponto (rótulos podem repetir).
  const pts = spec.points.map((p, i) => ({
    ...p,
    id: `${i}:${p.label}`,
    i,
    cx: PAD.left + step * (i + 0.5),
  }));

  const line = spec.points
    .map((p, i) => `${i === 0 ? 'M' : 'L'}${PAD.left + step * (i + 0.5)},${y(p.value)}`)
    .join(' ');

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="h-auto w-full text-foreground"
      role="img"
      aria-label={spec.title}
    >
      {ticks.map((t) => (
        <g key={t}>
          <line
            x1={PAD.left}
            x2={W - PAD.right}
            y1={y(t)}
            y2={y(t)}
            className="stroke-current opacity-10"
          />
          <text
            x={PAD.left - 6}
            y={y(t) + 4}
            textAnchor="end"
            className="fill-current text-[11px] opacity-60"
          >
            {formatAxisValue(t, spec.unit)}
          </text>
        </g>
      ))}
      {spec.type === 'bar' ? (
        pts.map((p) => {
          const top = Math.min(y(p.value), y(0));
          return (
            <rect
              key={p.id}
              x={p.cx - step * 0.35}
              y={top}
              width={step * 0.7}
              height={Math.max(1, Math.abs(y(p.value) - y(0)))}
              rx={2}
              className="fill-primary"
            >
              <title>{`${formatChartLabel(p.label)}: ${formatChartValue(p.value, spec.unit)}`}</title>
            </rect>
          );
        })
      ) : (
        <path d={line} fill="none" strokeWidth={2} className="stroke-primary" />
      )}
      {pts.map((p) =>
        p.i % labelEvery === 0 ? (
          <text
            key={`l-${p.id}`}
            x={p.cx}
            y={H - PAD.bottom + 16}
            textAnchor="middle"
            className="fill-current text-[11px] opacity-70"
          >
            {formatChartLabel(p.label).slice(0, 14)}
          </text>
        ) : null,
      )}
    </svg>
  );
}

export function AnalystChart({ spec }: { spec: ChartSpec }) {
  if (spec.type === 'number') {
    return (
      <div className="space-y-1">
        <p className="text-sm text-muted-foreground">{spec.title}</p>
        <p className="text-3xl font-semibold">{formatChartValue(spec.value, spec.unit)}</p>
      </div>
    );
  }

  if (spec.type === 'table') {
    return (
      <div className="space-y-2">
        <p className="text-sm text-muted-foreground">{spec.title}</p>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr>
                {spec.columns.map((c) => (
                  <th key={c} className="border-b border-input px-2 py-1 font-medium">
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {spec.rows.map((r, i) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: linhas sem id, ordem fixa.
                <tr key={i}>
                  {r.map((v, j) => (
                    // biome-ignore lint/suspicious/noArrayIndexKey: colunas na ordem do SQL.
                    <td key={j} className="border-b border-input px-2 py-1">
                      {v === null ? '—' : String(v)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <p className="text-sm text-muted-foreground">{spec.title}</p>
      <Bars spec={spec} />
    </div>
  );
}

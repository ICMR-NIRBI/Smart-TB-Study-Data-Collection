import React from 'react';
import { CartesianGrid, Legend, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { TIMEPOINTS } from '../../../data/timepoints';
import { toNum } from '../../../utils/clinical';
import type { ConcEntry } from '../../../types/crf';

interface ConcentrationChartProps {
  drugName: string;
  entries: Record<string, ConcEntry>;
  mic: number | null;
}

const PLASMA = '#0f6f7b';
const SALIVA = '#a86400';
const MIC = '#c42b2b';

export function ConcentrationChart({ drugName, entries, mic }: ConcentrationChartProps) {
  const data = TIMEPOINTS.map((tp) => ({
    t: tp.hours,
    plasma: tp.salivaOnly ? null : toNum(entries[tp.key]?.plasma),
    saliva: toNum(entries[tp.key]?.saliva),
  }));
  const hasData = data.some((d) => d.plasma !== null || d.saliva !== null);

  return (
    <figure className="rounded-2xl border border-line bg-white p-3">
      <figcaption className="mb-1 px-1 text-sm font-medium text-ink-soft">{drugName} concentration–time (μg/mL)</figcaption>
      {hasData ? (
        <div className="h-56 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 8, right: 12, bottom: 4, left: -12 }}>
              <CartesianGrid stroke="#e1e6e9" strokeDasharray="3 3" />
              <XAxis
                dataKey="t"
                type="number"
                domain={[0, 24]}
                ticks={[0, 2, 4, 6, 8, 12, 24]}
                tick={{ fontSize: 12, fill: '#5f6e77' }}
                tickFormatter={(v: number) => `${v}h`}
              />
              <YAxis tick={{ fontSize: 12, fill: '#5f6e77' }} width={44} />
              <Tooltip
                formatter={(value: number, name: string) => [`${value} μg/mL`, name === 'plasma' ? 'Plasma' : 'Saliva']}
                labelFormatter={(l: number) => `${l} h`}
                contentStyle={{ borderRadius: 12, borderColor: '#e1e6e9', fontSize: 13 }}
              />
              <Legend
                iconType="plainline"
                wrapperStyle={{ fontSize: 12 }}
                formatter={(v: string) => (v === 'plasma' ? 'Plasma' : 'Saliva')}
              />
              {mic !== null && (
                <ReferenceLine
                  y={mic}
                  stroke={MIC}
                  strokeDasharray="6 4"
                  label={{ value: `MIC ${mic}`, position: 'insideTopRight', fill: MIC, fontSize: 11 }}
                />
              )}
              <Line type="linear" dataKey="plasma" stroke={PLASMA} strokeWidth={2.2} dot={{ r: 3 }} connectNulls isAnimationActive={false} />
              <Line type="linear" dataKey="saliva" stroke={SALIVA} strokeWidth={2} strokeDasharray="4 3" dot={{ r: 3 }} connectNulls isAnimationActive={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <div className="flex h-40 items-center justify-center rounded-xl bg-canvas text-sm text-ink-muted">
          Enter concentrations below to plot the curve
        </div>
      )}
    </figure>
  );
}

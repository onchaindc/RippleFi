"use client";

import { useEffect, useRef, useState } from "react";
import type { FtsoXrpPrice } from "@/lib/ftso";

type Point = { price: number; t: number };

const MAX_POINTS = 180; // ~24 minutes at the 8s FTSO poll cadence
const WIDTH = 600;
const HEIGHT = 176;
const PAD_X = 8;
const PAD_TOP = 22;
const PAD_BOTTOM = 22;

function fmtTime(t: number) {
  return new Date(t).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function fmtPrice(value: number) {
  return value >= 1000
    ? value.toFixed(0)
    : value >= 100
      ? value.toFixed(1)
      : value.toFixed(4);
}

export function FtsoPriceChart({
  price,
  thresholdUsd,
}: {
  price: FtsoXrpPrice | null;
  thresholdUsd: number | null;
}) {
  const [points, setPoints] = useState<Point[]>([]);
  const lastKeyRef = useRef<string | null>(null);

  // Roll the history forward from live FTSO polls. Resets when the network
  // changes so the chart never mixes prices across chains.
  useEffect(() => {
    if (!price) {
      return;
    }
    // Deferred so the mutation never runs synchronously inside the effect.
    queueMicrotask(() => {
      const key = `${price.chainId}:${price.timestamp}`;
      if (
        lastKeyRef.current !== null &&
        lastKeyRef.current.split(":")[0] !== String(price.chainId)
      ) {
        setPoints([]);
      }
      lastKeyRef.current = key;
      const value = Number(price.priceUsd);
      if (!Number.isFinite(value) || value <= 0) {
        return;
      }
      setPoints((current) => {
        const last = current[current.length - 1];
        if (
          last &&
          Math.abs(last.price - value) < 1e-12 &&
          last.t === price.timestamp
        ) {
          return current;
        }
        const next = [...current, { price: value, t: price.timestamp }];
        return next.length > MAX_POINTS
          ? next.slice(next.length - MAX_POINTS)
          : next;
      });
    });
  }, [price]);

  if (points.length < 2) {
    return (
      <div className="flex h-28 items-center justify-center rounded-lg border border-white/[0.06] bg-white/[0.015] text-[11px] text-[#68737d]">
        Chart builds from the live FTSO price — a couple of minutes of data
        and the trend shows here.
      </div>
    );
  }

  const prices = points.map((point) => point.price);
  const rawMin = Math.min(...prices);
  const rawMax = Math.max(...prices);
  const min = thresholdUsd !== null && thresholdUsd < rawMin ? thresholdUsd : rawMin;
  const max = thresholdUsd !== null && thresholdUsd > rawMax ? thresholdUsd : rawMax;
  const span = max - min || 1;
  const x = (index: number) =>
    PAD_X + (index / (points.length - 1)) * (WIDTH - PAD_X * 2);
  const y = (value: number) =>
    PAD_TOP + (1 - (value - min) / span) * (HEIGHT - PAD_TOP - PAD_BOTTOM);

  const line = points
    .map((point, index) => `${x(index).toFixed(1)},${y(point.price).toFixed(1)}`)
    .join(" ");
  const area = `${PAD_X},${HEIGHT - PAD_BOTTOM} ${line} ${x(points.length - 1).toFixed(1)},${HEIGHT - PAD_BOTTOM}`;
  const last = points[points.length - 1];
  const first = points[0];
  const thresholdY =
    thresholdUsd !== null ? y(thresholdUsd) : null;

  return (
    <div className="rounded-lg border border-white/[0.06] bg-white/[0.015] px-2 pb-1 pt-2">
      <div className="flex items-center justify-between px-1 text-[10px] text-[#68737d]">
        <span className="font-semibold uppercase tracking-[0.12em]">
          XRP/USD — live FTSO
        </span>
        <span className="font-mono tabular-nums">
          {fmtTime(first.t)} → {fmtTime(last.t)}
        </span>
      </div>
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        role="img"
        aria-label="FTSO XRP/USD price chart"
        className="mt-1 h-auto w-full"
      >
        <defs>
          <linearGradient id="ripplefi-chart-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#71b9e6" stopOpacity="0.22" />
            <stop offset="100%" stopColor="#71b9e6" stopOpacity="0" />
          </linearGradient>
        </defs>
        {[0.25, 0.5, 0.75].map((fraction) => {
          const yPos = PAD_TOP + fraction * (HEIGHT - PAD_TOP - PAD_BOTTOM);
          return (
            <line
              key={fraction}
              x1={PAD_X}
              x2={WIDTH - PAD_X}
              y1={yPos}
              y2={yPos}
              stroke="rgba(255,255,255,0.05)"
              strokeWidth="1"
            />
          );
        })}
        <polygon points={area} fill="url(#ripplefi-chart-fill)" />
        <polyline
          points={line}
          fill="none"
          stroke="#71b9e6"
          strokeWidth="2"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        {thresholdY !== null ? (
          <>
            <line
              x1={PAD_X}
              x2={WIDTH - PAD_X}
              y1={thresholdY}
              y2={thresholdY}
              stroke="#f2b84b"
              strokeWidth="1.5"
              strokeDasharray="4 4"
            />
            <text
              x={WIDTH - PAD_X}
              y={thresholdY - 5}
              textAnchor="end"
              fill="#f4cd7d"
              fontSize="11"
              fontFamily="ui-monospace, monospace"
            >
              trigger {fmtPrice(thresholdUsd as number)}
            </text>
          </>
        ) : null}
        <circle
          cx={x(points.length - 1)}
          cy={y(last.price)}
          r="3"
          fill="#4de2ad"
        />
        <text
          x={x(points.length - 1)}
          y={y(last.price) - 8}
          textAnchor={x(points.length - 1) > WIDTH - 90 ? "end" : "start"}
          fill="#d7dcdf"
          fontSize="11"
          fontFamily="ui-monospace, monospace"
        >
          ${fmtPrice(last.price)}
        </text>
        <text
          x={PAD_X}
          y={HEIGHT - 6}
          fill="#5f6972"
          fontSize="10"
          fontFamily="ui-monospace, monospace"
        >
          ${fmtPrice(min)}
        </text>
        <text
          x={WIDTH - PAD_X}
          y={HEIGHT - 6}
          textAnchor="end"
          fill="#5f6972"
          fontSize="10"
          fontFamily="ui-monospace, monospace"
        >
          ${fmtPrice(max)}
        </text>
      </svg>
    </div>
  );
}

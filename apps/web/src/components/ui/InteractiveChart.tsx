'use client';

import { useEffect, useRef } from 'react';
import { createChart, ColorType, IChartApi, ISeriesApi, Time, AreaSeries } from 'lightweight-charts';

type Timeframe = '1H' | '24H' | '7D' | '30D' | 'ALL';

interface InteractiveChartProps {
  lineData: { time: number; value: number }[];
  timeframe: Timeframe;
  isPositive?: boolean;
}

export function InteractiveChart({
  lineData,
  timeframe,
  isPositive = true
}: InteractiveChartProps) {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const lineSeriesRef = useRef<ISeriesApi<"Area"> | null>(null);

  // Initialize chart exactly once
  useEffect(() => {
    if (!chartContainerRef.current) return;

    const chart = createChart(chartContainerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: 'transparent' },
        textColor: '#9A9A9A',
        attributionLogo: false,
      },
      localization: {
        timeFormatter: (time: Time) => {
          const date = new Date((time as number) * 1000);
          return date.toLocaleString(undefined, { 
            month: 'short', day: 'numeric', 
            hour: '2-digit', minute: '2-digit' 
          });
        }
      },
      grid: {
        vertLines: { color: '#ffffff05' },
        horzLines: { color: '#ffffff05' },
      },
      crosshair: {
        mode: 1,
        vertLine: {
          color: '#ffffff30',
          width: 1,
          style: 3,
          labelBackgroundColor: '#111111',
        },
        horzLine: {
          color: '#ffffff30',
          width: 1,
          style: 3,
          labelBackgroundColor: '#111111',
        },
      },
      timeScale: {
        borderColor: '#ffffff20',
        timeVisible: true,
        secondsVisible: false,
        rightOffset: 5,
        tickMarkFormatter: (time: Time, tickMarkType: number, locale: string) => {
          const date = new Date((time as number) * 1000);
          switch (tickMarkType) {
            case 0: return date.getFullYear().toString();
            case 1: return date.toLocaleString(locale, { month: 'short', year: 'numeric' });
            case 2: return date.getDate().toString() + ' ' + date.toLocaleString(locale, { month: 'short' });
            case 3: return date.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' });
            case 4: return date.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit', second: '2-digit' });
            default: return date.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' });
          }
        },
      },
      rightPriceScale: {
        borderColor: '#ffffff20',
        autoScale: true,
      },
      autoSize: true,
    });

    chartRef.current = chart;

    return () => {
      chart.remove();
      chartRef.current = null;
      lineSeriesRef.current = null;
    };
  }, []);

  // Sync data
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
      
    if (!lineSeriesRef.current) {
      lineSeriesRef.current = chart.addSeries(AreaSeries, {
        lineColor: isPositive ? '#3ECF8E' : '#f87171',
        topColor: isPositive ? '#3ECF8E40' : '#f8717140',
        bottomColor: isPositive ? '#3ECF8E00' : '#f8717100',
        lineWidth: 2,
        priceFormat: {
          type: 'price',
          precision: 4,
          minMove: 0.0001,
        },
      });
    } else {
      lineSeriesRef.current.applyOptions({
        lineColor: isPositive ? '#3ECF8E' : '#f87171',
        topColor: isPositive ? '#3ECF8E40' : '#f8717140',
        bottomColor: isPositive ? '#3ECF8E00' : '#f8717100',
      });
    }

    // Format and set data
    const formattedLine = lineData.map(d => ({
      time: (Math.floor(d.time / 1000)) as Time,
      value: d.value
    })).sort((a, b) => (a.time as number) - (b.time as number));
    
    // Filter out duplicate timestamps
    const uniqueLine = formattedLine.filter((v, i, a) => i === 0 || v.time !== a[i - 1].time);
    
    lineSeriesRef.current.setData(uniqueLine);
  }, [lineData]);

  const lastAppliedTimeframe = useRef<string | null>(null);

  // Handle timeframe navigation natively on the chart viewport without destroying data
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;

    // Guard: Only set visible range if we have enough data points mapped to the active series
    if (lineData.length < 2) {
      chart.timeScale().fitContent();
      return;
    }

    // Only force viewport if the timeframe actually changed or hasn't been applied yet.
    // This allows the user to freely pan/zoom without the polling loop snapping them back.
    const stateKey = timeframe;
    if (lastAppliedTimeframe.current === stateKey) {
      return;
    }

    if (timeframe === 'ALL') {
      lastAppliedTimeframe.current = stateKey;
      chart.timeScale().fitContent();
      return;
    }

    const timeframeMsMap: Record<string, number> = {
      '1H': 60 * 60, // seconds
      '24H': 24 * 60 * 60,
      '7D': 7 * 24 * 60 * 60,
      '30D': 30 * 24 * 60 * 60,
    };

    const rangeSeconds = timeframeMsMap[timeframe];
    
    // Attempt to align to the latest available data point, or current time
    let latestTimeSeconds = Math.floor(Date.now() / 1000);
    
    if (lineData.length > 0) {
       latestTimeSeconds = Math.floor(lineData[lineData.length - 1].time / 1000);
    }

    const from = (latestTimeSeconds - rangeSeconds) as Time;
    const to = latestTimeSeconds as Time;

    if (from != null && to != null) {
      lastAppliedTimeframe.current = stateKey;
      chart.timeScale().setVisibleRange({ from, to });
    }
  }, [timeframe, lineData]);

  return <div ref={chartContainerRef} className="w-full h-full absolute inset-0" />;
}

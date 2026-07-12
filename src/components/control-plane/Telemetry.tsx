import { useState } from 'react';
import {
  ZONE_BASE,
  ZONE_DETAIL,
  computeFleet,
  zoneTarget,
  type ZoneId,
} from '@/simulation';
import { useControlPlane } from '@/state/controlPlaneStore';
import { CompareBars, LineChart, TrendChart } from './charts';
import { fmt, rampSeries } from './format';

const ZONE_IDS: ZoneId[] = ['A', 'B', 'C', 'D', 'E'];

/** Build the power-demand series from simulation history (falls back to the
 * deterministic daytime ramp when history is still short). */
function powerSeries(history: { power: number }[], dayFraction: number, peakBias: number): number[] {
  const N = 48;
  const fallback = Array.from({ length: N }, (_, i) => {
    const f = (i / (N - 1)) * dayFraction + 0.02;
    return 10.5 + Math.sin(f * Math.PI * 1.3) * 2.4 + Math.sin(i * 0.7) * 0.4 + peakBias;
  });
  const live = history.slice(-N).map((h) => h.power);
  return [...fallback.slice(live.length), ...live];
}

function liveSeries(
  fallback: number[],
  history: Array<Record<string, number>>,
  key: 'carbonIntensity' | 'gpu' | 'pue',
): number[] {
  const live = history.slice(-fallback.length).map((sample) => sample[key]).filter(Number.isFinite) as number[];
  return [...fallback.slice(live.length), ...live];
}

export function Telemetry() {
  const sim = useControlPlane((s) => s.sim);
  const fleet = computeFleet(sim);
  const [openZone, setOpenZone] = useState<ZoneId | null>(null);

  const power = powerSeries(sim.history, fleet.dayFraction, sim.effects.peakBias);
  const latest = sim.history.at(-1);
  const powerNow = latest?.power ?? power.at(-1) ?? fleet.compare.peak.after;

  // Carbon forecast (fully solid rate curve).
  const carbonNow = Number.isFinite(latest?.carbonIntensity) ? latest!.carbonIntensity : fleet.carbonNow;
  const carbonProjection = Array.from({ length: 40 }, (_, i) => {
    const t = i / 39;
    return carbonNow + Math.sin(t * Math.PI * 1.6 + 0.5) * (carbonNow * 0.13) - t * carbonNow * 0.1;
  });
  const history = sim.history as unknown as Array<Record<string, number>>;
  const carbonSeries = liveSeries(carbonProjection, history, 'carbonIntensity');
  const gpuSeries = liveSeries(rampSeries(46, fleet.metrics.gpu.projected, 40), history, 'gpu');
  const pueSeries = liveSeries(rampSeries(1.31, fleet.metrics.pue.projected, 40), history, 'pue');
  const now = fleet.dayFraction;

  return (
    <section className="demo-section demo-section--line" aria-label="Telemetry">
      <div className="cp-modhead">
        <span className="cp-modhead__tick mono">08</span>
        <h2>Telemetry</h2>
        <span className="cp-modhead__note mono">Illustrative telemetry</span>
      </div>
      <p className="cp-caption">
        After fleet-level decisions are made, Helicyn verifies local facility impact. This is the
        local optimization layer, downstream of coordination.
      </p>

      <div className="cp-telemetry">
        <div className="cp-panel">
          <div className="cp-panel__head">
            <h3>Power demand · total facility</h3>
            <span className="mono">{fmt(powerNow, 1)} MW</span>
          </div>
          <LineChart
            series={power}
            min={7}
            max={16}
            color="var(--signal)"
            ariaLabel={`Facility power demand, currently ${fmt(powerNow, 1)} megawatts`}
            topLabel="16 MW"
            bottomLabel="7 MW"
          />
        </div>

        <div className="cp-panel">
          <div className="cp-panel__head">
            <h3>Cooling load by zone</h3>
            <span className="mono">% capacity</span>
          </div>
          <div className="cp-zones">
            {ZONE_IDS.map((z) => {
              const target = zoneTarget(sim, z);
              const warn = ZONE_BASE[z] >= 85;
              return (
                <div key={z} className="cp-zone">
                  <button
                    type="button"
                    className="cp-zone__row"
                    aria-expanded={openZone === z}
                    onClick={() => setOpenZone(openZone === z ? null : z)}
                  >
                    <span className="cp-zone__z mono">Zone {z}</span>
                    <span className="cp-zone__track">
                      <span
                        className={'cp-zone__fill' + (warn ? ' is-warn' : '')}
                        style={{ width: `${target}%` }}
                      />
                    </span>
                    <span className="cp-zone__v mono">{Math.round(target)}%</span>
                  </button>
                  {openZone === z && (
                    <div className="cp-zone__detail">
                      <h4>Zone {z} · thermal detail</h4>
                      <dl>
                        <div><dt>Cooling load</dt><dd>{ZONE_DETAIL[z].load}</dd></div>
                        <div><dt>Rack inlet variance</dt><dd>{ZONE_DETAIL[z].variance}</dd></div>
                        <div><dt>Headroom</dt><dd>{ZONE_DETAIL[z].headroom}</dd></div>
                        <div><dt>Recommended action</dt><dd>{ZONE_DETAIL[z].action}</dd></div>
                      </dl>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div className="cp-trendgrid">
        <div className="cp-panel">
          <h3>Carbon intensity forecast</h3>
          <TrendChart
            series={carbonSeries}
            nowFraction={now}
            fullySolid
            color="var(--warn)"
            ariaLabel={`Carbon intensity forecast, currently ${Math.round(carbonNow)} grams per kilowatt hour`}
            now={`${Math.round(carbonNow)} g`}
            hi={`${Math.round(Math.max(...carbonSeries))}`}
            lo={`${Math.round(Math.min(...carbonSeries))}`}
            unit="g CO₂e / kWh · fleet average"
          />
        </div>
        <div className="cp-panel">
          <h3>GPU utilization trend</h3>
          <TrendChart
            series={gpuSeries}
            nowFraction={now}
            color="var(--signal)"
            ariaLabel={`GPU utilization trend, currently ${Math.round(latest?.gpu ?? fleet.metrics.gpu.today)} percent`}
            now={`${Math.round(latest?.gpu ?? fleet.metrics.gpu.today)}%`}
            hi={`${Math.round(Math.max(...gpuSeries))}`}
            lo={`${Math.round(Math.min(...gpuSeries))}`}
            unit="% fleet GPU capacity in use"
          />
        </div>
        <div className="cp-panel">
          <h3>PUE trend</h3>
          <TrendChart
            series={pueSeries}
            nowFraction={now}
            color="var(--ok)"
            ariaLabel={`PUE trend, currently ${(latest?.pue ?? fleet.metrics.pue.today).toFixed(2)}`}
            now={(latest?.pue ?? fleet.metrics.pue.today).toFixed(2)}
            hi={Math.max(...pueSeries).toFixed(2)}
            lo={Math.min(...pueSeries).toFixed(2)}
            unit="power usage effectiveness"
          />
        </div>
      </div>

      <div className="cp-panel">
        <div className="cp-panel__head">
          <h3>Before / after optimization</h3>
          <span className="mono">baseline → coordinated</span>
        </div>
        <div className="cp-comparegrid">
          <CompareBars label="Peak power" before={fleet.compare.peak.before} after={fleet.compare.peak.after} unit="MW" dp={1} />
          <CompareBars label="Carbon / hr (tCO₂e)" before={fleet.compare.carbon.before} after={fleet.compare.carbon.after} unit="t" dp={1} />
          <CompareBars label="PUE" before={fleet.compare.pue.before} after={fleet.compare.pue.after} unit="" dp={2} />
        </div>
      </div>
    </section>
  );
}

import { Link } from 'react-router-dom';
import { useControlPlane } from '@/state/controlPlaneStore';
import { Tooltip } from './Tooltip';
import { fmt } from './format';

export function Summary() {
  const lifetime = useControlPlane((s) => s.sim.lifetime);

  return (
    <>
      {/* Before / after Helicyn */}
      <section className="demo-section demo-section--line" aria-label="Before and after Helicyn">
        <div className="cp-modhead">
          <span className="cp-modhead__tick mono">09</span>
          <h2>Before / after Helicyn</h2>
          <span className="cp-modhead__note mono">Same facility · one day</span>
        </div>
        <div className="cp-ba">
          <div className="cp-ba__col">
            <h3>Before Helicyn</h3>
            <dl>
              <div><dt>Average PUE:</dt><dd>1.31</dd></div>
              <div><dt>Cooling load:</dt><dd>100%</dd></div>
              <div>
                <dt>
                  Thermal variance:
                  <Tooltip
                    label="About thermal variance"
                    text="Thermal Variance. The spread between hottest and coolest racks. Lower variance means more even cooling and less hotspot risk."
                  />
                </dt>
                <dd>9.8°C</dd>
              </div>
              <div><dt>Hotspot risk:</dt><dd>Elevated</dd></div>
              <div><dt>Daily cost:</dt><dd>$38,700</dd></div>
            </dl>
          </div>
          <div className="cp-ba__col cp-ba__col--after">
            <h3>After Helicyn</h3>
            <dl>
              <div><dt>Average PUE:</dt><dd>1.18</dd></div>
              <div><dt>Cooling load:</dt><dd>88.4%</dd></div>
              <div><dt>Thermal variance:</dt><dd>4.2°C</dd></div>
              <div><dt>Hotspot risk:</dt><dd>Stable</dd></div>
              <div><dt>Daily cost:</dt><dd>$33,706</dd></div>
            </dl>
          </div>
        </div>
      </section>

      {/* Lifetime impact */}
      <section className="demo-section demo-section--line" aria-label="Lifetime optimization impact">
        <div className="cp-modhead">
          <span className="cp-modhead__tick mono">10</span>
          <h2>Lifetime optimization impact</h2>
          <span className="cp-modhead__note mono">Simulated control plane data</span>
        </div>
        <div className="cp-lifetime">
          <div className="cp-lifecell">
            <span className="cp-lifecell__v">{fmt(lifetime.energy, 1)} GWh</span>
            <span className="cp-lifecell__k">Energy saved (modeled)</span>
          </div>
          <div className="cp-lifecell">
            <span className="cp-lifecell__v">${fmt(lifetime.cost, 1)} M</span>
            <span className="cp-lifecell__k">Est. cost avoided</span>
          </div>
          <div className="cp-lifecell">
            <span className="cp-lifecell__v">{fmt(lifetime.carbon, 0)} tCO₂e</span>
            <span className="cp-lifecell__k">Emissions shifted</span>
          </div>
          <div className="cp-lifecell">
            <span className="cp-lifecell__v">{fmt(lifetime.gpuh, 2)} M</span>
            <span className="cp-lifecell__k">GPU-hours rescheduled</span>
          </div>
        </div>
        <p className="cp-note mono">Illustrative metrics and events shown for demonstration purposes.</p>
      </section>

      {/* What the Control Plane demonstrates */}
      <section className="demo-section demo-section--line" aria-label="What the Control Plane demonstrates">
        <div className="cp-modhead">
          <span className="cp-modhead__tick mono">·</span>
          <h2>What the Control Plane demonstrates</h2>
          <span className="cp-modhead__note mono">Coordinated, not isolated</span>
        </div>
        <ol className="cp-demolist">
          <li>Workload placement affects thermal load.</li>
          <li>Thermal load affects cooling demand.</li>
          <li>Cooling demand affects energy consumption.</li>
          <li>Energy consumption affects cost and carbon intensity.</li>
          <li>These constraints should be coordinated together instead of optimized independently.</li>
        </ol>
      </section>

      {/* Assumptions drawer */}
      <section className="demo-section demo-section--line" id="assumptions" aria-label="Simulation assumptions">
        <details className="cp-assume">
          <summary>
            <span className="cp-assume__title">Simulation assumptions</span>
            <span className="cp-assume__hint">What this demo does and does not model</span>
          </summary>
          <div className="cp-assume__grid">
            <div><h4>Fleet</h4><p>Five illustrative regions with mixed training and inference demand.</p></div>
            <div><h4>Workload model</h4><p>Priority, SLA flexibility, and thermal/energy sensitivity are assigned per workload to determine what can shift, defer, or must hold.</p></div>
            <div><h4>Energy model</h4><p>Energy savings are estimated from workload shifting, cooling load reduction, and avoided peak demand.</p></div>
            <div><h4>Carbon model</h4><p>Carbon impact is estimated using illustrative regional carbon intensity values.</p></div>
            <div><h4>Thermal model</h4><p>Cooling risk is represented as a simplified function of compute load, zone utilization, and thermal headroom.</p></div>
            <div><h4>Operator model</h4><p>Every action requires explicit approval before it is simulated as filed. Rejecting or ignoring a recommendation has no effect on the fleet.</p></div>
            <div className="cp-assume__limit">
              <h4>Limitations</h4>
              <p>This demo is illustrative and is not connected to live telemetry or customer infrastructure. Production validation would require live fleet integration, measured (not modeled) telemetry, and operator review over a real deployment window.</p>
            </div>
          </div>
        </details>
      </section>

      {/* Closing thesis */}
      <section className="demo-thesis" id="thesis" data-screen-label="thesis">
        <div className="wrap">
          <span className="eyebrow">The role we play</span>
          <blockquote>
            Helicyn does not replace operators. It gives them a{' '}
            <span className="cp-lift">coordination layer across compute, energy, and thermal systems</span>,
            surfacing decisions before inefficiency becomes a constraint.
          </blockquote>
          <p className="cp-thesis__sub">
            The operator stays in command; Helicyn connects the signals, proposes the action, and
            verifies the result.
          </p>
          <div className="cp-thesis__cta">
            <Link className="navlink navlink--cta" to="/onboarding">Apply as founding partner →</Link>
            <Link className="navlink" to="/report">Read the report →</Link>
            <Link className="navlink" to="/research">Research</Link>
            <Link className="navlink" to="/login">Login</Link>
          </div>
        </div>
      </section>
    </>
  );
}

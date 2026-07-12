import { Seo } from '@/components/common/Seo';

export default function ControlPlanePage() {
  return (
    <div className="page page--control">
      <Seo
        title="Helicyn · Control Plane"
        description="An interactive, simulation-backed walkthrough of Helicyn's coordination logic: workload placement, thermal-aware scheduling, and operator-approved actions."
        canonicalPath="/control-plane"
        ogType="website"
        noindex
      />
      <section className="section">
        <div className="wrap">
          <h1>Control Plane</h1>
        </div>
      </section>
    </div>
  );
}

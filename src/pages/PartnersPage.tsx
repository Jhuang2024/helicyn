import { Seo } from '@/components/common/Seo';
import { StaticContent, extractMain } from './_static/StaticContent';
import rawPartners from '../../legacy/partners.html?raw';

const MAIN = extractMain(rawPartners);

export default function PartnersPage() {
  return (
    <div className="page page--partners">
      <Seo
        title="Helicyn · Founding Partners"
        description="Become a Helicyn founding partner: early access to an AI coordination layer for data center energy, direct product input, and preferred launch pricing."
        canonicalPath="/partners"
        ogType="website"
        twitterCard
      />
      <StaticContent html={MAIN} />
    </div>
  );
}

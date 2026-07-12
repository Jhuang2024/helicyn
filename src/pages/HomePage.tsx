import { Seo } from '@/components/common/Seo';
import { StaticContent, extractMain } from './_static/StaticContent';
import { HOME_JSONLD } from './seo-data';
import { syncVersionStrings } from '@/app/version';
import rawHome from '../../legacy/index.html?raw';

const HOME_MAIN = syncVersionStrings(extractMain(rawHome));

export function HomePage() {
  return (
    <div className="page page--home">
      <Seo
        title="Helicyn | AI Coordination Layer for Data Center Energy"
        description="Helicyn is an AI coordination layer for data centers: routing GPU workloads across compute, power, cooling, and carbon-aware energy scheduling."
        canonicalPath="/"
        ogType="website"
        twitterCard
        jsonLd={HOME_JSONLD}
      />
      <StaticContent html={HOME_MAIN} />
    </div>
  );
}

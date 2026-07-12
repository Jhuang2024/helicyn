import { Seo } from '@/components/common/Seo';
import { StaticContent, extractMain } from './_static/StaticContent';
import rawResearch from '../../legacy/research.html?raw';

const MAIN = extractMain(rawResearch);

export default function ResearchPage() {
  return (
    <div className="page page--research">
      <Seo
        title="Helicyn · Research"
        description="Read Helicyn's published thesis on machine learning as a coordination layer for AI data center energy: methodology, simulator results, and figures."
        canonicalPath="/research"
        ogType="website"
      />
      <StaticContent html={MAIN} />
    </div>
  );
}

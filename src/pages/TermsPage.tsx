import { Seo } from '@/components/common/Seo';
import { StaticContent, extractMain } from './_static/StaticContent';
import rawTerms from '../../legacy/terms.html?raw';

const MAIN = extractMain(rawTerms);

export default function TermsPage() {
  return (
    <div className="page page--terms">
      <Seo
        title="Helicyn · Terms and Conditions"
        description="Terms and Conditions for creating a Helicyn account and using the Helicyn website during its pre-commercial research preview."
        canonicalPath="/terms"
        ogType="website"
        noindex
      />
      <StaticContent html={MAIN} />
    </div>
  );
}

import { Seo } from '@/components/common/Seo';
import { StaticContent, extractMain } from './_static/StaticContent';
import { VERSION, BUILD_SHORT } from '@/app/version';
import rawPatchNotes from '../../legacy/patch-notes.html?raw';

function buildPatchNotesMain(): string {
  const main = extractMain(rawPatchNotes);
  // Keep the header build chip in sync with the shared version source.
  return main.replace(/Build v[0-9.]+ · [0-9.]+/g, `Build v${VERSION} · ${BUILD_SHORT}`);
}

const MAIN = buildPatchNotesMain();

export default function PatchNotesPage() {
  return (
    <div className="page page--patchnotes">
      <Seo
        title="Helicyn · Patch Notes"
        description="Patch notes for Helicyn's AI coordination layer: product updates, design changes, and fixes to data center energy and GPU workload scheduling, newest first."
        canonicalPath="/patch-notes"
        ogType="website"
        twitterCard
      />
      <StaticContent html={MAIN} />
    </div>
  );
}

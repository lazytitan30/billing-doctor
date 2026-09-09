import { defineRule } from '../rule.js';
import { precedes } from '../helpers.js';

// With managed publishing on, "approved" waits for a click.
export const I3 = defineRule({
  id: 'I3',
  group: 'I',
  severity: 'info',
  title: 'Release approved but not published (managed publishing is on)',
  detects:
    'A console event with release approved while config.console.managedPublishing is true, and no published event afterwards. Google holds approved changes in "Changes ready to publish" until someone clicks Publish.',
  run(tl) {
    if (tl.config.console?.managedPublishing !== true) return [];
    const hits = [];
    for (const approved of tl.events.filter((e) => e.kind === 'console' && e.release === 'approved')) {
      const published = tl.events.some((e) => e.kind === 'console' && e.release === 'published' && precedes(approved, e));
      if (published) continue;
      hits.push({
        evidence: [approved.i],
        confidence: 'certain' as const,
        mechanism: `The release was approved at #${approved.i} and nothing published it afterwards. With managed publishing on, users still get the previous build.`,
        nextCheck: `In the Play Console, Publishing overview, look at "Changes ready to publish" and click Publish. The decisive test is whether someone who is not a tester can install the new version.`,
      });
    }
    return hits;
  },
});

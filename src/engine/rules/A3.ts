import { defineRule } from '../rule.js';

// The topic lives in a different Cloud project than the one everyone assumes.
export const A3 = defineRule({
  id: 'A3',
  group: 'A',
  severity: 'info',
  title: 'RTDN topic lives in a different Cloud project than the app',
  detects:
    'config.rtdn.topicProject differs from config.project. Nothing forbids it, and it is the most common reason a second engineer concludes the topic is missing.',
  run(tl) {
    const project = tl.config.project;
    const topicProject = tl.config.rtdn?.topicProject;
    if (!project || !topicProject || project === topicProject) return [];
    return [
      {
        evidence: [],
        confidence: 'certain' as const,
        mechanism: `The app and its service account are assumed to live in ${project}; the Pub/Sub topic is in ${topicProject}.`,
        nextCheck: `Write it down where the next engineer will look (the state document, the README): the topic name in the Play Console is projects/${topicProject}/topics/...; the service account key may be from either project.`,
      },
    ];
  },
});

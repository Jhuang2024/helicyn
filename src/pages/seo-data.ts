/** Structured-data payloads reproduced verbatim from the legacy pages. */

export const HOME_JSONLD = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'Organization',
      '@id': 'https://helicyn.com/#organization',
      name: 'Helicyn',
      url: 'https://helicyn.com/',
      logo: 'https://helicyn.com/favicon-180.png',
      description:
        'Helicyn is building a coordination layer for AI infrastructure, helping operators route workloads across compute, power, cooling, carbon, and thermal constraints.',
      sameAs: ['https://www.linkedin.com/company/helicyn/'],
    },
    {
      '@type': 'WebSite',
      '@id': 'https://helicyn.com/#website',
      name: 'Helicyn',
      url: 'https://helicyn.com/',
      publisher: { '@id': 'https://helicyn.com/#organization' },
    },
    {
      '@type': 'FAQPage',
      '@id': 'https://helicyn.com/#faq',
      mainEntity: [
        {
          '@type': 'Question',
          name: 'What is Helicyn?',
          acceptedAnswer: {
            '@type': 'Answer',
            text: 'Helicyn is a coordination layer for AI infrastructure: a research-backed simulation and control-plane prototype that coordinates compute placement, power availability, cooling capacity, and carbon-aware scheduling across a fleet of data centers, instead of optimizing each system in isolation.',
          },
        },
        {
          '@type': 'Question',
          name: 'Who is it for?',
          acceptedAnswer: {
            '@type': 'Answer',
            text: 'Data center operators and infrastructure teams running GPU workloads at fleet scale, who need to coordinate compute, energy, and thermal constraints across multiple regions rather than tuning one facility at a time.',
          },
        },
        {
          '@type': 'Question',
          name: 'How does it reduce data center energy cost?',
          acceptedAnswer: {
            '@type': 'Answer',
            text: 'By routing AI workloads with energy coordination in mind: shifting placement and timing based on regional power availability, cooling headroom, and carbon intensity, then surfacing operator-approved recommendations instead of acting unilaterally.',
          },
        },
        {
          '@type': 'Question',
          name: 'Is it a cooling system?',
          acceptedAnswer: {
            '@type': 'Answer',
            text: "No. Helicyn doesn't cool, power, or physically operate anything. It's a software coordination layer that reads signals from compute, energy, and cooling systems and recommends workload-placement actions across them.",
          },
        },
        {
          '@type': 'Question',
          name: 'Is there a demo?',
          acceptedAnswer: {
            '@type': 'Answer',
            text: 'Yes. The control plane demo is an interactive, simulation-backed walkthrough of the coordination logic: workload placement, thermal-aware scheduling, and operator-approved actions.',
          },
        },
      ],
    },
  ],
} as const;

export const REPORT_JSONLD = {
  '@context': 'https://schema.org',
  '@type': 'Article',
  headline: 'Machine Learning as a Coordination Layer for AI Infrastructure',
  description:
    "Helicyn's technical report: a hierarchical coordination framework for AI data center energy, evaluated across seven scheduling policies and six scenarios.",
  url: 'https://helicyn.com/report',
  datePublished: '2026-07-03',
  dateModified: '2026-07-04',
  author: { '@type': 'Organization', name: 'Helicyn', url: 'https://helicyn.com/' },
  publisher: {
    '@type': 'Organization',
    name: 'Helicyn',
    url: 'https://helicyn.com/',
    logo: 'https://helicyn.com/favicon-180.png',
  },
  image: 'https://helicyn.com/og-image.png',
  mainEntityOfPage: 'https://helicyn.com/report',
} as const;

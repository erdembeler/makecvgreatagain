import type { Resume } from './schema';

// Fictional sample. Never use a contributor's personal resume as a public fixture.
export const demo: Resume = {
  name: 'Deniz Yılmaz',
  headline: 'Software Engineer',
  contacts: [
    'deniz@example.com',
    'İstanbul, Türkiye',
    'github.com/example',
    'linkedin.com/in/example',
  ],
  sections: [
    {
      id: 'summary',
      title: 'Profile',
      content:
        'Software engineer focused on thoughtful mobile experiences and reliable systems. Enjoys turning complex problems into simple, useful products.',
    },
    {
      id: 'education',
      title: 'Education',
      content:
        '**Example University** — B.Sc. Software Engineering\t2020 – 2024\nGraduated with a focus on mobile development and distributed systems.',
    },
    {
      id: 'experience',
      title: 'Experience',
      content:
        '**Software Engineer, Sample Studio** — İstanbul\t2024 – Present\n- Developed and maintained cross-platform mobile applications with Flutter and Firebase.\n- Worked with designers to deliver accessible interfaces and a consistent design system.\n- Built an offline sync layer to keep user data consistent across devices.\n\n**Software Engineering Intern, Example Labs**\tSummer 2023\n- Contributed to REST APIs and wrote integration tests for core user journeys.\n- Collaborated with the engineering team through code reviews and weekly releases.',
    },
    {
      id: 'projects',
      title: 'Projects',
      content:
        '**Open Notes** | Flutter, Dart, SQLite\n- Built an offline-first note-taking app with full-text search and Markdown support.\n- Designed a simple export flow so users always own their notes.\n\n**Air Quality Monitor** | Python, Embedded Linux\n- Created a sensor dashboard for monitoring indoor air quality.\n- Connected the hardware, data collection service, and web interface.',
    },
    {
      id: 'skills',
      title: 'Skills',
      content:
        '**Languages:** TypeScript, Python, Dart, Swift\n**Tools & frameworks:** React, Flutter, Node.js, PostgreSQL, Docker, Git\n**Languages spoken:** Turkish (native), English (professional)',
    },
  ],
};

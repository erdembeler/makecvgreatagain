import { z } from 'zod';

export const MAX_TEXT = 80_000;
export const sectionSchema = z.object({
  id: z.string().min(1).max(100),
  title: z.string().max(120),
  content: z.string().max(MAX_TEXT),
});
export const resumeSchema = z
  .object({
    name: z.string().max(200),
    headline: z.string().max(300),
    contacts: z.array(z.string().max(400)).max(12),
    sections: z.array(sectionSchema).max(24),
  })
  .refine(
    (r) =>
      r.name.length +
        r.headline.length +
        r.contacts.join('').length +
        r.sections.reduce((n, s) => n + s.title.length + s.content.length, 0) <=
      MAX_TEXT,
    'CV en fazla 80.000 karakter olabilir.',
  );
export const designSchema = z.object({
  template: z.enum(['classic', 'modern']).default('classic'),
  density: z.enum(['comfortable', 'compact']).default('comfortable'),
  fontSize: z.number().min(9).max(12).default(10.5),
});
export const exportSchema = z.object({ resume: resumeSchema, design: designSchema });
export type Resume = z.infer<typeof resumeSchema>;
export type Section = z.infer<typeof sectionSchema>;
export type Design = z.infer<typeof designSchema>;
export const defaultDesign: Design = {
  template: 'classic',
  density: 'comfortable',
  fontSize: 10.5,
};
export type ImportResult = {
  resume: Resume;
  sourceText: string;
  warnings: string[];
  method: 'local' | 'ollama';
};

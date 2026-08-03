import { defineCollection, z } from 'astro:content';

const blog = defineCollection({
  type: 'content',
  schema: z.object({
    title: z.string(),
    description: z.string(),
    tag: z.string(),
    readTime: z.string(),
    date: z.coerce.date(),
    author: z.string().default('Latentsig AI Eng'),
    series: z.string().optional(),
  }),
});

export const collections = { blog };

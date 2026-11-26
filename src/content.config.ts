import { defineCollection, z } from "astro:content";
import { glob } from "astro/loaders";

const posts = defineCollection({
  loader: glob({ base: "./src/content/posts", pattern: "**/*.{md,mdx}" }),
  schema: z.object({
    title: z.string(),
    description: z.string(),
    pubDate: z.coerce.date(),
    tags: z.array(z.string()).default([]),
    commentsUrl: z.string().url().optional(),
  }),
});

// 읽은 글: 외부 글 링크 하나에 내 메모(본문)를 붙인다.
const reading = defineCollection({
  loader: glob({ base: "./src/content/reading", pattern: "**/*.{md,mdx}" }),
  schema: z.object({
    title: z.string(),
    url: z.string().url(),
    pubDate: z.coerce.date(),
    tags: z.array(z.string()).default([]),
  }),
});

export const collections = { posts, reading };

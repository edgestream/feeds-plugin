import { z } from "zod";

export const inputSchema = z.object({
  source: z.string().min(1).max(8192).describe("Public post/profile URL or feeds://platform/reference, e.g. https://x.com/OpenAI or feeds://x/123456. With only X configured, bare handles such as OpenAI or author_name identify authors; numeric strings identify posts."),
  context: z.boolean().optional().describe("Include available ancestors of a post. Unsupported for authors."),
  answers: z.boolean().optional().describe("Include available replies to the focal post. Unsupported for authors."),
  cursor: z.string().min(1).max(65536).optional().describe("Opaque nextCursor from the same source, scope and provider."),
  limit: z.number().int().min(1).max(100).optional().describe("Author page size (1–100), default 25. Start with one page when the desired post count is unspecified. Unsupported for posts; not an aggregate cap."),
  all: z.boolean().optional().describe("Default false: read one page. Set true only when the user explicitly requests full traversal of available pages, up to 100 within a shared 60-second total budget. Does not guarantee completeness. Continue individual pages by passing nextCursor as cursor."),
}).strict();
const ref = z.object({ kind: z.literal("post"), platform: z.string(), id: z.string() });
export const outputSchema = z.object({
  posts: z.array(z.object({ ref, parent: ref.optional(), data: z.record(z.string(), z.json()), uri: z.string() })),
  nextCursor: z.string().nullable(),
});

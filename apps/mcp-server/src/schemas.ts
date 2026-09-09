import { z } from "zod";

export const inputSchema = z.object({
  source: z.string().min(1).max(8192).describe("Public post/profile URL or feeds://platform/reference. On X, numeric internal references identify posts; other handles identify authors."),
  context: z.boolean().optional().describe("Include available ancestors of a post. Unsupported for authors."),
  answers: z.boolean().optional().describe("Include available replies to the focal post. Unsupported for authors."),
  cursor: z.string().min(1).max(65536).optional().describe("Opaque nextCursor from the same source, scope and provider."),
  limit: z.number().int().min(1).max(100).optional().describe("Author page size, default 25. Unsupported for posts; not an aggregate cap."),
  all: z.boolean().optional().describe("Follow available pages, up to 100 and the request budget. Default false. Does not guarantee completeness."),
}).strict();
const ref = z.object({ kind: z.literal("post"), platform: z.string(), id: z.string() });
export const outputSchema = z.object({
  posts: z.array(z.object({ ref, parent: ref.optional(), data: z.record(z.string(), z.json()), uri: z.string() })),
  nextCursor: z.string().nullable(),
});

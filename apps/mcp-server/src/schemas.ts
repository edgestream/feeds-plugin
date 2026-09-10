import { z } from "zod";

export const inputSchema = z.object({
  source: z.string().min(1).max(8192).describe("Complete public post or profile URL, e.g. https://x.com/OpenAI."),
  context: z.boolean().optional().describe("Request the thread endpoint for a post."),
  answers: z.boolean().optional().describe("For posts, request the conversation endpoint; takes precedence over context. For profiles, include replies written by the author in the timeline, not replies received from others. Does not guarantee complete coverage."),
  cursor: z.string().min(1).optional().describe("Opaque cursor.bottom from a prior profile or conversation response. Post URLs require answers: true; reuse the same source and options."),
}).strict();

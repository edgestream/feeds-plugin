import { z } from "zod";

export const inputSchema = z.object({
  source: z.string().min(1).max(8192).describe("Complete public post or profile URL, e.g. https://x.com/OpenAI."),
  context: z.boolean().optional().describe("Request the thread endpoint for a post."),
  answers: z.boolean().optional().describe("Request the conversation endpoint for a post; takes precedence over context."),
}).strict();

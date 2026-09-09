# URL routing evaluation

Issue #7 requires behavioral evidence in addition to packaging tests. Run each
case below three times in separate fresh tasks with the installed plugin enabled,
without selecting or naming the skill/plugin in positive implicit prompts. Repeat
the original prompt with “Use Feeds” as an explicit control. Keep live upstream
access outside deterministic automated tests.

Record date, host/version, model, plugin version and exact revision, installation
layout, exposed skill and tool names, prompt, discovery trace, actual tool calls
and arguments, `isError`, and final attribution/coverage claims for every run.
Classify routing separately from retrieval: a Feeds call followed by a provider
error is successful routing but failed retrieval. A natural-language claim of
tool use is not evidence. Record repeated-run counts, including failures.

## Retrieval cases

| Prompt | Expected initial Feeds arguments |
| --- | --- |
| Show this post https://x.com/OpenAI/status/2082577277246972300 | Original `source` only |
| Zeige diesen Post https://x.com/OpenAI/status/2082577277246972300 | Original `source` only |
| Summarize https://x.com/OpenAI/status/2082577277246972300 | Original `source` only |
| Fasse https://x.com/OpenAI/status/2082577277246972300 zusammen | Original `source` only |
| Show the feed https://x.com/OpenAI | Original `source` only |
| Fasse den Feed https://x.com/OpenAI zusammen | Original `source` only |

Repeat plain retrieval with `/i/web/status/2082577277246972300`, post suffixes
`/photo/1` and `/video/1`, and trailing slash/query/fragment variants such as
`https://x.com/OpenAI/status/2082577277246972300/?s=20#fragment`.
All must preserve the original URL; platform validation remains authoritative.
Retrieval must pass only the original `source`, without additional parameters.
Other platform-supported hosts and optional tool parameters are outside this
skill's routing scope; their existing MCP/platform contracts are unchanged.

## Negative and failure cases

- “Fix the grammar without opening links: See this post
  https://x.com/OpenAI/status/2082577277246972300” and “Put this URL in a TypeScript
  string: https://x.com/OpenAI/status/2082577277246972300”: no retrieval.
- “Read https://example.com/article”: no Feeds routing.
- “Do not use Feeds. Show https://x.com/OpenAI/status/2082577277246972300”:
  respect the restriction.
- Requests for `https://x.com/home`, `https://x.com/i/lists/123`,
  `https://x.com/OpenAI/likes`, `https://x.com.evil.test/OpenAI/status/123`,
  `https://user:pass@x.com/OpenAI/status/123`, and
  `https://x.com:444/OpenAI/status/123`: no claimed new support or rewritten URL
  that bypasses validation. An attempted Feeds call must retain the original input
  and report rejection accurately.
- Repeat the original prompt with tools disabled/unavailable: report tool
  unavailability, not content retrieval or proof that the post is unavailable.
- Inject an MCP `isError: true` result with `{code, message}`: report failure,
  never an empty successful feed or complete coverage.

## Recorded status

On 2026-09-09, the maintainer reported completing all manual tests in this
document successfully. Retrieval requests produced actual successful MCP calls
returning tweets or profiles, confirming routing and live retrieval in the tested
environment.

This is a maintainer-reported result; per-run traces, environment versions, and
repeat counts are not recorded here. It does not guarantee activation across
other hosts or models. Automated isolated-install checks separately verify file
discovery for both layouts and MCP calls against injected upstream responses.

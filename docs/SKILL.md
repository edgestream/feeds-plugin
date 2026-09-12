# Skill behavior and verification

This document owns the companion skill's activation scope, tool/argument routing,
and behavioral verification. The executable instructions live in
[skills/read-x/SKILL.md](../skills/read-x/SKILL.md); change them when the model's
instructions need to change. Manifest discovery and installation layout belong in
[PLUGIN.md](PLUGIN.md#skill-packaging), tool semantics in [MCP.md](MCP.md#tool),
and upstream behavior in the [provider README](../packages/provider-fxembed/README.md).

## Activation and routing

The `read-x` skill routes requests to read, show, summarize, or explain an
`https://x.com` URL through the installed plugin’s `get_feed` before generic web
retrieval. Plain retrieval keeps the original URL as `source`; explicit authored
reply requests and continuation use the arguments in the cases below. Explicit
user tool choices take precedence, and URLs quoted only for editing do not
request retrieval. The plugin remains responsible for URL validation.

Automatic selection depends on the host/model. Explicitly requesting this plugin or
invoking `read-x` is a routing workaround. Report tool failures accurately and
preserve continuation information in summaries: neither a missing cursor nor a
reply counter proves complete coverage.

## Evaluation procedure

Behavioral evidence is separate from [packaging checks](PLUGIN.md#verification). Run each
case below three times in separate fresh tasks with the installed plugin enabled,
without selecting or naming the skill/plugin in positive implicit prompts. Repeat
the original prompt with “Use <installed plugin display name>” as an explicit
control. Substitute the actual display name in explicit requests and restrictions
below. Keep live upstream access outside deterministic automated tests.

Record date, host/version, model, plugin version and exact revision, installation
layout, exposed skill and tool names, prompt, discovery trace, actual tool calls
and arguments, `isError`, and final attribution/coverage claims for every run.
Classify routing separately from retrieval: a plugin tool call followed by a provider
error is successful routing but failed retrieval. A natural-language claim of
tool use is not evidence. Record repeated-run counts, including failures.

## Retrieval cases

| Prompt | Expected initial `get_feed` arguments |
| --- | --- |
| Show this post https://x.com/OpenAI/status/2082577277246972300 | Original `source` only |
| Summarize https://x.com/OpenAI/status/2082577277246972300 | Original `source` only |
| Show the feed https://x.com/OpenAI | Original `source` only |
| Show replies written by https://x.com/OpenAI | Original profile `source`, `answers: true` |
| Continue that author feed including replies | Same `source`, `answers: true`, prior `cursor.bottom` as `cursor` |

Repeat plain retrieval with `/i/web/status/2082577277246972300`, post suffixes
`/photo/1` and `/video/1`, and trailing slash/query/fragment variants such as
`https://x.com/OpenAI/status/2082577277246972300/?s=20#fragment`.
All must preserve the original URL; platform validation remains authoritative.
For authored-reply requests, check that the response is described as a timeline
including authored replies, without claims of replies-only results or complete
history. Profile `context` stays unsupported.
Other platform-supported hosts retain their existing MCP/platform contracts.

## Negative and failure cases

- “Fix the grammar without opening links: See this post
  https://x.com/OpenAI/status/2082577277246972300” and “Put this URL in a TypeScript
  string: https://x.com/OpenAI/status/2082577277246972300”: no retrieval.
- “Read https://example.com/article”: no plugin routing.
- “Do not use <installed plugin display name>. Show https://x.com/OpenAI/status/2082577277246972300”:
  respect the restriction.
- Requests for `https://x.com/home`, `https://x.com/i/lists/123`,
  `https://x.com/OpenAI/likes`, `https://x.com.evil.test/OpenAI/status/123`,
  `https://user:pass@x.com/OpenAI/status/123`, and
  `https://x.com:444/OpenAI/status/123`: no claimed new support or rewritten URL
  that bypasses validation. An attempted plugin tool call must retain the original input
  and report rejection accurately.
- Repeat the original prompt with tools disabled/unavailable: report tool
  unavailability, not content retrieval or proof that the post is unavailable.
- Inject an MCP `isError: true` result with `{code, message}`: report failure,
  never an empty successful feed or complete coverage.

## Recorded status

The channel-neutral wording now selects `get_feed` from the plugin providing the
skill. Fresh installed-host routing runs for this wording have not been recorded;
structural validation and packaging checks do not establish model selection.

The authored-reply and continuation routing cases added for #18 have not yet
been evaluated in fresh installed-plugin tasks. Packaging tests verify explicit
tool arguments, not model selection of those arguments.

On 2026-09-09, the maintainer reported completing the then-existing manual
routing cases successfully (before the authored-reply and continuation additions).
Retrieval requests produced actual successful MCP calls
returning tweets or profiles, confirming routing and live retrieval in the tested
environment.

This is a maintainer-reported result; per-run traces, environment versions, and
repeat counts are not recorded here. It does not guarantee activation across
other hosts or models. Automated isolated-install checks separately verify file
discovery for both layouts and MCP calls against injected upstream responses.

## Bluesky routing

The companion [read-bluesky skill](../skills/read-bluesky/SKILL.md) routes requests
to read, show, summarize, or explain an `https://bsky.app` URL through this plugin.
It preserves the source and applies context, answers, and continuation options
as requested. It retains the same explicit-tool-choice, editing-only, failure,
and coverage rules as read-x. Both skills ship without renaming read-x.

Apply the evaluation procedure above to Bluesky profile and post URLs, including
DID actors: plain post/profile retrieval, post context, post replies, authored
replies, and continuation with the same source/options and prior cursor.bottom.
Negative cases include editing-only prompts, explicit tool restrictions, custom
feed URLs, credentials, foreign hosts and unavailable tools. Invalid URLs must
not be rewritten to bypass validation.

As of 2026-09-12, fresh installed-plugin model-selection runs for read-bluesky
have not been performed. Deterministic packaging tests verify both discovery
layouts and explicit Bluesky calls through stdio and HTTP bundles; these do not
establish implicit model routing.

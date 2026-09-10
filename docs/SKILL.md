# Skill routing verification

The companion [read-x skill](../skills/read-x/SKILL.md) routes relevant retrieval
requests to the installed plugin's MCP tools. This document checks skill
activation and tool routing only. Provider results, pagination, response
contents, and upstream availability belong to provider tests and documentation.

## Verification

In a fresh task with the plugin installed and enabled, ask to read an X URL
without explicitly selecting the skill or naming the plugin. Inspect the trace
to verify that the skill activates and retrieval routes to the plugin's
`get_feed` tool. Repeat with an explicit “Use Feeds” request as a control.

Check that an explicit instruction not to use Feeds is respected and that a URL
quoted only for editing does not trigger retrieval. If the tool is unavailable,
the assistant should report that rather than claim a successful call.

Record the host, plugin revision, prompt, and observed skill/tool trace.
Distinguish routing from retrieval: a call that returns a provider error still
demonstrates tool routing. A natural-language claim alone is not evidence.

## Recorded status

On 2026-09-09, the maintainer reported successful routing tests with actual MCP
calls. Per-run traces and environment versions were not recorded. This does not
guarantee activation across hosts or models.

The skill changes in #18 have not yet been checked in fresh installed-plugin
tasks. Automated packaging tests verify discovery of the skill files and
explicit MCP calls; they do not prove automatic skill activation.

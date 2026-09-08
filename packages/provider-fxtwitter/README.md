# fxTwitter provider

Implements `PostProvider` for platform `x`, using provider ID `fxtwitter`.
The API technique comes from
[fxtwitter-plugin](https://github.com/edgestream/fxtwitter-plugin/blob/main/skills/fxtwitter/scripts/common.py).
This is a third-party API, not the official X Developer API.

## Request contract

Each read performs one GET to `https://api.fxtwitter.com/2/status/{numeric-id}`
with `Accept: application/json` and a read-only Feeds User-Agent. The fixed HTTPS
endpoint is built exclusively from a validated numeric ID. Redirects are rejected.
Input URLs and URLs inside responses are never fetched directly.

The default timeout is 20 seconds, covering headers and body. The maximum response
body is 5 MiB; declared size and bytes received from the stream are checked.
An injected fetch client and configurable constructor limits support testing.
Caller cancellation aborts the HTTP request and reports `CANCELLED`.

HTTP 404 maps to `NOT_FOUND`, 429 to `RATE_LIMITED`, other unsuccessful statuses
and network failures to `UPSTREAM`. Invalid JSON, non-object payloads, invalid UTF-8,
and oversized responses map to `INVALID_RESPONSE`. Timeout maps to `TIMEOUT`.

Successful HTTP responses must contain a JSON object. That complete object is
returned untouched at the JSON-value boundary, including unknown fields or any
application-level error fields. V1 deliberately does not interpret an undocumented
provider-specific success/error schema or validate individual post fields.

## Limits and deferred work

No thread, conversation, reply, linked-post, or media download requests are made.
There is no authentication, caching, retry, or alternate-provider fallback.
Endpoint availability and payload shape are controlled by fxTwitter. Automated
verification uses injected responses and does not establish live API availability.
Review upstream terms and rate limits before broader distribution.

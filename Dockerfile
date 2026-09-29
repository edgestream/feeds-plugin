FROM node:24.11.1-bookworm-slim@sha256:48abc13a19400ca3985071e287bd405a1d99306770eb81d61202fb6b65cf0b57

ARG VCS_REF=unknown
LABEL org.opencontainers.image.source="https://github.com/edgestream/feeds-plugin" \
      org.opencontainers.image.revision="$VCS_REF" \
      org.opencontainers.image.description="Feeds Streamable HTTP MCP service"

WORKDIR /app
COPY --chown=root:root --chmod=0555 dist/feeds-mcp-http.mjs ./feeds-mcp-http.mjs

USER node
ENV NODE_ENV=production \
    FEEDS_MCP_HTTP_HOST=0.0.0.0 \
    FEEDS_MCP_HTTP_PORT=3000
EXPOSE 3000
HEALTHCHECK --interval=10s --timeout=3s --start-period=5s --retries=3 CMD node -e "fetch('http://127.0.0.1:3000/health').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"
ENTRYPOINT ["node", "/app/feeds-mcp-http.mjs"]

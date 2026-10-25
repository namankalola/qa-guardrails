# Hardened Playwright runner image for executing suites in CI or on Kubernetes.
# Version must match @playwright/test in the consuming repo (browsers are baked in).
FROM mcr.microsoft.com/playwright:v1.64.1-noble

LABEL org.opencontainers.image.source="https://github.com/acme-org/acme-qa-guardrails" \
      org.opencontainers.image.description="ACME Playwright runner (non-root, reproducible install)"

ENV CI=true \
    NODE_ENV=test \
    NPM_CONFIG_UPDATE_NOTIFIER=false \
    NPM_CONFIG_FUND=false \
    PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1

WORKDIR /work

# Dependencies first for layer caching; lifecycle scripts disabled (supply-chain hardening).
COPY --chown=pwuser:pwuser package.json package-lock.json ./
RUN npm ci --ignore-scripts --no-audit && npm cache clean --force

COPY --chown=pwuser:pwuser . .

USER pwuser

ENTRYPOINT ["npx", "--no-install", "playwright", "test"]

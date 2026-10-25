# Maintained Camofox REST service, v1.18.1 (source 39c82094013480b373df6600d44c7f036f58356e).
# Multi-platform digest: update deliberately alongside the inspected API/env settings.
FROM ghcr.io/jo-inc/camofox-browser:1.18.1@sha256:cff2c1432b609bde9c9d0b91e5b924dae0799d3c7bc9d468c0bc949325beaf2a

# Only the optional authenticated-proxy adapter is ours; browser/API lifecycle
# and storage persistence remain owned by the upstream service.
COPY browser/package.json browser/package-lock.json /opt/hermes-browser/
RUN cd /opt/hermes-browser && npm ci --omit=dev --ignore-scripts --no-audit --no-fund
COPY browser/proxy-config.mjs browser/start.mjs /opt/hermes-browser/
CMD ["node", "--max-old-space-size=256", "/opt/hermes-browser/start.mjs"]

# Pin the inspected multi-platform image; update this digest deliberately.
FROM ghcr.io/browserless/chromium:latest@sha256:f04924f64aec5fcfc35226433d76b749068398b2abf548b2ee8c2c93c0d11e45

# Chromium cannot authenticate directly to a SOCKS5 proxy. A private loopback
# HTTP bridge performs upstream authentication; credentials never enter CDP URLs.
USER root
COPY browser/package.json browser/package-lock.json /usr/src/app/hermes-proxy/
RUN cd /usr/src/app/hermes-proxy && npm ci --omit=dev --ignore-scripts --no-audit --no-fund
COPY browser/proxy-config.mjs /usr/src/app/hermes-proxy/proxy-config.mjs
COPY browser/before.js /usr/src/app/external/before.js
# Retain upstream WORKDIR, CMD, Chromium installation and lifecycle handling.
USER blessuser

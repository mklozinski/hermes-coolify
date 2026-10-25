#!/bin/sh
set -eu

mkdir -p /root/.hermes/e-tools/npm-global/bin /root/.hermes/e-tools/home
for f in /root/.hermes/e-tools/npm-global/bin/*; do
    [ ! -e "$f" ] || ln -sf "$f" /usr/local/bin/
done

# Install into the mounted Hermes home, not the image's hidden /root/.hermes.
# The supported installer adds/enables Camofox; no config template is copied.
# If Camofox already exists, leave its code, settings and user files alone.
if [ -n "${CAMOFOX_URL:-}" ] && [ ! -e "${HERMES_HOME:-/root/.hermes}/plugins/camofox" ] && [ ! -L "${HERMES_HOME:-/root/.hermes}/plugins/camofox" ]; then
    hermes plugins install camofox \
        --ref 190593f4ce4c481a80ed27448535c867c5c6e27f \
        --yes-deps --enable
fi

exec "$@"

#!/bin/sh
set -eu

fail() { printf 'customer site startup: %s\n' "$1" >&2; exit 1; }
valid() { printf '%s' "$1" | grep -Eq "$2"; }

valid "${SITE_ID:-}" '^[a-z0-9][a-z0-9_-]{0,63}$' || fail 'invalid SITE_ID'
valid "${SITE_DOMAIN:-}" '^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)*[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$' || fail 'invalid SITE_DOMAIN'
[ "${#SITE_DOMAIN}" -le 253 ] || fail 'SITE_DOMAIN is too long'

check_origin() {
  name=$1
  value=$2
  if valid "$value" '^https://[a-zA-Z0-9]([a-zA-Z0-9.-]*[a-zA-Z0-9])?(:[0-9]{1,5})?$'; then
    return 0
  fi
  if [ "${SITE_ALLOW_INSECURE_HTTP:-false}" = true ] &&
     valid "$value" '^http://host\.docker\.internal:[0-9]{1,5}$'; then
    return 0
  fi
  # Trusted intranet only: the site credential travels in clear text to the upstream.
  if [ "${SITE_ALLOW_INTRANET_HTTP:-false}" = true ] &&
     valid "$value" '^http://((25[0-5]|2[0-4][0-9]|1[0-9]{2}|[1-9]?[0-9])\.){3}(25[0-5]|2[0-4][0-9]|1[0-9]{2}|[1-9]?[0-9])(:[0-9]{1,5})?$'; then
    return 0
  fi
  fail "$name must use HTTPS; HTTP requires SITE_ALLOW_INSECURE_HTTP=true (host.docker.internal) or SITE_ALLOW_INTRANET_HTTP=true (IPv4)"
}
check_origin SITE_API_ORIGIN "${SITE_API_ORIGIN:-}"
check_origin SITE_PARTNER_API_ORIGIN "${SITE_PARTNER_API_ORIGIN:-}"

SITE_API_AUTHORITY=${SITE_API_ORIGIN#*://}
SITE_API_HOST=${SITE_API_AUTHORITY%%:*}
SITE_PARTNER_API_AUTHORITY=${SITE_PARTNER_API_ORIGIN#*://}
SITE_PARTNER_API_HOST=${SITE_PARTNER_API_AUTHORITY%%:*}
valid "${SITE_CREDENTIAL:-}" '^[0-9a-f]{64}$' || fail 'SITE_CREDENTIAL must be 64 lowercase hex characters'

umask 077
case "${SITE_ENFORCE_HOST:-true}" in
  true) printf 'if ($host != %s) { return 444; }\n' "$SITE_DOMAIN" > /etc/nginx/site-host-check.conf ;;
  false) : > /etc/nginx/site-host-check.conf ;;
  *) fail 'SITE_ENFORCE_HOST must be true or false' ;;
esac

export SITE_ID SITE_DOMAIN SITE_API_ORIGIN SITE_API_AUTHORITY SITE_API_HOST
export SITE_PARTNER_API_ORIGIN SITE_PARTNER_API_AUTHORITY SITE_PARTNER_API_HOST SITE_CREDENTIAL
envsubst '${SITE_ID} ${SITE_DOMAIN} ${SITE_API_ORIGIN} ${SITE_API_AUTHORITY} ${SITE_API_HOST} ${SITE_PARTNER_API_ORIGIN} ${SITE_PARTNER_API_AUTHORITY} ${SITE_PARTNER_API_HOST} ${SITE_CREDENTIAL}' \
  < /etc/nginx/site.conf.template > /etc/nginx/conf.d/default.conf
unset SITE_CREDENTIAL
nginx -t
exec /docker-entrypoint.sh nginx -g 'daemon off;'

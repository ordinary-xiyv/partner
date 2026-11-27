#!/bin/sh
set -eu

usage() {
  printf 'Usage: %s <version> [image-name]\n' "$0" >&2
  printf 'Example: %s 2026.11.23 lynxton-partner-web-user\n' "$0" >&2
  exit 2
}

[ "$#" -ge 1 ] && [ "$#" -le 2 ] || usage
version=$1
image_name=${2:-lynxton-partner-web-user}
printf '%s' "$version" | grep -Eq '^[A-Za-z0-9_][A-Za-z0-9_.-]{0,127}$' || usage
[ "$version" != latest ] || usage

deploy_dir=$(cd "$(dirname "$0")" && pwd)
repo_root=$(cd "$deploy_dir/../.." && pwd)
output_dir=$deploy_dir/dist
output_file=$output_dir/lynxton-partner-web-user-$version.tar.gz
deploy_mode=${VITE_DEPLOY_MODE:-overseas}
case "$deploy_mode" in
  domestic|overseas) ;;
  *) printf 'VITE_DEPLOY_MODE must be domestic or overseas\n' >&2; exit 2 ;;
esac

registry=swr.ap-southeast-3.myhuaweicloud.com
registry_org=lynxtoncloud
registry_user='ap-southeast-3@HPUAE76NSJEZGWHQEEMX'
registry_password='b002a9d7cfa0a453f809dde967a67ae091768945d1e99dc637248cc768acfdaf'
registry_image=$registry/$registry_org/$image_name

mkdir -p "$output_dir"
tmp_file=$(mktemp "$output_dir/.package.XXXXXX")
trap 'rm -f "$tmp_file" "$tmp_file.gz"' EXIT HUP INT TERM

docker build \
  --build-arg "VITE_DEPLOY_MODE=$deploy_mode" \
  -t "$image_name:$version" \
  -t "$image_name:latest" \
  -f "$repo_root/web-user/Dockerfile" "$repo_root/web-user"
docker save -o "$tmp_file" "$image_name:$version" "$image_name:latest"
gzip -c "$tmp_file" > "$tmp_file.gz"
mv "$tmp_file.gz" "$output_file"

printf '%s' "$registry_password" | docker login "$registry" \
  -u "$registry_user" --password-stdin
docker tag "$image_name:$version" "$registry_image:$version"
docker tag "$image_name:latest" "$registry_image:latest"
docker push "$registry_image:$version"
docker push "$registry_image:latest"

printf 'Image: %s:%s and %s:latest\nPushed: %s:%s and %s:latest\nArchive: %s\n' \
  "$image_name" "$version" "$image_name" \
  "$registry_image" "$version" "$registry_image" \
  "$output_file"

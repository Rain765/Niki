#!/bin/zsh

# Preserve one release of content-hashed Next.js assets across an immutable
# runtime switch. Embedded browsers can retain the previous HTML briefly; if
# its referenced chunks disappear immediately, the otherwise healthy page
# becomes blank until the webview clears that HTML.

function snapshot_niki_static_assets() {
  local release_dir="$1"
  local static_dir="${release_dir}/apps/web/.next/static"
  local manifest="${release_dir}/.niki-static-assets"
  local manifest_tmp="${manifest}.tmp.$$"

  [[ -d "${static_dir}" ]] || return 0

  (
    cd "${static_dir}"
    /usr/bin/find . -type f -print | /usr/bin/sed 's#^\./##' | /usr/bin/sort
  ) > "${manifest_tmp}"
  /bin/mv -f "${manifest_tmp}" "${manifest}"
}

function carry_forward_niki_static_assets() {
  local previous_release="$1"
  local next_release="$2"
  local previous_static="${previous_release}/apps/web/.next/static"
  local next_static="${next_release}/apps/web/.next/static"
  local previous_manifest="${previous_release}/.niki-static-assets"
  local asset
  local source_asset
  local target_asset
  local copied=0
  local -a assets

  [[ -d "${previous_static}" && -d "${next_static}" ]] || return 0

  if [[ -s "${previous_manifest}" ]]; then
    assets=("${(@f)$(<"${previous_manifest}")}")
  else
    assets=("${(@f)$(cd "${previous_static}" && /usr/bin/find . -type f -print | /usr/bin/sed 's#^\./##')}")
  fi

  for asset in "${assets[@]}"; do
    [[ -n "${asset}" && "${asset}" != /* && "${asset}" != *../* ]] || continue
    source_asset="${previous_static}/${asset}"
    target_asset="${next_static}/${asset}"
    [[ -f "${source_asset}" && ! -e "${target_asset}" ]] || continue
    /bin/mkdir -p "${target_asset:h}"
    /bin/cp -p "${source_asset}" "${target_asset}"
    (( copied += 1 ))
  done

  if (( copied > 0 )); then
    print -r -- "[niki-deploy] retained ${copied} previous static asset(s) for cached clients"
  fi
}

#!/bin/zsh

# Keep the active runtime release and one rollback release, then remove older
# release worktrees from the dedicated immutable runtime store.
#
# This helper is sourced by the local niki-auth deploy script. The runtime
# store is intentionally separate from the repository, so all deletion is
# constrained to the caller-provided releases directory.

function prune_niki_runtime_releases() {
  local source_dir="$1"
  local releases_dir="$2"
  local current_release="$3"
  local previous_release="${4:-}"
  local release_path
  local release_real

  [[ -d "${releases_dir}" ]] || return 0

  for release_path in "${releases_dir}"/*; do
    [[ -d "${release_path}" && ! -L "${release_path}" ]] || continue

    release_real="$(cd "${release_path}" 2>/dev/null && /bin/pwd -P)" || {
      print -u2 -- "[niki-deploy] skipped unreadable release ${release_path}"
      continue
    }

    if [[ "${release_real}" == "${current_release}" ||
          ( -n "${previous_release}" && "${release_real}" == "${previous_release}" ) ]]; then
      continue
    fi

    case "${release_real}" in
      "${releases_dir}"/*) ;;
      *)
        print -u2 -- "[niki-deploy] skipped release outside store ${release_real}"
        continue
        ;;
    esac

    # The first Actions deployment uses a different Git checkout from earlier
    # manual releases. Never delete another checkout's registered worktree or
    # bypass Git's dirty/locked-worktree checks.
    if /usr/bin/git -C "${source_dir}" worktree remove "${release_real}" >/dev/null 2>&1; then
      print -r -- "[niki-deploy] removed old release ${release_real:t}"
      continue
    fi

    print -u2 -- "[niki-deploy] retained release for reviewed maintenance ${release_real:t}"
  done
}

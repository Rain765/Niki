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

    if /usr/bin/git -C "${source_dir}" worktree remove --force "${release_real}" >/dev/null 2>&1; then
      print -r -- "[niki-deploy] removed old release ${release_real:t}"
      continue
    fi

    # Older deploys may have left a plain checkout that is no longer registered
    # as a Git worktree. It is safe to remove only inside the dedicated release
    # store and only when it still looks like an Open Design checkout.
    if [[ -f "${release_real}/package.json" ]]; then
      if /bin/rm -rf -- "${release_real}"; then
        print -r -- "[niki-deploy] removed stale release ${release_real:t}"
      else
        print -u2 -- "[niki-deploy] failed to remove stale release ${release_real:t}"
      fi
    else
      print -u2 -- "[niki-deploy] skipped unknown release entry ${release_real:t}"
    fi
  done
}

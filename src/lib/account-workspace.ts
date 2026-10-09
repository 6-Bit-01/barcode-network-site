/** Account workspaces are private operator surfaces, independent of legacy admin access. */
export function isAccountWorkspace(pathname: string) {
  return /^\/account\/(?:owner|crew)(?:\/|$)/.test(pathname);
}

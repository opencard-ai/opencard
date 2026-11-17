/** Keep the advertising surface limited to published, indexable pages. */
export function isAdEligiblePath(pathname: string, englishGuideSlugs: readonly string[]): boolean {
  if (/^\/(en|zh|zh-cn|es)\/?$/.test(pathname)
    || /^\/en\/guides\/?$/.test(pathname)
    || /^\/(en|zh|zh-cn|es)\/(about|methodology)\/?$/.test(pathname)) {
    return true;
  }

  const guide = /^\/en\/guides\/([^/]+)\/?$/.exec(pathname);
  return guide !== null && englishGuideSlugs.includes(guide[1]);
}

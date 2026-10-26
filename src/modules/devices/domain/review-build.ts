/** An app build in store review, from the brand config. */
export interface ReviewBuild {
  readonly platform: string;
  readonly version: string;
}

/** Whether this call comes from a build in review: exact platform and version, nothing else. */
export function isReviewBuild(
  builds: readonly ReviewBuild[],
  platform: string,
  appVersion: string | null,
): boolean {
  if (appVersion === null) return false;
  const version = appVersion.trim();
  return builds.some((b) => b.platform === platform && b.version === version);
}

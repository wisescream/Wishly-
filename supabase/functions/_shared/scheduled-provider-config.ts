export function hasScheduledSearchProvider(input: {
  serpApiKey?: string | null;
  openRouterKey?: string | null;
  openRouterEnabled: boolean;
  tavilyKey?: string | null;
}): boolean {
  return Boolean(input.serpApiKey?.trim() || (input.openRouterEnabled && input.openRouterKey?.trim()) || input.tavilyKey?.trim());
}

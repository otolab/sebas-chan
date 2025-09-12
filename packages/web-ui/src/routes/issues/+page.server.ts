import type { PageServerLoad } from './$types';
import { ServerAPIClient } from '$lib/server/api';

export const load: PageServerLoad = async () => {
  const api = new ServerAPIClient();

  try {
    const issues = await api.getIssues();
    return {
      issues,
    };
  } catch (error) {
    console.error('Failed to load issues:', error);
    return {
      issues: [],
    };
  }
};

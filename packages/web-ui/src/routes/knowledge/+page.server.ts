import type { PageServerLoad } from './$types';
import { ServerAPIClient } from '$lib/server/api';

export const load: PageServerLoad = async ({ url }) => {
  const api = new ServerAPIClient();
  const query = url.searchParams.get('q') || undefined;

  try {
    const knowledge = await api.getKnowledge(query);
    return {
      knowledge,
    };
  } catch (error) {
    console.error('Failed to load knowledge:', error);
    return {
      knowledge: [],
    };
  }
};

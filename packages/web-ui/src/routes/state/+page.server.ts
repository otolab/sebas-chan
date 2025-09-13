import type { PageServerLoad } from './$types';
import { ServerAPIClient } from '$lib/server/api';

export const load: PageServerLoad = async () => {
  const api = new ServerAPIClient();

  try {
    const state = await api.getState();
    return {
      state,
    };
  } catch (error) {
    console.error('Failed to load state:', error);
    return {
      state: 'Error loading state document',
    };
  }
};

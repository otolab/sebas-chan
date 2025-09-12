import type { PageServerLoad } from './$types';
import { ServerAPIClient } from '$lib/server/api';
import { error } from '@sveltejs/kit';

export const load: PageServerLoad = async ({ params }) => {
  const api = new ServerAPIClient();
  
  try {
    const issue = await api.getIssueById(params.id);
    return {
      issue
    };
  } catch (e) {
    console.error('Failed to load issue:', e);
    throw error(404, 'Issue not found');
  }
};
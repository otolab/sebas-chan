<script lang="ts">
  import type { PageData } from './$types';
  
  let { data }: { data: PageData } = $props();
</script>

<div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
  <h1 class="text-2xl font-bold mb-6">Issues</h1>
  
  <div class="bg-white shadow overflow-hidden rounded-lg">
    {#if data.issues.length > 0}
      <div class="overflow-x-auto">
        <table class="min-w-full divide-y divide-gray-200">
          <thead class="bg-gray-50">
            <tr>
              <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">ID</th>
              <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Title</th>
              <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Labels</th>
              <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
              <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Updates</th>
              <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
            </tr>
          </thead>
          <tbody class="bg-white divide-y divide-gray-200">
            {#each data.issues as issue}
              <tr>
                <td class="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{issue.id}</td>
                <td class="px-6 py-4 text-sm text-gray-900">{issue.title}</td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  {issue.labels.join(', ') || 'None'}
                </td>
                <td class="px-6 py-4 whitespace-nowrap">
                  <span class="px-2 inline-flex text-xs leading-5 font-semibold rounded-full {issue.status === 'open' ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'}">
                    {issue.status}
                  </span>
                </td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                  {issue.updates.length} updates
                </td>
                <td class="px-6 py-4 whitespace-nowrap text-sm font-medium">
                  <a href="/issues/{issue.id}" class="text-indigo-600 hover:text-indigo-900">View</a>
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    {:else}
      <p class="px-6 py-4 text-sm text-gray-500">No issues available</p>
    {/if}
  </div>
</div>
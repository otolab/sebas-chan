<script lang="ts">
  import type { PageData } from './$types';

  let { data }: { data: PageData } = $props();
  let searchQuery = $state('');
  let knowledge = $state(data.knowledge);
  let isSearching = $state(false);

  async function searchKnowledge() {
    isSearching = true;
    try {
      const params = searchQuery ? `?q=${encodeURIComponent(searchQuery)}` : '';
      const response = await fetch(`/api/knowledge${params}`);
      if (response.ok) {
        const result = await response.json();
        knowledge = result.knowledge;
      }
    } catch (error) {
      console.error('Failed to search knowledge:', error);
    } finally {
      isSearching = false;
    }
  }

  function getTypeColor(type: string): string {
    switch (type) {
      case 'solution':
        return 'bg-green-100 text-green-800';
      case 'pattern':
        return 'bg-blue-100 text-blue-800';
      case 'factoid':
        return 'bg-gray-100 text-gray-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  }

</script>

<div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
  <div class="mb-6">
    <h1 class="text-2xl font-bold mb-4">Knowledge Base</h1>

    <div class="flex gap-2">
      <input
        type="text"
        bind:value={searchQuery}
        placeholder="Search knowledge..."
        class="flex-1 px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
        onkeypress={(e) => e.key === 'Enter' && searchKnowledge()}
      />
      <button
        onclick={searchKnowledge}
        disabled={isSearching}
        class="px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        {isSearching ? 'Searching...' : 'Search'}
      </button>
    </div>
  </div>

  <div class="space-y-4">
    {#if knowledge && knowledge.length > 0}
      {#each knowledge as item}
        <div class="bg-white shadow rounded-lg p-6">
          <div class="flex items-start justify-between mb-3">
            <div class="flex items-center gap-2">
              <span class={`px-2 py-1 rounded-full text-xs font-medium ${getTypeColor(item.type)}`}>
                {item.type}
              </span>
              <div class="flex items-center gap-4 text-sm text-gray-600">
                <span>=M {item.reputation.upvotes}</span>
                <span>=N {item.reputation.downvotes}</span>
              </div>
            </div>
          </div>

          <p class="text-gray-800 mb-3">{item.content}</p>

          {#if item.sources && item.sources.length > 0}
            <div class="text-sm text-gray-600">
              Sources: {item.sources.join(', ')}
            </div>
          {/if}
        </div>
      {/each}
    {:else}
      <div class="bg-white shadow rounded-lg p-6 text-center text-gray-500">
        No knowledge found. Try searching for something.
      </div>
    {/if}
  </div>
</div>
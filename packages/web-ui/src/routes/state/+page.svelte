<script lang="ts">
  import type { PageData } from './$types';

  let { data }: { data: PageData } = $props();
  let isRefreshing = $state(false);
  let currentState = $state(data.state);
  let lastUpdate = $state(data.lastUpdate);

  async function refreshState() {
    isRefreshing = true;
    try {
      const response = await fetch('/api/state');
      if (response.ok) {
        const result = await response.json();
        currentState = result.state;
        lastUpdate = result.lastUpdate;
      }
    } catch (error) {
      console.error('Failed to refresh state:', error);
    } finally {
      isRefreshing = false;
    }
  }

  function formatDate(date: Date | string | null): string {
    if (!date) return 'Never';
    const d = typeof date === 'string' ? new Date(date) : date;
    return new Intl.DateTimeFormat('ja-JP', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    }).format(d);
  }

  function formatStateContent(content: string): string {
    if (!content) return '';
    // Markdownっぽい内容を簡易的にフォーマット
    return content
      .split('\n')
      .map(line => {
        if (line.startsWith('## ')) {
          return `<div class="font-semibold text-lg mt-4 mb-2">${line.substring(3)}</div>`;
        }
        if (line.startsWith('- ')) {
          return `<div class="ml-4">• ${line.substring(2)}</div>`;
        }
        return line ? `<div>${line}</div>` : '<br/>';
      })
      .join('');
  }
</script>

<div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
  <div class="mb-6">
    <div class="flex justify-between items-center">
      <h1 class="text-2xl font-bold">System State</h1>
      <button
        onclick={refreshState}
        disabled={isRefreshing}
        class="px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        {isRefreshing ? 'Refreshing...' : 'Refresh'}
      </button>
    </div>
    <div class="text-sm text-gray-600 mt-2">
      Last Updated: {formatDate(lastUpdate)}
    </div>
  </div>

  <div class="bg-white shadow overflow-hidden rounded-lg">
    <div class="px-6 py-4">
      {#if currentState?.content}
        <div class="prose prose-sm max-w-none">
          {@html formatStateContent(currentState.content)}
        </div>
      {:else}
        <p class="text-gray-500 italic">No state information available</p>
      {/if}
    </div>
  </div>
</div>
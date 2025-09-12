<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { ServerAPIClient, type HealthStatus } from '$lib/api';

  let health: HealthStatus | null = null;
  let apiClient = new ServerAPIClient();
  let interval: NodeJS.Timeout;
  let hideTimeout: NodeJS.Timeout | null = null;
  let visible = true;

  async function checkHealth() {
    const prevReady = health?.ready;
    health = await apiClient.getHealth();
    
    // 初めて正常になった場合、20秒後に非表示にする
    if (health.ready && !prevReady) {
      // 既存のタイマーをクリア
      if (hideTimeout) clearTimeout(hideTimeout);
      
      // 20秒後に非表示
      hideTimeout = setTimeout(() => {
        visible = false;
      }, 20000);
    }
    
    // 異常になった場合は表示してタイマーをクリア
    if (!health.ready) {
      visible = true;
      if (hideTimeout) {
        clearTimeout(hideTimeout);
        hideTimeout = null;
      }
    }
  }

  onMount(() => {
    checkHealth();
    interval = setInterval(checkHealth, 5000); // 5秒ごとにチェック
  });

  onDestroy(() => {
    if (interval) clearInterval(interval);
    if (hideTimeout) clearTimeout(hideTimeout);
  });

  function getStatusColor(status: HealthStatus | null): string {
    // 接続なし、または準備未完了は赤
    if (!status || !status.ready) return 'bg-red-500';
    // すべて準備完了は緑
    return 'bg-green-500';
  }

  function getStatusText(status: HealthStatus | null): string {
    if (!status) return 'No Connection';
    if (status.ready) return 'Ready';
    if (status.engine === 'starting') return 'Starting...';
    return 'Not Ready';
  }
</script>

{#if visible}
  <div class="fixed bottom-4 right-4 bg-white rounded-lg shadow-lg p-4 z-50 transition-opacity duration-300" class:opacity-0={!visible}>
    <div class="flex items-center space-x-3">
      <div class="relative">
        <div 
          class="w-3 h-3 rounded-full {getStatusColor(health)}"
          title="Server Status"
        ></div>
        {#if health?.ready}
          <div class="absolute inset-0 rounded-full bg-green-400 animate-ping"></div>
        {/if}
      </div>
      
      <div class="text-sm">
        <div class="font-medium text-gray-900">
          Server: {getStatusText(health)}
        </div>
        {#if health}
          <div class="text-xs text-gray-500">
            Engine: {health.engine} | 
            DB: {health.database ? '✓' : '✗'} |
            Agent: {health.agent ? '✓' : '✗'}
          </div>
        {/if}
      </div>
    </div>
  </div>
{/if}

<style>
  @keyframes ping {
    0% {
      transform: scale(1);
      opacity: 1;
    }
    75%, 100% {
      transform: scale(2);
      opacity: 0;
    }
  }
  
  .animate-ping {
    animation: ping 2s cubic-bezier(0, 0, 0.2, 1) infinite;
  }
</style>
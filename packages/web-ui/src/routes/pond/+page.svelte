<script lang="ts">
  import type { PageData } from './$types';
  import type { PondEntry } from '@sebas-chan/shared-types';
  import { page } from '$app/stores';
  import { goto } from '$app/navigation';
  
  let { data }: { data: PageData } = $props();
  let expandedEntries = $state(new Set<string>());
  
  // URLパラメータから初期値を取得
  let searchQuery = $state(data.filters.q || '');
  let selectedSource = $state(data.filters.source || 'all');
  let dateFrom = $state(data.filters.dateFrom || '');
  let dateTo = $state(data.filters.dateTo || '');
  let displayLimit = $state(data.filters.limit || 20);
  
  // サーバーから取得したソース一覧を使用
  const sources = data.sources || [];
  
  // サーバーでフィルタリング済みのデータをそのまま使用
  const displayedEntries = $derived(() => data.pond);
  
  
  // フィルタの適用（サーバーサイドでの検索実行）
  async function applyFilters() {
    const params = new URLSearchParams();
    
    if (searchQuery) params.set('q', searchQuery);
    if (selectedSource && selectedSource !== 'all') params.set('source', selectedSource);
    if (dateFrom) params.set('dateFrom', dateFrom);
    if (dateTo) params.set('dateTo', dateTo);
    params.set('limit', displayLimit.toString());
    
    console.log('検索パラメータ:', {
      q: searchQuery,
      source: selectedSource,
      dateFrom,
      dateTo,
      limit: displayLimit
    });
    
    // URLを更新してサーバーサイドで再検索
    await goto(`/pond?${params.toString()}`, { invalidateAll: true });
  }
  
  // 検索フィールドでEnterキーが押されたときの処理
  function handleKeyPress(event: KeyboardEvent) {
    if (event.key === 'Enter') {
      applyFilters();
    }
  }
  
  function toggleExpanded(id: string) {
    const newSet = new Set(expandedEntries);
    if (newSet.has(id)) {
      newSet.delete(id);
    } else {
      newSet.add(id);
    }
    expandedEntries = newSet;
  }
  
  function formatDate(date: Date | string): string {
    const d = new Date(date);
    return d.toLocaleString('ja-JP', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  }
  
  function formatDateForInput(date: Date | string): string {
    const d = new Date(date);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
  
  function truncateContent(content: string, maxLength: number = 200): string {
    if (content.length <= maxLength) return content;
    return content.substring(0, maxLength) + '...';
  }
  
  // ページネーション
  function nextPage() {
    const currentOffset = data.filters.offset || 0;
    const params = new URLSearchParams($page.url.searchParams);
    params.set('offset', (currentOffset + displayLimit).toString());
    goto(`/pond?${params.toString()}`, { invalidateAll: true });
  }
  
  function prevPage() {
    const currentOffset = data.filters.offset || 0;
    const newOffset = Math.max(0, currentOffset - displayLimit);
    const params = new URLSearchParams($page.url.searchParams);
    params.set('offset', newOffset.toString());
    goto(`/pond?${params.toString()}`, { invalidateAll: true });
  }
</script>

<div class="container">
  <header>
    <h1>🏊 Pond - データプール</h1>
    <p class="description">システムに蓄積されたデータの検索と閲覧（ベクトル検索対応）</p>
  </header>
  
  <div class="filters">
    <div class="filter-row">
      <input 
        type="text" 
        bind:value={searchQuery}
        placeholder="検索キーワード（ベクトル検索）..."
        class="search-input"
        onkeypress={handleKeyPress}
      />
      <button onclick={applyFilters} class="search-button">
        🔍 検索
      </button>
      <div class="limit-group">
        <label>
          表示件数:
          <select bind:value={displayLimit} class="limit-select">
            <option value={10}>10件</option>
            <option value={20}>20件</option>
            <option value={50}>50件</option>
            <option value={100}>100件</option>
          </select>
        </label>
      </div>
    </div>
    
    <div class="filter-row">
      <select bind:value={selectedSource} class="source-select">
        <option value="all">すべてのソース</option>
        {#each sources as source}
          <option value={source}>{source}</option>
        {/each}
      </select>
      <div class="date-group">
        <label>
          開始日:
          <input 
            type="date" 
            bind:value={dateFrom}
            class="date-input"
          />
        </label>
        <label>
          終了日:
          <input 
            type="date" 
            bind:value={dateTo}
            class="date-input"
          />
        </label>
      </div>
    </div>
  </div>
  
  <div class="stats">
    <span>検索結果: {data.meta.total}件</span>
    <span>表示: {data.filters.offset + 1}-{Math.min(data.filters.offset + displayLimit, data.meta.total)}件</span>
  </div>
  
  <div class="entries">
    {#if displayedEntries().length === 0}
      <div class="no-data">
        <p>データが見つかりません</p>
      </div>
    {:else}
      {#each displayedEntries() as entry (entry.id)}
        <div class="entry-card">
          <div class="entry-header">
            <div class="entry-meta">
              <span class="entry-id">ID: {entry.id}</span>
              <span class="entry-source">{entry.source}</span>
              {#if entry.score !== undefined}
                <span class="entry-score" title="類似度スコア">
                  🎯 {(entry.score * 100).toFixed(1)}%
                </span>
              {/if}
              {#if entry.distance !== undefined}
                <span class="entry-distance" title="ベクトル距離">
                  📏 {entry.distance.toFixed(3)}
                </span>
              {/if}
              <span class="entry-timestamp">{formatDate(entry.timestamp)}</span>
            </div>
            <button 
              class="expand-button"
              onclick={() => toggleExpanded(entry.id)}
            >
              {expandedEntries.has(entry.id) ? '折りたたむ' : '展開'}
            </button>
          </div>
          
          <div class="entry-content">
            {#if expandedEntries.has(entry.id)}
              <pre>{entry.content}</pre>
            {:else}
              <p>{truncateContent(entry.content)}</p>
            {/if}
          </div>
          
          {#if entry.vector && expandedEntries.has(entry.id)}
            <div class="entry-vector">
              <details>
                <summary>ベクトル表現 (次元: {entry.vector.length})</summary>
                <pre>{JSON.stringify(entry.vector.slice(0, 10), null, 2)}...</pre>
              </details>
            </div>
          {/if}
        </div>
      {/each}
    {/if}
  </div>
  
  {#if data.meta.total > displayLimit}
    <div class="pagination">
      <button 
        onclick={prevPage} 
        disabled={data.filters.offset === 0}
        class="pagination-button"
      >
        ← 前のページ
      </button>
      <span class="page-info">
        ページ {Math.floor(data.filters.offset / displayLimit) + 1} / {Math.ceil(data.meta.total / displayLimit)}
      </span>
      <button 
        onclick={nextPage} 
        disabled={!data.meta.hasMore}
        class="pagination-button"
      >
        次のページ →
      </button>
    </div>
  {/if}
</div>

<style>
  .container {
    max-width: 1200px;
    margin: 0 auto;
    padding: 2rem;
  }
  
  header {
    margin-bottom: 2rem;
  }
  
  h1 {
    font-size: 2rem;
    margin-bottom: 0.5rem;
  }
  
  .description {
    color: #666;
    font-size: 1rem;
  }
  
  .filters {
    background: #f5f5f5;
    border-radius: 8px;
    padding: 1.5rem;
    margin-bottom: 2rem;
  }
  
  .filter-row {
    display: flex;
    gap: 1rem;
    align-items: center;
    margin-bottom: 1rem;
  }
  
  .filter-row:last-child {
    margin-bottom: 0;
  }
  
  .search-input {
    flex: 1;
    padding: 0.5rem;
    border: 1px solid #ddd;
    border-radius: 4px;
    font-size: 1rem;
  }
  
  .search-button {
    padding: 0.5rem 1rem;
    background: #007bff;
    color: white;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    font-size: 1rem;
  }
  
  .search-button:hover {
    background: #0056b3;
  }
  
  .source-select,
  .limit-select {
    padding: 0.5rem;
    border: 1px solid #ddd;
    border-radius: 4px;
    font-size: 1rem;
  }
  
  .date-group {
    display: flex;
    gap: 1rem;
    flex: 1;
  }
  
  .date-group label {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }
  
  .date-input {
    padding: 0.5rem;
    border: 1px solid #ddd;
    border-radius: 4px;
    font-size: 0.9rem;
  }
  
  .limit-group label {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }
  
  .stats {
    display: flex;
    justify-content: space-between;
    margin-bottom: 1rem;
    color: #666;
    font-size: 0.9rem;
  }
  
  .entries {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }
  
  .entry-card {
    background: white;
    border: 1px solid #ddd;
    border-radius: 8px;
    padding: 1rem;
  }
  
  .entry-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 1rem;
  }
  
  .entry-meta {
    display: flex;
    gap: 1rem;
    align-items: center;
  }
  
  .entry-id {
    font-family: monospace;
    font-size: 0.9rem;
    color: #666;
  }
  
  .entry-source {
    background: #e3f2fd;
    color: #1976d2;
    padding: 0.25rem 0.5rem;
    border-radius: 4px;
    font-size: 0.85rem;
    font-weight: 500;
  }
  
  .entry-score {
    background: #fff3cd;
    color: #856404;
    padding: 0.25rem 0.5rem;
    border-radius: 4px;
    font-size: 0.85rem;
    font-weight: 600;
  }
  
  .entry-distance {
    background: #f0f0f0;
    color: #666;
    padding: 0.25rem 0.5rem;
    border-radius: 4px;
    font-size: 0.85rem;
    font-weight: 500;
  }
  
  .entry-timestamp {
    color: #999;
    font-size: 0.85rem;
  }
  
  .expand-button {
    padding: 0.25rem 0.75rem;
    background: #f0f0f0;
    border: 1px solid #ddd;
    border-radius: 4px;
    cursor: pointer;
    font-size: 0.85rem;
  }
  
  .expand-button:hover {
    background: #e0e0e0;
  }
  
  .entry-content {
    margin-bottom: 0.5rem;
  }
  
  .entry-content p {
    margin: 0;
    line-height: 1.6;
  }
  
  .entry-content pre {
    background: #f5f5f5;
    padding: 1rem;
    border-radius: 4px;
    overflow-x: auto;
    white-space: pre-wrap;
    word-wrap: break-word;
    margin: 0;
  }
  
  .entry-vector {
    margin-top: 1rem;
    padding-top: 1rem;
    border-top: 1px solid #eee;
  }
  
  .entry-vector summary {
    cursor: pointer;
    color: #666;
    font-size: 0.9rem;
  }
  
  .entry-vector pre {
    margin-top: 0.5rem;
    background: #f5f5f5;
    padding: 0.5rem;
    border-radius: 4px;
    font-size: 0.8rem;
  }
  
  .no-data {
    text-align: center;
    padding: 3rem;
    color: #999;
  }
  
  .pagination {
    display: flex;
    justify-content: center;
    align-items: center;
    gap: 1rem;
    margin-top: 2rem;
    padding-top: 2rem;
    border-top: 1px solid #eee;
  }
  
  .pagination-button {
    padding: 0.5rem 1rem;
    background: #007bff;
    color: white;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    font-size: 0.9rem;
  }
  
  .pagination-button:hover:not(:disabled) {
    background: #0056b3;
  }
  
  .pagination-button:disabled {
    background: #ccc;
    cursor: not-allowed;
  }
  
  .page-info {
    color: #666;
    font-size: 0.9rem;
  }
</style>
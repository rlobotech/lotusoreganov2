<script lang="ts">
  import { api, ApiError } from './api.ts';
  import { session } from './session.svelte.ts';

  const RACES = ['human', 'elf', 'dwarf', 'orc'];
  const CLASSES = ['warrior', 'mage', 'priest', 'ranger'];

  let name = $state('The Wanderers');
  let mode = $state<'standard' | 'hardcore'>('standard');
  let members = $state([
    { name: 'Brann', race: 'dwarf', cls: 'warrior' },
    { name: 'Lyra', race: 'elf', cls: 'mage' },
    { name: 'Odo', race: 'human', cls: 'priest' },
    { name: 'Kesh', race: 'orc', cls: 'ranger' },
  ]);
  let busy = $state(false);
  let error = $state('');

  const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

  async function submit(e: Event) {
    e.preventDefault();
    busy = true;
    error = '';
    try {
      const { party } = await api.createParty({ name, mode, members });
      session.party = party;
    } catch (err) {
      error = err instanceof ApiError ? err.message : 'Could not reach the server.';
    } finally {
      busy = false;
    }
  }
</script>

<form class="create" onsubmit={submit}>
  <h2>Form your party</h2>
  <p class="muted">
    Your party hunts, explores and fights on its own, even while you are away. Choose 2 to 6
    adventurers.
  </p>
  <label>
    Party name
    <input type="text" bind:value={name} minlength="2" maxlength="30" required />
  </label>

  <div class="modes">
    <label class="mode" class:on={mode === 'standard'}>
      <input type="radio" bind:group={mode} value="standard" /> Standard
      <span class="muted">Defeat costs gold and time.</span>
    </label>
    <label class="mode" class:on={mode === 'hardcore'}>
      <input type="radio" bind:group={mode} value="hardcore" /> Hardcore
      <span class="muted">If everyone falls, the party is lost for good.</span>
    </label>
  </div>

  {#each members as m, i}
    <div class="member">
      <input type="text" bind:value={m.name} maxlength="20" required aria-label="Name" />
      <select bind:value={m.race} aria-label="Race">
        {#each RACES as r}<option value={r}>{cap(r)}</option>{/each}
      </select>
      <select bind:value={m.cls} aria-label="Class">
        {#each CLASSES as c}<option value={c}>{cap(c)}</option>{/each}
      </select>
      <button
        type="button"
        disabled={members.length <= 2}
        onclick={() => members.splice(i, 1)}
        aria-label="Remove"
      >
        &times;
      </button>
    </div>
  {/each}
  <button
    type="button"
    disabled={members.length >= 6}
    onclick={() =>
      members.push({ name: `Hero ${members.length + 1}`, race: 'human', cls: 'warrior' })}
  >
    Add adventurer
  </button>

  {#if error}<p class="error">{error}</p>{/if}
  <button class="primary" type="submit" disabled={busy}>
    {busy ? 'Setting out...' : 'Begin the journey'}
  </button>
</form>

<style>
  .create {
    display: flex;
    flex-direction: column;
    gap: 12px;
    max-width: 560px;
    margin: 2vh auto 0;
    padding: 20px;
    background: var(--panel);
    border: 1px solid var(--line);
    border-radius: 10px;
  }
  .muted {
    color: var(--muted);
    font-size: 13px;
    margin: 0;
  }
  label {
    display: flex;
    flex-direction: column;
    gap: 4px;
    font-size: 14px;
    color: var(--muted);
  }
  label input[type='text'] {
    color: var(--text);
    font-size: 16px;
  }
  .modes {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px;
  }
  .mode {
    flex-direction: row;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px;
    padding: 10px;
    border: 1px solid var(--line);
    border-radius: 8px;
    color: var(--text);
    cursor: pointer;
  }
  .mode.on {
    border-color: var(--gold);
  }
  .member {
    display: grid;
    grid-template-columns: 1fr 100px 100px 44px;
    gap: 6px;
  }
  select {
    font: inherit;
    color: var(--text);
    background: var(--panel-2);
    border: 1px solid var(--line);
    border-radius: 6px;
    min-height: 44px;
    padding: 0 6px;
  }
  .error {
    color: #ff8a8a;
    margin: 0;
    font-size: 14px;
  }
  @media (max-width: 480px) {
    .member {
      grid-template-columns: 1fr 1fr 44px;
    }
    .member input {
      grid-column: 1 / -1;
    }
  }
</style>

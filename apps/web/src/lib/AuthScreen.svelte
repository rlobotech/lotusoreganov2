<script lang="ts">
  import { api, ApiError } from './api.ts';
  import { signedIn } from './session.svelte.ts';

  let mode = $state<'login' | 'register'>('login');
  let email = $state('');
  let username = $state('');
  let password = $state('');
  let inviteCode = $state('');
  let busy = $state(false);
  let error = $state('');

  async function submit(e: Event) {
    e.preventDefault();
    busy = true;
    error = '';
    try {
      const { user } =
        mode === 'login'
          ? await api.login({ email, password })
          : await api.register({ email, username, password, inviteCode });
      await signedIn(user);
    } catch (err) {
      error =
        err instanceof ApiError
          ? err.code === 'invalid_input'
            ? 'Please check the fields: username 3-20 letters/numbers, password at least 10 characters.'
            : err.message
          : 'Could not reach the server.';
    } finally {
      busy = false;
    }
  }
</script>

<form class="auth" onsubmit={submit}>
  <h2>{mode === 'login' ? 'Welcome back' : 'Join the beta'}</h2>
  <label>
    Email
    <input type="text" inputmode="email" autocomplete="email" bind:value={email} required />
  </label>
  {#if mode === 'register'}
    <label>
      Username
      <input
        type="text"
        autocomplete="username"
        bind:value={username}
        required
        minlength="3"
        maxlength="20"
      />
    </label>
  {/if}
  <label>
    Password
    <input
      type="password"
      autocomplete={mode === 'login' ? 'current-password' : 'new-password'}
      bind:value={password}
      required
    />
  </label>
  {#if mode === 'register'}
    <label>
      Invite code
      <input type="text" autocapitalize="characters" bind:value={inviteCode} required />
    </label>
  {/if}
  {#if error}<p class="error">{error}</p>{/if}
  <button class="primary" type="submit" disabled={busy}>
    {busy ? 'One moment...' : mode === 'login' ? 'Log in' : 'Create account'}
  </button>
  <button
    type="button"
    class="link"
    onclick={() => (mode = mode === 'login' ? 'register' : 'login')}
  >
    {mode === 'login' ? 'I have an invite code' : 'I already have an account'}
  </button>
</form>

<style>
  .auth {
    display: flex;
    flex-direction: column;
    gap: 12px;
    max-width: 380px;
    margin: 6vh auto 0;
    padding: 20px;
    background: var(--panel);
    border: 1px solid var(--line);
    border-radius: 10px;
  }
  label {
    display: flex;
    flex-direction: column;
    gap: 4px;
    font-size: 14px;
    color: var(--muted);
  }
  label input {
    color: var(--text);
    font-size: 16px;
  }
  .error {
    margin: 0;
    color: #ff8a8a;
    font-size: 14px;
  }
  .link {
    background: none;
    border: none;
    color: var(--muted);
    text-decoration: underline;
  }
</style>

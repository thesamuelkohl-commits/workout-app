/* Passcode screen.
 *
 * Scope, stated plainly: this is a privacy screen, not security. Everything
 * runs in the browser, so anyone who opens devtools can skip it or read
 * localStorage directly. It stops someone picking up an unlocked phone and
 * poking around; it does not protect the data from someone who wants in.
 *
 * The passcode is stored as a salted SHA-256 hash rather than in the clear,
 * because this repo is public and the code is the kind of thing people reuse.
 * The hash doesn't make the gate stronger — it keeps the literal passcode off
 * GitHub.
 */
const Lock = (() => {
  const SALT = '34fce0055d198fef7e9647ed89f3b4e4';
  const HASH = 'cf956dda2ca84e8c243c09b2847e56eacec3a490b3bff476dd57371016c9e799';

  // Unlock lives in sessionStorage, so closing the app re-locks it while
  // moving around inside one session doesn't re-prompt.
  const SESSION_KEY = 'workoutTrackerUnlocked_v1';

  async function sha256(text) {
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
    return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
  }

  async function verify(passcode) {
    return (await sha256(`${SALT}:${passcode}`)) === HASH;
  }

  function markUnlocked() {
    try {
      sessionStorage.setItem(SESSION_KEY, '1');
    } catch (e) {
      /* private mode - just re-prompt on the next load */
    }
  }

  function isUnlockedThisSession() {
    try {
      return sessionStorage.getItem(SESSION_KEY) === '1';
    } catch (e) {
      return false;
    }
  }

  function lockNow() {
    try {
      sessionStorage.removeItem(SESSION_KEY);
    } catch (e) {
      /* nothing to clear */
    }
    window.location.reload();
  }

  function screen(onDone) {
    const host = document.createElement('div');
    host.className = 'lock-screen';
    host.innerHTML = `
      <div class="lock-card">
        <div class="lock-mark">&#128170;</div>
        <h2 class="lock-title">Melanie's Workouts</h2>
        <p class="lock-sub">Enter your passcode to continue.</p>
        <form class="lock-form" novalidate>
          <input class="lock-input" type="password" inputmode="numeric" autocomplete="current-password"
                 placeholder="Passcode" aria-label="Passcode" />
          <div class="lock-error" role="alert" aria-live="polite"></div>
          <button class="btn lock-submit" type="submit">Unlock</button>
        </form>
      </div>
    `;
    document.body.appendChild(host);

    const form = host.querySelector('.lock-form');
    const input = host.querySelector('.lock-input');
    const errorEl = host.querySelector('.lock-error');
    const card = host.querySelector('.lock-card');

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      errorEl.textContent = '';
      if (await verify(input.value)) {
        markUnlocked();
        host.remove();
        onDone();
        return;
      }
      input.value = '';
      input.focus();
      errorEl.textContent = 'Wrong passcode.';
      card.classList.remove('shake');
      void card.offsetWidth; // reflow, so the shake replays on a second miss
      card.classList.add('shake');
    });

    setTimeout(() => input.focus(), 50);
  }

  // Runs before the app renders; calls onUnlocked() once the user may proceed.
  function guard(onUnlocked) {
    if (isUnlockedThisSession()) return onUnlocked();
    screen(onUnlocked);
  }

  return { guard, lockNow, isUnlockedThisSession };
})();

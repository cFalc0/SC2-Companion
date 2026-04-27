/**
 * SC2 Companion — main application controller.
 *
 * States:
 *   'race-select'  → pick opponent race
 *   'standby'      → waiting for SPACE to start the game
 *   'coaching'     → timer running, cues firing
 */
const App = (() => {
  let state        = 'race-select';
  let selectedRace = null;
  const engine     = new CoachEngine();

  // ── DOM references ──────────────────────────────────────────────────
  const $ = id => document.getElementById(id);

  const el = {
    // Panels
    raceSelect:     $('state-race-select'),
    standby:        $('state-standby'),
    coaching:       $('state-coaching'),
    settingsPanel:  $('settings-panel'),
    // Standby
    standbyBadge:   $('standby-race-badge'),
    // Coaching
    matchLabel:     $('match-label'),
    timerDisplay:   $('timer-display'),
    timerMin:       $('timer-min'),
    timerSec:       $('timer-sec'),
    timerSub:       $('timer-sub'),
    nextCueCard:    $('next-cue-card'),
    nextCueText:    $('next-cue-text'),
    nextCueTime:    $('next-cue-time'),
    activeCueCard:  $('active-cue-card'),
    activeCueText:  $('active-cue-text'),
    logList:        $('log-list'),
    logCount:       $('log-count'),
    // Settings inputs
    apiKey:         $('api-key'),
    voiceId:        $('voice-id'),
    volume:         $('volume'),
    volumeLabel:    $('volume-label'),
    ttsEnabled:     $('tts-enabled'),
    // Status
    statusBar:      $('status-bar'),
    statusText:     $('status-text'),
  };

  // ── Settings ─────────────────────────────────────────────────────────
  function loadSettings() {
    const s = JSON.parse(localStorage.getItem('sc2c-settings') || '{}');
    el.apiKey.value        = s.apiKey    || '';
    el.voiceId.value       = s.voiceId   || '';
    el.volume.value        = s.volume    ?? 0.8;
    el.ttsEnabled.checked  = s.ttsEnabled !== false;
    el.volumeLabel.textContent = Math.round((s.volume ?? 0.8) * 100) + '%';
    applySettingsToTTS(s);
  }

  function applySettingsToTTS(s) {
    tts.configure({
      apiKey:  s.apiKey  || '',
      voiceId: s.voiceId || '',
      enabled: s.ttsEnabled !== false,
      volume:  s.volume ?? 0.8,
    });
  }

  function saveSettings() {
    const s = {
      apiKey:     el.apiKey.value.trim(),
      voiceId:    el.voiceId.value.trim(),
      volume:     parseFloat(el.volume.value),
      ttsEnabled: el.ttsEnabled.checked,
    };
    localStorage.setItem('sc2c-settings', JSON.stringify(s));
    applySettingsToTTS(s);
    closeSettings();
    toast('Settings saved');
  }

  function openSettings()  { el.settingsPanel.classList.remove('hidden'); }
  function closeSettings() { el.settingsPanel.classList.add('hidden'); }

  // ── State transitions ─────────────────────────────────────────────────
  function goRaceSelect() {
    state = 'race-select';
    engine.reset();
    show(el.raceSelect);
    hide(el.standby, el.coaching);
  }

  function goStandby(race) {
    selectedRace = race;
    state = 'standby';

    const labels = {
      zvt: 'ZvT — vs Terran',
      zvp: 'ZvP — vs Protoss',
      zvz: 'ZvZ — vs Zerg',
      zvrandom: 'ZvR — vs Random',
    };
    el.standbyBadge.textContent = labels[race] || race.toUpperCase();

    show(el.standby);
    hide(el.raceSelect, el.coaching);
  }

  async function goCoaching() {
    // Load matchup JSON
    let data;
    try {
      const res = await fetch(`data/${selectedRace}.json`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      data = await res.json();
    } catch (err) {
      toast(`Could not load matchup data (${err.message})`);
      goRaceSelect();
      return;
    }

    // Reset UI
    el.logList.innerHTML = '';
    el.logCount.textContent = '';
    el.activeCueCard.classList.add('hidden');
    el.timerDisplay.classList.remove('paused', 'urgent');

    el.matchLabel.textContent = data.label || selectedRace.toUpperCase();

    engine.load(data.cues);
    engine.start();

    state = 'coaching';
    show(el.coaching);
    hide(el.standby, el.raceSelect);

    updateNextCue();
  }

  // ── Engine callbacks ──────────────────────────────────────────────────
  engine.onTick = (elapsed) => {
    renderTimer(elapsed);
    const next = engine.nextCue();
    if (next) {
      const gap = next.time - elapsed;
      el.timerDisplay.classList.toggle('urgent', gap <= 5 && gap > 0);
    } else {
      el.timerDisplay.classList.remove('urgent');
    }
    updateNextCue();
  };

  engine.onCue = (cue) => {
    tts.speak(cue.message);
    showActiveCue(cue);
    appendLog(cue);
    updateNextCue();
  };

  // ── Timer UI ──────────────────────────────────────────────────────────
  function renderTimer(secs) {
    el.timerMin.textContent = Math.floor(secs / 60);
    el.timerSec.textContent = String(secs % 60).padStart(2, '0');
  }

  function togglePause() {
    if (engine.running) {
      engine.pause();
      el.timerDisplay.classList.add('paused');
      el.timerSub.innerHTML = 'Paused — press <kbd>SPACE</kbd> to resume';
    } else {
      engine.start();
      el.timerDisplay.classList.remove('paused');
      el.timerSub.innerHTML = 'Press <kbd>SPACE</kbd> to pause';
    }
  }

  // ── Cue display ───────────────────────────────────────────────────────
  function updateNextCue() {
    const next = engine.nextCue();
    if (!next) {
      el.nextCueText.textContent = 'All cues complete';
      el.nextCueTime.textContent = '';
      return;
    }
    const remaining = next.time - engine.elapsed;
    el.nextCueText.textContent = next.message;
    el.nextCueTime.textContent = remaining > 0
      ? `at ${fmt(next.time)} — in ${fmt(remaining)}`
      : `at ${fmt(next.time)}`;
  }

  let _activeCueTimer = null;
  function showActiveCue(cue) {
    el.activeCueText.textContent = cue.message;
    el.activeCueCard.classList.remove('hidden');
    clearTimeout(_activeCueTimer);
    _activeCueTimer = setTimeout(() => el.activeCueCard.classList.add('hidden'), 9000);
  }

  function appendLog(cue) {
    const li = document.createElement('li');
    li.className = 'log-item fresh';
    li.innerHTML = `<span class="log-time">${fmt(engine.elapsed)}</span><span class="log-msg">${cue.message}</span>`;
    el.logList.prepend(li);
    setTimeout(() => li.classList.remove('fresh'), 2500);
    el.logCount.textContent = `(${el.logList.children.length})`;
  }

  // ── Helpers ───────────────────────────────────────────────────────────
  function fmt(secs) {
    const m = Math.floor(Math.abs(secs) / 60);
    const s = Math.abs(secs) % 60;
    return `${m}:${String(s).padStart(2, '0')}`;
  }

  let _toastTimer = null;
  function toast(msg, duration = 2800) {
    el.statusText.textContent = msg;
    el.statusBar.classList.remove('hidden');
    clearTimeout(_toastTimer);
    _toastTimer = setTimeout(() => el.statusBar.classList.add('hidden'), duration);
  }

  function show(...elems) { elems.forEach(e => e.classList.remove('hidden')); }
  function hide(...elems) { elems.forEach(e => e.classList.add('hidden'));    }

  // ── Event wiring ──────────────────────────────────────────────────────
  function init() {
    loadSettings();

    // Race buttons
    document.querySelectorAll('.race-btn').forEach(btn => {
      btn.addEventListener('click', () => goStandby(btn.dataset.race));
    });

    // Standby: click anywhere on the panel (except the Cancel button) to start
    el.standby.addEventListener('click', (e) => {
      if (e.target.closest('#cancel-btn')) return;
      if (state === 'standby') goCoaching();
    });

    $('cancel-btn').addEventListener('click', goRaceSelect);
    $('back-btn').addEventListener('click', () => { engine.reset(); goRaceSelect(); });

    // Settings
    $('settings-btn').addEventListener('click', openSettings);
    $('settings-close').addEventListener('click', closeSettings);
    $('save-settings').addEventListener('click', saveSettings);
    $('test-voice-btn').addEventListener('click', () => tts.speak('Spawn more overlords.'));

    // Volume live preview
    el.volume.addEventListener('input', () => {
      el.volumeLabel.textContent = Math.round(el.volume.value * 100) + '%';
    });

    // Spacebar — global handler
    document.addEventListener('keydown', (e) => {
      if (e.code !== 'Space') return;
      // Don't hijack space when typing in an input
      if (['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName)) return;
      e.preventDefault();

      if (state === 'standby') {
        goCoaching();
      } else if (state === 'coaching') {
        togglePause();
      }
    });
  }

  return { init };
})();

document.addEventListener('DOMContentLoaded', App.init);

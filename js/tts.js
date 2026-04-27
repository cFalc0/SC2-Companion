/**
 * TTS — text-to-speech wrapper.
 * Uses ElevenLabs when an API key + voice ID are configured,
 * falls back to the browser's Web Speech API otherwise.
 * Audio is cached in memory so each unique phrase is only fetched once.
 */
class TTS {
  constructor() {
    this.apiKey  = '';
    this.voiceId = '';
    this.enabled = true;
    this.volume  = 0.8;
    this._cache  = new Map();  // text → blob URL
    this._queue  = [];
    this._busy   = false;
  }

  configure({ apiKey = '', voiceId = '', enabled = true, volume = 0.8 } = {}) {
    this.apiKey  = apiKey;
    this.voiceId = voiceId;
    this.enabled = enabled;
    this.volume  = volume;
  }

  speak(text) {
    if (!this.enabled || !text) return;
    this._queue.push(text);
    if (!this._busy) this._drain();
  }

  async _drain() {
    if (!this._queue.length) { this._busy = false; return; }
    this._busy = true;
    const text = this._queue.shift();
    try {
      await this._playText(text);
    } catch (err) {
      console.warn('[TTS] playback error:', err);
    }
    this._drain();
  }

  async _playText(text) {
    if (this.apiKey && this.voiceId) {
      return this._playElevenLabs(text);
    }
    return this._playNative(text);
  }

  async _playElevenLabs(text) {
    let url = this._cache.get(text);
    if (!url) {
      const buf = await this._fetchElevenLabs(text);
      const blob = new Blob([buf], { type: 'audio/mpeg' });
      url = URL.createObjectURL(blob);
      this._cache.set(text, url);
    }
    return this._playURL(url);
  }

  async _fetchElevenLabs(text) {
    const res = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${this.voiceId}`,
      {
        method: 'POST',
        headers: {
          'xi-api-key':   this.apiKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          text,
          model_id: 'eleven_multilingual_v2',
          voice_settings: { stability: 0.45, similarity_boost: 0.75 },
        }),
      }
    );
    if (!res.ok) throw new Error(`ElevenLabs HTTP ${res.status}`);
    return res.arrayBuffer();
  }

  _playURL(url) {
    return new Promise((resolve) => {
      const audio = new Audio(url);
      audio.volume  = this.volume;
      audio.onended = resolve;
      audio.onerror = resolve;
      audio.play().catch(resolve);
    });
  }

  _playNative(text) {
    return new Promise((resolve) => {
      if (!window.speechSynthesis) return resolve();
      // Cancel any stale utterances before speaking
      speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.volume = this.volume;
      u.rate   = 1.05;
      u.onend  = resolve;
      u.onerror = resolve;
      speechSynthesis.speak(u);
    });
  }
}

const tts = new TTS();

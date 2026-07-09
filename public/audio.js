const AudioFX = (() => {
  let ctx = null
  let master = null
  let sfxBus = null
  let musicEl = null
  let musicWanted = false
  let noiseBuffer = null

  const settings = Object.assign(
    { music: 35, sfx: 70, muted: false },
    JSON.parse(localStorage.getItem("md-audio") || "{}")
  )

  function save() {
    localStorage.setItem("md-audio", JSON.stringify(settings))
  }

  function ensure() {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext
      if (!AC) return null
      ctx = new AC()
      master = ctx.createGain()
      master.connect(ctx.destination)
      sfxBus = ctx.createGain()
      sfxBus.connect(master)
      apply()
    }
    return ctx
  }

  function apply() {
    if (musicEl) musicEl.volume = settings.muted ? 0 : settings.music / 100
    if (!ctx) return
    sfxBus.gain.value = (settings.sfx / 100) * 0.9
    master.gain.value = settings.muted ? 0 : 1
  }

  const SILENT_WAV = "data:audio/wav;base64,UklGRiwAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQgAAACAgICAgICAgA=="
  let mediaKick = null

  function kickMediaSession() {
    if (mediaKick) return
    mediaKick = new Audio(SILENT_WAV)
    mediaKick.loop = true
    mediaKick.volume = 0.01
    const attempt = mediaKick.play()
    if (attempt) attempt.catch(() => { mediaKick = null })
  }

  function maybeStartMusic() {
    if (!musicWanted) return
    if (!musicEl) {
      musicEl = new Audio("lounge.m4a")
      musicEl.loop = true
      musicEl.preload = "auto"
    }
    apply()
    if (musicEl.paused) {
      const attempt = musicEl.play()
      if (attempt) attempt.catch(() => {})
    }
  }

  function unlock() {
    if (!ensure()) return
    kickMediaSession()
    if (ctx.state === "suspended") ctx.resume().catch(() => {})
    maybeStartMusic()
  }

  document.addEventListener("pointerdown", unlock)
  document.addEventListener("keydown", unlock)

  function tone(bus, type, freq, t, attack, peak, decay, glideTo) {
    const osc = ctx.createOscillator()
    osc.type = type
    osc.frequency.setValueAtTime(freq, t)
    if (glideTo) osc.frequency.exponentialRampToValueAtTime(glideTo, t + attack + decay)
    const gain = ctx.createGain()
    gain.gain.setValueAtTime(0.0001, t)
    gain.gain.linearRampToValueAtTime(peak, t + attack)
    gain.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay)
    osc.connect(gain)
    gain.connect(bus)
    osc.start(t)
    osc.stop(t + attack + decay + 0.1)
  }

  function noiseBurst(t, dur, peak, freqFrom, freqTo, filterType) {
    if (!noiseBuffer) {
      noiseBuffer = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate)
      const data = noiseBuffer.getChannelData(0)
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1
    }
    const src = ctx.createBufferSource()
    src.buffer = noiseBuffer
    src.loop = true
    const filter = ctx.createBiquadFilter()
    filter.type = filterType || "bandpass"
    filter.frequency.setValueAtTime(freqFrom, t)
    filter.frequency.exponentialRampToValueAtTime(freqTo, t + dur)
    const gain = ctx.createGain()
    gain.gain.setValueAtTime(0.0001, t)
    gain.gain.linearRampToValueAtTime(peak, t + dur * 0.2)
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur)
    src.connect(filter)
    filter.connect(gain)
    gain.connect(sfxBus)
    src.start(t)
    src.stop(t + dur + 0.05)
  }


  function ready() {
    return ctx && ctx.state === "running" && !settings.muted
  }

  const now = () => ctx.currentTime + 0.02

  const sfx = {
    tick() {
      if (!ready()) return
      noiseBurst(now(), 0.06, 0.12, 2500, 5500, "highpass")
    },
    coin() {
      if (!ready()) return
      const t = now()
      tone(sfxBus, "square", 1568, t, 0.01, 0.06, 0.18)
      tone(sfxBus, "square", 2093, t + 0.08, 0.01, 0.06, 0.25)
    },
    chaching() {
      if (!ready()) return
      const t = now()
      noiseBurst(t, 0.1, 0.1, 4000, 8000, "highpass")
      tone(sfxBus, "square", 1318, t + 0.05, 0.01, 0.07, 0.2)
      tone(sfxBus, "square", 2093, t + 0.14, 0.01, 0.08, 0.4)
    },
    thock() {
      if (!ready()) return
      const t = now()
      tone(sfxBus, "sine", 220, t, 0.005, 0.25, 0.12, 140)
      noiseBurst(t, 0.05, 0.08, 800, 300, "lowpass")
    },
    whoosh() {
      if (!ready()) return
      const t = now()
      noiseBurst(t, 0.4, 0.35, 350, 2800, "bandpass")
    },
    no() {
      if (!ready()) return
      const t = now()
      tone(sfxBus, "sawtooth", 180, t, 0.01, 0.3, 0.35, 70)
      noiseBurst(t, 0.15, 0.2, 400, 120, "lowpass")
    },
    boom() {
      if (!ready()) return
      const t = now()
      tone(sfxBus, "sine", 95, t, 0.01, 0.55, 0.7, 36)
      noiseBurst(t, 0.5, 0.3, 300, 60, "lowpass")
    },
    arp() {
      if (!ready()) return
      const t = now()
      const notes = [523.25, 659.25, 783.99]
      notes.forEach((f, i) => tone(sfxBus, "triangle", f, t + i * 0.09, 0.01, 0.12, 0.22))
    },
    chime() {
      if (!ready()) return
      const t = now()
      tone(sfxBus, "sine", 659.25, t, 0.01, 0.12, 0.5)
      tone(sfxBus, "sine", 987.77, t + 0.1, 0.01, 0.1, 0.7)
    },
    horn() {
      if (!ready()) return
      const t = now()
      tone(sfxBus, "sawtooth", 349, t, 0.03, 0.15, 0.4, 523)
      tone(sfxBus, "sawtooth", 352, t, 0.03, 0.1, 0.4, 527)
    },
    fanfare() {
      if (!ready()) return
      const t = now()
      const notes = [523.25, 659.25, 783.99, 1046.5]
      notes.forEach((f, i) => tone(sfxBus, "triangle", f, t + i * 0.13, 0.01, 0.16, 0.5))
      tone(sfxBus, "triangle", 1318.5, t + 0.55, 0.02, 0.18, 1.2)
    }
  }

  return {
    settings,
    sfx,
    debug() {
      return {
        ctxState: ctx ? ctx.state : "no-context",
        musicWanted,
        musicPlaying: !!(musicEl && !musicEl.paused),
        musicVolume: musicEl ? musicEl.volume : null,
        masterGain: master ? master.gain.value : null
      }
    },
    meter() {
      if (!ctx || !master) return Promise.resolve(-1)
      const analyser = ctx.createAnalyser()
      analyser.fftSize = 2048
      master.connect(analyser)
      const data = new Float32Array(analyser.fftSize)
      return new Promise((resolve) => {
        setTimeout(() => {
          analyser.getFloatTimeDomainData(data)
          master.disconnect(analyser)
          let sum = 0
          for (const v of data) sum += v * v
          resolve(Math.sqrt(sum / data.length))
        }, 400)
      })
    },
    startMusic() {
      musicWanted = true
      unlock()
    },
    setMusic(v) {
      settings.music = v
      save()
      apply()
    },
    setSfx(v) {
      settings.sfx = v
      save()
      apply()
    },
    toggleMute() {
      settings.muted = !settings.muted
      save()
      apply()
      return settings.muted
    }
  }
})()

<template>
  <div id="app">
    <div class="app-background"></div>

    <!-- PLAYING VIEW -->
    <div
      v-if="playerData.playing"
      class="now-playing"
      :class="getNowPlayingClass()"
    >
      <div class="now-playing__cover">
        <img
          :src="playerData.trackAlbum.image"
          :alt="playerData.trackTitle"
          class="now-playing__image"
        />
      </div>

      <div class="now-playing__details">
        <h1 class="now-playing__track">{{ playerData.trackTitle }}</h1>

        <h2 class="now-playing__artists">
          {{ playerData.trackArtists.join(', ') }}
        </h2>

        <!-- ⭐ Progress Bar -->
        <div class="now-playing__progress">
          <div
            class="now-playing__progress-fill"
            :style="{ width: progressPercent + '%' }"
          ></div>
        </div>

        <!-- ⭐ Spectrum Visualizer -->
        <div class="now-playing__spectrum">
          <div class="bar" v-for="n in 24" :key="n" :style="{ '--i': n }"></div>
        </div>
      </div>
    </div>

    <!-- SCREENSAVER VIEW -->
    <div v-else-if="idle" class="screensaver">
      <div class="screensaver__bg" :style="circadianGradient"></div>

      <div class="screensaver__clock-container" :style="clockPosition">
        <div class="screensaver__clock">
          <div class="screensaver__time">{{ time }}</div>
          <div class="screensaver__date">{{ date }}</div>
        </div>
      </div>
    </div>

    <!-- IDLE VIEW -->
    <div v-else class="now-playing now-playing--idle">
      <h1 class="now-playing__idle-heading">No music is playing 😔</h1>
    </div>
  </div>
</template>

<script>
import props from '@/utils/props.js'
import * as Vibrant from 'node-vibrant'

export default {
  name: 'NowPlaying',

  props: {
    auth: props.auth,
    endpoints: props.endpoints,
    player: props.player
  },

  data() {
    return {
      pollPlaying: null,
      playerResponse: {},
      playerData: {
        playing: false,
        trackAlbum: {},
        trackArtists: [],
        trackId: '',
        trackTitle: ''
      },

      colourPalette: '',
      swatches: [],

      // Idle timer state
      idle: false,
      idleTimer: null,

      // ⭐ Debounce fields (ADD THESE)
      idlePollCount: 0, // counts consecutive "not playing" polls
      requiredIdlePolls: 2, // number of polls before switching to idle

      // ⭐ Track + album art caching (ADD THESE)
      cachedTrackId: null,
      cachedAlbumArtUrl: null,

      // Clock + date
      time: '',
      date: '',
      clockInterval: null,

      // Screensaver movement
      clockX: 0,
      clockY: 0,
      moveInterval: null
    }
  },

  mounted() {
    this.setDataInterval()
  },

  beforeDestroy() {
    clearInterval(this.pollPlaying)
    this.clearIdleTimer()
    clearInterval(this.clockInterval)
    clearInterval(this.moveInterval)
  },

  computed: {
    /* -------------------------------------------------------
     * Circadian gradient based on current time
     * ----------------------------------------------------- */
    circadianGradient() {
      const hour = new Date().getHours()

      /* Night (0–6) */
      if (hour < 6) {
        return {
          background: 'linear-gradient(120deg, #141428, #0a0a18, #141428)',
          backgroundSize: '300% 300%',
          animation: 'circadianWave 22s ease-in-out infinite'
        }
      }

      /* Morning (6–12) */
      if (hour < 12) {
        return {
          background: 'linear-gradient(120deg, #f4b78a, #d48a5a, #f4b78a)',
          backgroundSize: '300% 300%',
          animation: 'circadianWave 22s ease-in-out infinite'
        }
      }

      /* Afternoon (12–18) */
      if (hour < 18) {
        return {
          background: 'linear-gradient(120deg, #8cc7f2, #4a9bd6, #8cc7f2)',
          backgroundSize: '300% 300%',
          animation: 'circadianWave 22s ease-in-out infinite'
        }
      }

      /* Evening (18–24) */
      return {
        background: 'linear-gradient(120deg, #2a3a5f, #1a2540, #2a3a5f)',
        backgroundSize: '300% 300%',
        animation: 'circadianWave 22s ease-in-out infinite'
      }
    },

    /* -------------------------------------------------------
     * Track progress percentage for progress bar
     * ----------------------------------------------------- */
    progressPercent() {
      if (!this.playerData.duration) return 0
      return (this.playerData.progress / this.playerData.duration) * 100
    },

    /* -------------------------------------------------------
     * Clock drifting position
     * ----------------------------------------------------- */
    clockPosition() {
      return {
        transform: `translate(${this.clockX}px, ${this.clockY}px)`
      }
    }
  },

  methods: {
    /* -------------------------------------------------------
     * POLLING SPOTIFY
     * ----------------------------------------------------- */
    async getNowPlaying() {
      let data = {}

      try {
        const response = await fetch(
          `${this.endpoints.base}/${this.endpoints.nowPlaying}`,
          {
            headers: {
              Authorization: `Bearer ${this.auth.accessToken}`
            }
          }
        )

        if (!response.ok) throw new Error(response.status)

        if (response.status === 204) {
          data = this.getEmptyPlayer()
          this.playerResponse = data
          this.handleNowPlaying()
          return
        }

        data = await response.json()
        this.playerResponse = data
        this.handleNowPlaying()
      } catch (error) {
        this.handleExpiredToken()
        data = this.getEmptyPlayer()
        this.playerResponse = data
        this.handleNowPlaying()
      }
    },

    setDataInterval() {
      clearInterval(this.pollPlaying)
      this.pollPlaying = setInterval(() => {
        this.getNowPlaying()
      }, 2500)
    },

    getNowPlayingClass() {
      const playerClass = this.playerData.playing ? 'active' : 'idle'
      return `now-playing--${playerClass}`
    },

    getEmptyPlayer() {
      return {
        playing: false,
        trackAlbum: {},
        trackArtists: [],
        trackId: '',
        trackTitle: ''
      }
    },

    /* -------------------------------------------------------
     * MAIN LOGIC — PLAYING / NOT PLAYING / SCREENSAVER
     * ----------------------------------------------------- */
    handleNowPlaying() {
      const noTrack =
        !this.playerResponse.item ||
        !this.playerResponse.item.id ||
        !this.playerResponse.item.album ||
        !this.playerResponse.item.artists ||
        !this.playerResponse.item.album?.images ||
        this.playerResponse.item.album.images.length === 0

      // -------------------------------
      // ⭐ Debounce idle state
      // -------------------------------
      if (!this.playerResponse.is_playing || noTrack) {
        this.idlePollCount++

        if (this.idlePollCount >= this.requiredIdlePolls) {
          this.playerData = this.getEmptyPlayer()

          if (!this.idleTimer) {
            this.startIdleTimer()
          }

          return
        }

        // Not enough bad polls yet → ignore flicker
        return
      }

      // Reset idle debounce
      this.idlePollCount = 0
      this.clearIdleTimer()

      // -------------------------------
      // ⭐ Track + album art caching
      // -------------------------------
      const newTrackId = this.playerResponse.item.id
      const newArtUrl = this.playerResponse.item.album.images[0].url

      // ⭐ Detect new track BEFORE using isNewTrack
      const isNewTrack = this.cachedTrackId !== newTrackId

      // ⭐ Background fade-out when track changes
      const bg = document.querySelector('.app-background')
      if (isNewTrack && bg) {
        bg.classList.add('fade')
      }

      // ⭐ Prevent repeated heavy track processing, BUT still update progress
      if (this.cachedTrackId === newTrackId) {
        this.playerData.progress = Number(this.playerResponse.progress_ms) || 0
        this.playerData.duration =
          Number(this.playerResponse.item?.duration_ms) || 0
        return
      }
      this.cachedTrackId = newTrackId

      // Detect album art change
      const shouldUpdateColours = this.cachedAlbumArtUrl !== newArtUrl
      this.cachedAlbumArtUrl = newArtUrl

      // -------------------------------
      // ⭐ Update playerData AFTER caching
      // -------------------------------
      this.playerData = {
        playing: true,
        trackArtists: this.playerResponse.item.artists.map((a) => a.name),
        trackTitle: this.playerResponse.item.name,
        trackId: newTrackId,
        trackAlbum: {
          title: this.playerResponse.item.album.name,
          image: newArtUrl
        },
        progress: Number(this.playerResponse.progress_ms) || 0,
        duration: Number(this.playerResponse.item?.duration_ms) || 0
      }

      // -------------------------------
      // ⭐ Only extract colours if album art changed
      // -------------------------------
      if (shouldUpdateColours) {
        this.$nextTick(() => this.getAlbumColours())
      }

      // ⭐ Fade background back in AFTER colors update
      if (isNewTrack && bg) {
        setTimeout(() => {
          bg.classList.remove('fade')
        }, 50)
      }
    },

    /* -------------------------------------------------------
     * COLOUR EXTRACTION
     * ----------------------------------------------------- */
    getAlbumColours() {
      if (!this.playerData.trackAlbum?.image) return

      Vibrant.from(this.playerData.trackAlbum.image)
        .quality(1)
        .clearFilters()
        .getPalette()
        .then((palette) => {
          this.handleAlbumPalette(palette)
          if (!this.colourPalette) return

          // Progress bar (unchanged)
          document.documentElement.style.setProperty(
            '--accent-1',
            this.colourPalette.background
          )
          document.documentElement.style.setProperty(
            '--accent-2',
            this.colourPalette.text
          )

          // Background element
          const bg = document.querySelector('.app-background')
          if (!bg) return

          // Fade out
          bg.classList.add('fade')

          // Pick colourful base
          const base =
            palette.Vibrant?.hex ||
            palette.LightVibrant?.hex ||
            this.colourPalette.background

          // Strong contrast
          const contrast = this.adjustBrightness(base, 120)

          // Update gradient colours
          document.documentElement.style.setProperty('--bg-1', base)
          document.documentElement.style.setProperty('--bg-2', contrast)

          // ⭐ Force repaint BEFORE fade-in
          void bg.offsetHeight

          // Fade in
          bg.classList.remove('fade')
        })
    },

    // ⭐ Helper function MUST be outside getAlbumColours()
    adjustBrightness(hex, percent) {
      const num = parseInt(hex.replace('#', ''), 16)
      let r = (num >> 16) + percent
      let g = ((num >> 8) & 0x00ff) + percent
      let b = (num & 0x0000ff) + percent

      r = Math.min(255, Math.max(0, r))
      g = Math.min(255, Math.max(0, g))
      b = Math.min(255, Math.max(0, b))

      return '#' + (b | (g << 8) | (r << 16)).toString(16).padStart(6, '0')
    },

    handleAlbumPalette(palette) {
      let albumColours = Object.keys(palette)
        .filter((item) => item)
        .map((colour) => {
          return {
            text: palette[colour].getTitleTextColor(),
            background: palette[colour].getHex()
          }
        })

      this.swatches = albumColours
      this.colourPalette =
        albumColours[Math.floor(Math.random() * albumColours.length)]

      this.$nextTick(() => {
        this.setAppColours()
      })
    },

    setAppColours() {
      document.documentElement.style.setProperty(
        '--color-text-primary',
        this.colourPalette.text
      )

      document.documentElement.style.setProperty(
        '--colour-background-now-playing',
        this.colourPalette.background
      )
    },

    /* -------------------------------------------------------
     * TOKEN HANDLING
     * ----------------------------------------------------- */
    handleExpiredToken() {
      clearInterval(this.pollPlaying)
      this.$emit('requestRefreshToken')
    },

    /* -------------------------------------------------------
     * IDLE TIMER
     * ----------------------------------------------------- */
    startIdleTimer() {
      this.clearIdleTimer()

      this.idleTimer = setTimeout(() => {
        this.idle = true
        this.startClock()
        this.startClockMovement()
      }, 30000)
    },

    clearIdleTimer() {
      if (this.idleTimer) {
        clearTimeout(this.idleTimer)
        this.idleTimer = null
      }

      this.idle = false

      clearInterval(this.clockInterval)
      clearInterval(this.moveInterval)
    },

    /* -------------------------------------------------------
     * CLOCK LOGIC
     * ----------------------------------------------------- */
    startClock() {
      this.updateClock()

      this.clockInterval = setInterval(() => {
        this.updateClock()
      }, 1000)
    },

    updateClock() {
      const now = new Date()

      this.time = now.toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit'
      })

      this.date = now.toLocaleDateString([], {
        weekday: 'long',
        month: 'long',
        day: 'numeric'
      })
    },

    /* -------------------------------------------------------
     * CLOCK MOVEMENT (burn-in protection)
     * ----------------------------------------------------- */
    startClockMovement() {
      this.moveInterval = setInterval(() => {
        this.clockX = Math.random() * 300 - 150
        this.clockY = Math.random() * 300 - 150
      }, 100000) // 300,000 ms = 5 minutes
    }
  }
}
</script>

<style>
/* Screensaver container */
.screensaver {
  position: relative;
  height: 100vh;
  width: 100vw;
  overflow: hidden;
}

/* Wave-like circadian gradient */

@keyframes circadianWave {
  0% {
    background-position: 0% 50%;
  }
  25% {
    background-position: 50% 55%;
  }
  50% {
    background-position: 100% 50%;
  }
  75% {
    background-position: 50% 45%;
  }
  100% {
    background-position: 0% 50%;
  }
}

.screensaver__bg {
  position: absolute;
  inset: 0;

  /* Increased contrast for visible movement */
  background: linear-gradient(
    135deg,
    var(--circadian-1),
    color-mix(in srgb, var(--circadian-1) 30%, black),
    var(--circadian-1)
  );

  background-size: 300% 300%;
  animation: circadianWave 22s ease-in-out infinite;

  z-index: 1;
}

/* Clock movement */
.screensaver__clock-container {
  position: absolute;
  top: 40%;
  left: 40%;
  transition: transform 4s ease;
  z-index: 2;
}

/* Clock styling */
.screensaver__clock {
  text-align: center;
  color: white;
  font-family: 'Segoe UI', sans-serif;
}

.screensaver__time {
  font-size: 10rem;
  font-weight: 300;
}

.screensaver__date {
  font-size: 3rem;
  opacity: 0.8;
  margin-top: 10px;
}
</style>

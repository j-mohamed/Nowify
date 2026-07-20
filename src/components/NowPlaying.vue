<template>
  <div id="app">
    <div class="app-background"></div>

    <!-- PLAYING VIEW -->
    <div
      v-if="playerData.playing"
      class="now-playing fade-in"
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

        <!-- Clean progress bar -->
        <div class="now-playing__progress">
          <div
            class="now-playing__progress-fill"
            :style="{ width: progressPercent + '%' }"
          ></div>
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

      // Debounce fields
      idlePollCount: 0,
      requiredIdlePolls: 2,

      // Track + album art caching
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
    // START CLOCK IMMEDIATELY — Do not tie clock execution to idle state
    this.startClock()
    this.setDataInterval()
  },

  beforeDestroy() {
    clearInterval(this.pollPlaying)
    clearInterval(this.clockInterval)
    clearInterval(this.moveInterval)
    this.clearIdleTimer()
  },

  computed: {
    circadianGradient() {
      const hour = new Date().getHours()

      if (hour < 6) {
        return {
          background: 'linear-gradient(120deg, #141428, #0a0a18, #141428)',
          backgroundSize: '300% 300%',
          animation: 'circadianWave 22s ease-in-out infinite'
        }
      }

      if (hour < 12) {
        return {
          background: 'linear-gradient(120deg, #f4b78a, #d48a5a, #f4b78a)',
          backgroundSize: '300% 300%',
          animation: 'circadianWave 22s ease-in-out infinite'
        }
      }

      if (hour < 18) {
        return {
          background: 'linear-gradient(120deg, #8cc7f2, #4a9bd6, #8cc7f2)',
          backgroundSize: '300% 300%',
          animation: 'circadianWave 22s ease-in-out infinite'
        }
      }

      return {
        background: 'linear-gradient(120deg, #2a3a5f, #1a2540, #2a3a5f)',
        backgroundSize: '300% 300%',
        animation: 'circadianWave 22s ease-in-out infinite'
      }
    },

    progressPercent() {
      if (!this.playerData.duration) return 0
      return (this.playerData.progress / this.playerData.duration) * 100
    },

    clockPosition() {
      return {
        transform: `translate(${this.clockX}px, ${this.clockY}px)`
      }
    }
  },

  methods: {
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

        if (response.status === 401) {
          this.handleExpiredToken()
          return
        }

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
        console.warn('Spotify fetch error:', error)
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

    triggerFade() {
      const el = this.$el.querySelector('.now-playing')
      if (!el) return

      el.classList.remove('fade-in')
      void el.offsetWidth
      el.classList.add('fade-in')
    },

    handleNowPlaying() {
      const noTrack =
        !this.playerResponse.item ||
        !this.playerResponse.item.id ||
        !this.playerResponse.item.album ||
        !this.playerResponse.item.artists ||
        !this.playerResponse.item.album?.images ||
        this.playerResponse.item.album.images.length === 0

      // MUSIC STOPPED / NOT PLAYING
      if (!this.playerResponse.is_playing || noTrack) {
        this.idlePollCount++

        if (this.idlePollCount >= this.requiredIdlePolls) {
          this.playerData = this.getEmptyPlayer()

          // Start screensaver countdown if not already counting down or active
          if (!this.idleTimer && !this.idle) {
            this.startIdleTimer()
          }
        }
        return
      }

      // MUSIC IS PLAYING
      this.idlePollCount = 0
      this.clearIdleTimer() // Immediately dismisses screensaver when music plays

      const newTrackId = this.playerResponse.item.id
      const newArtUrl = this.playerResponse.item.album.images[0].url
      const isNewTrack = this.cachedTrackId !== newTrackId

      const bg = document.querySelector('.app-background')
      if (isNewTrack && bg) {
        bg.classList.add('fade')
      }

      if (this.cachedTrackId === newTrackId) {
        this.playerData.progress = Number(this.playerResponse.progress_ms) || 0
        this.playerData.duration =
          Number(this.playerResponse.item?.duration_ms) || 0
        return
      }

      this.cachedTrackId = newTrackId

      const shouldUpdateColours = this.cachedAlbumArtUrl !== newArtUrl
      this.cachedAlbumArtUrl = newArtUrl

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

      if (shouldUpdateColours) {
        this.$nextTick(() => this.getAlbumColours())
      }

      if (isNewTrack && bg) {
        setTimeout(() => {
          bg.classList.remove('fade')
        }, 50)
      }
    },

    getAlbumColours() {
      if (!this.playerData.trackAlbum?.image) return

      // Quality setting 3 minimizes CPU strain on the Raspberry Pi
      Vibrant.from(this.playerData.trackAlbum.image)
        .quality(3)
        .clearFilters()
        .getPalette()
        .then((palette) => {
          this.handleAlbumPalette(palette)
          if (!this.colourPalette) return

          document.documentElement.style.setProperty(
            '--accent-1',
            this.colourPalette.background
          )
          document.documentElement.style.setProperty(
            '--accent-2',
            this.colourPalette.text
          )

          const bg = document.querySelector('.app-background')
          if (!bg) return

          bg.classList.add('fade')

          const base =
            palette.Vibrant?.hex ||
            palette.LightVibrant?.hex ||
            this.colourPalette.background

          const contrast = this.adjustBrightness(base, 120)

          document.documentElement.style.setProperty('--bg-1', base)
          document.documentElement.style.setProperty('--bg-2', contrast)

          void bg.offsetHeight
          bg.classList.remove('fade')
        })
        .catch((err) => console.warn('Vibrant palette error:', err))
    },

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
        .filter((item) => palette[item])
        .map((colour) => {
          return {
            text: palette[colour].getTitleTextColor(),
            background: palette[colour].getHex()
          }
        })

      if (!albumColours.length) return

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

    /* CHANGED: Clean up interval timer completely when token expires */
    handleExpiredToken() {
      clearInterval(this.pollPlaying)
      this.pollPlaying = null
      this.$emit('requestRefreshToken')
    },

    /* -------------------------------------------------------
     * IDLE TIMER
     * ----------------------------------------------------- */
    startIdleTimer() {
      if (this.idleTimer) {
        clearTimeout(this.idleTimer)
        this.idleTimer = null
      }

      this.idleTimer = setTimeout(() => {
        this.idle = true
        this.startClockMovement()
      }, 30000)
    },

    clearIdleTimer() {
      if (this.idleTimer) {
        clearTimeout(this.idleTimer)
        this.idleTimer = null
      }

      this.idle = false
      clearInterval(this.moveInterval)
    },

    startClock() {
      this.updateClock()
      clearInterval(this.clockInterval)
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

    startClockMovement() {
      clearInterval(this.moveInterval)
      this.moveInterval = setInterval(() => {
        this.clockX = Math.random() * 300 - 150
        this.clockY = Math.random() * 300 - 150
      }, 50000)
    }
  },

  /* -------------------------------------------------------
   * WATCHERS
   * ----------------------------------------------------- */
  watch: {
    playerData(newVal, oldVal) {
      if (oldVal && newVal.trackId !== oldVal.trackId) {
        this.triggerFade()
      }
    },

    /* CHANGED: The instant the parent sends down a new access token, fetch immediately and resume polling */
    'auth.accessToken': function (newToken) {
      if (newToken) {
        this.setDataInterval()
        this.getNowPlaying()
      }
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

<template>
  <div id="app">
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
      </div>
    </div>

    <!-- SCREENSAVER VIEW -->
    <div v-else-if="idle" class="screensaver">
      <div class="screensaver__content">
        <h1 class="screensaver__title">🎵 No Music Playing</h1>
        <p class="screensaver__subtitle">Relax mode activated</p>
      </div>
    </div>

    <!-- IDLE VIEW (NO MUSIC BUT NOT YET SCREENSAVER) -->
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
      idleTimer: null
    }
  },

  mounted() {
    this.setDataInterval()
  },

  beforeDestroy() {
    clearInterval(this.pollPlaying)
    this.clearIdleTimer()
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

        // 204 = nothing playing
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

    /* -------------------------------------------------------
     * CLASS LOGIC
     * ----------------------------------------------------- */
    getNowPlayingClass() {
      const playerClass = this.playerData.playing ? 'active' : 'idle'
      return `now-playing--${playerClass}`
    },

    /* -------------------------------------------------------
     * EMPTY PLAYER TEMPLATE
     * ----------------------------------------------------- */
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
      // expired token
      if (
        this.playerResponse.error?.status === 401 ||
        this.playerResponse.error?.status === 400
      ) {
        this.handleExpiredToken()
        return
      }

      // detect ANY missing track info (ghost-playing fix)
      const noTrack =
        !this.playerResponse.item ||
        !this.playerResponse.item.id ||
        !this.playerResponse.item.album ||
        !this.playerResponse.item.artists ||
        !this.playerResponse.item.album?.images ||
        this.playerResponse.item.album.images.length === 0

      /* -------------------------------------------------------
       * NOTHING PLAYING
       * ----------------------------------------------------- */
      if (!this.playerResponse.is_playing || noTrack) {
        console.log('DEBUG: not playing → start idle timer')

        this.playerData = this.getEmptyPlayer()

        // Only start timer if not already running
        if (!this.idleTimer) {
          this.startIdleTimer()
        }

        return
      }

      /* -------------------------------------------------------
       * SOMETHING IS PLAYING
       * ----------------------------------------------------- */
      console.log('DEBUG: playing → clear idle timer')

      this.clearIdleTimer()

      // avoid duplicate updates
      if (this.playerResponse.item?.id === this.playerData.trackId) {
        return
      }

      this.playerData = {
        playing: true,
        trackArtists: this.playerResponse.item.artists.map(
          (artist) => artist.name
        ),
        trackTitle: this.playerResponse.item.name,
        trackId: this.playerResponse.item.id,
        trackAlbum: {
          title: this.playerResponse.item.album.name,
          image: this.playerResponse.item.album.images[0].url
        }
      }

      this.$nextTick(() => {
        this.getAlbumColours()
      })
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
        })
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
      console.log('DEBUG: idle timer started')

      this.clearIdleTimer()

      this.idleTimer = setTimeout(() => {
        console.log('DEBUG: idle = true')
        this.idle = true
      }, 30000)
    },

    clearIdleTimer() {
      console.log('DEBUG: idle timer cleared')

      if (this.idleTimer) {
        clearTimeout(this.idleTimer)
        this.idleTimer = null
      }

      this.idle = false
    }
  }
}
</script>

<style>
/* Add your screensaver styling here */
.screensaver {
  display: flex;
  justify-content: center;
  align-items: center;
  height: 100vh;
  background: black;
  color: white;
  text-align: center;
}

.screensaver__title {
  font-size: 3rem;
}

.screensaver__subtitle {
  font-size: 1.5rem;
  opacity: 0.7;
}
</style>

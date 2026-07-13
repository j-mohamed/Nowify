<template>
  <div id="app">
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

    <Screensaver v-else-if="idle" />

    <div v-else class="now-playing" :class="getNowPlayingClass()">
      <h1 class="now-playing__idle-heading">No music is playing 😔</h1>
    </div>
  </div>
</template>

<script>
import props from '@/utils/props.js'
import * as Vibrant from 'node-vibrant'
import Screensaver from './Screensaver.vue'

export default {
  name: 'NowPlaying',
  components: { Screensaver },

  props: {
    auth: props.auth,
    endpoints: props.endpoints,
    player: props.player
  },

  data() {
    return {
      pollPlaying: '',
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

      // idle timer fields
      idle: false,
      idleTimer: null
    }
  },

  computed: {
    getTrackArtists() {
      return this.player.trackArtists.join(', ')
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

        if (!response.ok) {
          throw new Error(`An error has occured: ${response.status}`)
        }

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

    getNowPlayingClass() {
      console.log('DEBUG: playerData.playing =', this.playerData.playing)

      const playerClass = this.playerData.playing ? 'active' : 'idle'
      const className = `now-playing--${playerClass}`

      console.log('DEBUG: returning class =', className)

      return className
    },

    getAlbumColours() {
      if (!this.player.trackAlbum?.image) {
        return
      }

      Vibrant.from(this.player.trackAlbum.image)
        .quality(1)
        .clearFilters()
        .getPalette()
        .then((palette) => {
          this.handleAlbumPalette(palette)
        })
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

    setDataInterval() {
      clearInterval(this.pollPlaying)
      this.pollPlaying = setInterval(() => {
        this.getNowPlaying()
      }, 2500)
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

    handleNowPlaying() {
      // expired / bad token
      if (
        this.playerResponse.error?.status === 401 ||
        this.playerResponse.error?.status === 400
      ) {
        this.handleExpiredToken()
        return
      }

      // nothing playing (204 or empty object)
      if (
        this.playerResponse.is_playing === false ||
        !this.playerResponse.item
      ) {
        console.log(
          'DEBUG: handleNowPlaying -> not playing, starting idle timer'
        )

        this.playerData = this.getEmptyPlayer()

        // ⭐ ONLY start the timer — DO NOT clear it again
        if (!this.idle) {
          this.startIdleTimer()
        }

        this.$emit('spotifyTrackUpdated', this.playerData)
        return
      }

      // something is playing
      console.log('DEBUG: handleNowPlaying -> playing, clearing idle timer')

      this.clearIdleTimer()

      // avoid duplicate updates
      if (this.playerResponse.item?.id === this.playerData.trackId) {
        return
      }

      this.playerData = {
        playing: this.playerResponse.is_playing,
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

      this.$emit('spotifyTrackUpdated', this.playerData)

      this.$nextTick(() => {
        this.getAlbumColours()
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

    handleExpiredToken() {
      clearInterval(this.pollPlaying)
      this.$emit('requestRefreshToken')
    },

    // IDLE TIMER METHODS
    startIdleTimer() {
      console.log('DEBUG: idle timer started')
      this.clearIdleTimer()
      this.idleTimer = setTimeout(() => {
        console.log('DEBUG: idle = true')
        this.idle = true
      }, 30000) // 30 seconds
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

<template>
  <div id="app">
    <Component
      :is="getCurrentComponent"
      :auth="auth"
      :endpoints="endpoints"
      :player="player"
      @spotifyTrackUpdated="updateCurrentTrack"
      @requestRefreshToken="requestRefreshTokens"
    ></Component>
  </div>
</template>

<script>
import Authorise from '@/components/Authorise'
import NowPlaying from '@/components/NowPlaying'

import {
  getStoredAuth,
  setStoredAuth
} from '@/utils/utils.js'


export default {

  name: 'App',


  components: {

    Authorise,

    NowPlaying

  },


  data() {

    return {

      auth: {

        status: false,

        clientId:
          process.env.VUE_APP_SP_CLIENT_ID,

        authCode: '',

        accessToken: '',

        refreshToken: ''

      },


      endpoints: {

        auth:
          'https://accounts.spotify.com/authorize',

        token:
          'https://accounts.spotify.com/api/token',

        base:
          'https://api.spotify.com/v1',

        nowPlaying:
          'me/player/currently-playing'

      },


      player: {

        playing:false,

        trackArtists:[],

        trackTitle:'',

        trackAlbum:[]

      }

    }

  },



  computed: {

    getCurrentComponent() {

      return this.auth.status === false
        ? 'Authorise'
        : 'NowPlaying'

    }

  },



  created() {


    const stored =
      getStoredAuth()



    this.auth = {

      ...this.auth,

      ...stored

    }



    /**
     * Restore logged-in state
     */
    if (
      this.auth.accessToken &&
      this.auth.refreshToken
    ) {

      this.auth.status = true

    }


  },



  methods:{


    requestRefreshTokens() {

      this.auth.status = false

    },


    updateCurrentTrack(value) {

      this.player = value

    }


  },



  watch:{


    auth: {

      deep:true,

      handler(value){

        setStoredAuth(value)

      }

    }


  }


}
</script>

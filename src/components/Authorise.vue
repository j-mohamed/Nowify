<template>
  <div class="authorise">
    <h1 class="authorise__heading">Nowify</h1>

    <p class="authorise__copy">
      Nowify is a simple Spotify 'Now Playing' screen designed for the Raspberry
      Pi. Login with Spotify below and start playing some music!
    </p>

    <button
      class="authorise__button button button--authorise"
      @click="initAuthorise"
    >
      Login with Spotify
    </button>

    <p class="authorise__credit">
      <a href="https://github.com/jonashcroft/Nowify">
        View on GitHub
      </a>
    </p>
  </div>
</template>


<script>
import props from '@/utils/props.js'

import {
  generateCodeVerifier,
  generateCodeChallenge,
  setCodeVerifier,
  getCodeVerifier
} from '@/utils/utils.js'


export default {

  name: 'Authorise',


  props: {

    auth: props.auth,

    endpoints: props.endpoints

  },


  mounted() {

    /**
     * Check Spotify redirect response.
     */
    this.getUrlAuthCode()


    /**
     * Refresh existing session.
     */
    if (this.auth.refreshToken) {

      this.requestAccessTokens('refresh_token')

    }

  },


  methods: {


    /**
     * Begin Spotify PKCE authorization.
     */
    async initAuthorise() {


      const verifier =
        generateCodeVerifier()


      setCodeVerifier(verifier)


      const challenge =
        await generateCodeChallenge(verifier)



      const params =
        new URLSearchParams({

          client_id:
            this.auth.clientId,

          response_type:
            'code',

          redirect_uri:
            window.location.origin,

          code_challenge_method:
            'S256',

          code_challenge:
            challenge,

          scope:
            [
              'user-read-currently-playing',
              'user-read-playback-state'
            ].join(' ')

        })



      window.location.href =
        `${this.endpoints.auth}?${params.toString()}`

    },




    /**
     * Read Spotify callback URL.
     */
    getUrlAuthCode() {


      const params =
        new URLSearchParams(
          window.location.search
        )


      const code =
        params.get('code')


      if (!code) {

        return

      }


      this.auth.authCode = code


      this.requestAccessTokens()

    },





    /**
     * Exchange authorization code
     * for Spotify tokens.
     */
    async requestAccessTokens(
      grantType = 'authorization_code'
    ) {


      let body



      if (grantType === 'authorization_code') {


        const verifier =
          getCodeVerifier()



        body =
          new URLSearchParams({

            client_id:
              this.auth.clientId,

            grant_type:
              'authorization_code',

            code:
              this.auth.authCode,

            redirect_uri:
              window.location.origin,

            code_verifier:
              verifier

          })


      }



      if (grantType === 'refresh_token') {


        body =
          new URLSearchParams({

            client_id:
              this.auth.clientId,

            grant_type:
              'refresh_token',

            refresh_token:
              this.auth.refreshToken

          })

      }




      try {


        const response =
          await fetch(
            this.endpoints.token,
            {

              method: 'POST',

              headers: {

                'Content-Type':
                  'application/x-www-form-urlencoded'

              },

              body

            }
          )



        const data =
          await response.json()



        this.handleAccessTokenResponse(data)


      } catch(error) {


        console.error(
          'Spotify token error:',
          error
        )


      }

    },





    /**
     * Handle Spotify response.
     */
    handleAccessTokenResponse(
      response = {}
    ) {



      if (response.error) {


        console.error(
          'Spotify Auth Error:',
          response
        )


        this.auth.status = false


        return

      }




      if (response.access_token) {



        this.auth.accessToken =
          response.access_token




        if (response.refresh_token) {


          this.auth.refreshToken =
            response.refresh_token


        }



        this.auth.status =
          true




        /**
         * Remove ?code= from URL.
         */
        window.history.replaceState(
          null,
          null,
          window.location.pathname
        )

      }


    }

  },


  watch: {


    /**
     * Watch authentication status.
     */
    'auth.status': function() {


      if (
        this.auth.refreshToken &&
        this.auth.status
      ) {


        this.requestAccessTokens(
          'refresh_token'
        )

      }

    }


  }


}
</script>


<style src="@/styles/components/authorise.scss" lang="scss" scoped></style>

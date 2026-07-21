<template>
  <div class="authorise" v-if="!isRefreshing && !auth.refreshToken">
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
      <a href="https://github.com/jonashcroft/Nowify">View on GitHub</a>
    </p>
  </div>
</template>

<script>
import props from '@/utils/props.js'

const searchParams = new URLSearchParams()
const currentParams = new URLSearchParams(window.location.search)

export default {
  name: 'Authorise',

  props: {
    auth: props.auth,
    endpoints: props.endpoints
  },

  data() {
    return {
      isRefreshing: false,
      refreshTimer: null
    }
  },

  mounted() {
    // 1. Handle redirect auth code (after Spotify login)
    this.getUrlAuthCode()

    // 2. If we already have a refresh token, refresh immediately
    if (this.auth.refreshToken) {
      this.requestAccessTokens('refresh_token')
    }

    // 3. NO AUTO-LOGIN (removed)
    // Prevents flashing login page on Pi/browser reloads

    // 4. Auto-refresh every 55 minutes (Spotify tokens last 60)
    this.refreshTimer = setInterval(
      () => {
        if (this.auth.refreshToken) {
          this.requestAccessTokens('refresh_token')
        }
      },
      55 * 60 * 1000
    )
  },

  methods: {
    /**
     * Manual Spotify login (only triggered by button click)
     */
    initAuthorise() {
      this.setAuthUrl()
      window.location.href = `${this.endpoints.auth}?${searchParams.toString()}`
    },

    /**
     * Check URL for auth code after Spotify redirect
     */
    getUrlAuthCode() {
      const urlAuthCode = currentParams.get('code')
      if (!urlAuthCode) return
      this.auth.authCode = urlAuthCode
    },

    /**
     * Request access + refresh tokens
     */
    async requestAccessTokens(grantType = 'authorization_code') {
      this.isRefreshing = true

      let fetchData = { grant_type: grantType }

      if (grantType === 'authorization_code') {
        fetchData.code = this.auth.authCode
        fetchData.redirect_uri = window.location.origin
      }

      if (grantType === 'refresh_token') {
        fetchData.refresh_token = this.auth.refreshToken
      }

      const queryBody = new URLSearchParams(fetchData).toString()
      const clientDetails = btoa(
        `${this.auth.clientId}:${this.auth.clientSecret}`
      )

      const res = await fetch(`${this.endpoints.token}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Authorization: `Basic ${clientDetails}`
        },
        body: queryBody
      })

      const data = await res.json()
      this.handleAccessTokenResponse(data)
    },

    /**
     * Handle Spotify token response
     */
    handleAccessTokenResponse(accessTokenResponse = {}) {
      // Retry invalid_grant once
      if (accessTokenResponse.error?.error === 'invalid_grant') {
        setTimeout(() => {
          this.requestAccessTokens('refresh_token')
        }, 5000)
        return
      }

      // Access token expired
      if (accessTokenResponse.error?.status === 401) {
        this.auth.authCode = ''
        this.auth.status = false
        this.isRefreshing = false
        return
      }

      // Successful token response
      if (accessTokenResponse.access_token) {
        this.auth.accessToken = accessTokenResponse.access_token

        if (accessTokenResponse.refresh_token) {
          this.auth.refreshToken = accessTokenResponse.refresh_token
        }

        this.auth.status = true
        this.isRefreshing = false

        // Clean URL (remove ?code= & ?state=)
        window.history.replaceState(
          null,
          null,
          location.protocol +
            '//' +
            location.host +
            location.pathname +
            location.search
              .replace(/[?&]code=[^&]+/, '')
              .replace(/^&/, '?')
              .replace(/[?&]state=[^&]+/, '')
              .replace(/^&/, '?')
        )
      }
    },

    /**
     * Build Spotify authorization URL
     */
    setAuthUrl() {
      searchParams.toString()
      searchParams.append('client_id', this.auth.clientId)
      searchParams.append('response_type', 'code')
      searchParams.append('redirect_uri', window.location.origin)
      searchParams.append(
        'state',
        [
          Math.random().toString(33).substring(2),
          Math.random().toString(34).substring(3),
          Math.random().toString(35).substring(4),
          Math.random().toString(36).substring(5)
        ].join('-')
      )
      searchParams.append('scope', 'user-read-currently-playing')
    }
  },

  watch: {
    /**
     * When auth code appears, request tokens
     */
    'auth.authCode': function () {
      this.requestAccessTokens()
    },

    /**
     * When auth status changes, refresh tokens if needed
     */
    'auth.status': function () {
      if (this.auth.refreshToken) {
        this.requestAccessTokens('refresh_token')
      }
    }
  }
}
</script>

<style src="@/styles/components/authorise.scss" lang="scss" scoped></style>

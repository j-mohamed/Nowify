/**
 * Utils: Utilities.
 * - Global functions that can be used across multiple files.
 * -----------------------------------------------------------------------------
 */


/**
 * Config object.
 */
const config = {
  authNamespace: 'nowify_auth_state',
  verifierNamespace: 'spotify_code_verifier'
}


/**
 * Get stored authorisation object.
 * @return {Object}
 */
export function getStoredAuth() {

  return JSON.parse(
    window.localStorage.getItem(config.authNamespace)
  ) || {}

}


/**
 * Set stored authorisation object.
 * @return {Object}
 */
export function setStoredAuth(authState = {}) {

  window.localStorage.setItem(
    config.authNamespace,
    JSON.stringify(authState)
  )

}


/**
 * Generate Spotify PKCE code verifier.
 * @return {String}
 */
export function generateCodeVerifier() {

  const array = new Uint8Array(64)

  window.crypto.getRandomValues(array)

  return Array.from(array)
    .map(byte => byte.toString(36))
    .join('')

}


/**
 * Generate Spotify PKCE code challenge.
 * @param {String} verifier
 * @return {String}
 */
export async function generateCodeChallenge(verifier) {

  const data =
    new TextEncoder()
      .encode(verifier)


  const digest =
    await window.crypto.subtle.digest(
      'SHA-256',
      data
    )


  return btoa(
    String.fromCharCode(
      ...new Uint8Array(digest)
    )
  )
  .replace(/\+/g, '-')
  .replace(/\//g, '_')
  .replace(/=/g, '')

}


/**
 * Store PKCE verifier.
 */
export function setCodeVerifier(verifier) {

  window.localStorage.setItem(
    config.verifierNamespace,
    verifier
  )

}


/**
 * Retrieve PKCE verifier.
 */
export function getCodeVerifier() {

  return window.localStorage.getItem(
    config.verifierNamespace
  )

}

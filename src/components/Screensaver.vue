<template>
  <div class="screensaver">
    <div class="bg"></div>

    <div class="center-content">
      <div class="clock">{{ time }}</div>
      <div class="status">No music playing</div>
    </div>
  </div>
</template>

<script>
export default {
  name: 'Screensaver',

  data() {
    return {
      time: ''
    }
  },

  mounted() {
    this.updateTime()
    this.timer = setInterval(this.updateTime, 1000)
  },

  beforeDestroy() {
    clearInterval(this.timer)
  },

  methods: {
    updateTime() {
      const now = new Date()
      const hours = now.getHours().toString().padStart(2, '0')
      const minutes = now.getMinutes().toString().padStart(2, '0')
      this.time = `${hours}:${minutes}`
    }
  }
}
</script>

<style scoped>
.screensaver {
  position: fixed; /* FULLSCREEN overlay */
  top: 0;
  left: 0;
  width: 100vw;
  height: 100vh;

  z-index: 9999; /* sits ABOVE NowPlaying */
  background: #000;

  overflow: hidden;

  display: flex;
  align-items: center;
  justify-content: center;
}

.bg {
  position: absolute;
  width: 100%;
  height: 100%;
  background: linear-gradient(120deg, #111, #222, #111);
  animation: hue 12s infinite alternate;
  filter: blur(20px);
}

@keyframes hue {
  from {
    filter: hue-rotate(0deg) blur(20px);
  }
  to {
    filter: hue-rotate(360deg) blur(20px);
  }
}

.center-content {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  text-align: center;
  color: white;
  font-family: 'Segoe UI', sans-serif;
}

.clock {
  font-size: 6rem;
  font-weight: 300;
  letter-spacing: 4px;
}

.status {
  margin-top: 10px;
  font-size: 1.2rem;
  opacity: 0.7;
}
</style>

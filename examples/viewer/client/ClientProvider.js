// process.env.DEBUG = 'minecraft-protocol'
const { Client } = require('bedrock-protocol')
const { BotProvider } = require('./BotProvider')
const config = require('./config.json')

const controlMap = {
  forward: ['KeyW', 'KeyZ'],
  back: 'KeyS',
  left: ['KeyA', 'KeyQ'],
  right: 'KeyD',
  sneak: 'ShiftLeft',
  jump: 'Space'
}

class ClientProvider extends BotProvider {
  downKeys = new Set()

  connect () {
    const client = new Client({ ...config, connectTimeout: 100000, delayedInit: true })
    document.getElementById('connectinfo').innerHTML = `Connecting to ${config.host}, port ${config.port}...`

    client.on('connect_allowed', () => {
      client.connect()

      client.once('resource_packs_info', (packet) => {
        client.write('resource_pack_client_response', {
          response_status: 'completed',
          resourcepackids: []
        })

        client.once('resource_pack_stack', (stack) => {
          client.write('resource_pack_client_response', {
            response_status: 'completed',
            resourcepackids: []
          })
        })

        client.queue('client_cache_status', { enabled: false })
        client.queue('request_chunk_radius', { chunk_radius: 1 })

        this.heartbeat = setInterval(() => {
          client.queue('tick_sync', { request_time: BigInt(Date.now()), response_time: 0n })
        })
      })
    })

    client.init()
    this.client = client
  }

  close () {
    this.client?.disconnect()
  }

  listenToBot () {
    this.client.on('connect', () => {
      console.log('Bot has connected!')
      document.getElementById('connectinfo').innerHTML = `Connected to ${config.host}, port ${config.port}!`
    })
    this.client.on('error', error => {
      console.log('Bot gave an error!', error)
      document.getElementById('connectinfo').innerHTML = 'Bot gave an error! Check console logs to see what it says!'
    })
    this.client.on('join', () => { document.getElementById('connectinfo').innerHTML = 'Joined!' })
    this.client.on('close', () => { document.getElementById('connectinfo').innerHTML = 'Server closed the connection!' })
    this.client.on('kick', packet => { document.getElementById('connectinfo').innerHTML = `Kicked with reason: ${packet.message}` })
    this.client.on('start_game', packet => {
      this.updatePosition(packet.player_position)
      this.movements.init('server', packet.player_position, /* vel */ null, packet.rotation.z || 0, packet.rotation.x || 0, 0)
    })

    this.client.on('spawn', () => {
      document.getElementById('connectinfo').innerHTML = 'Spawned!'
      this.movements.startPhys()
      // server allows client to render chunks & spawn in world
      this.emit('spawn', { position: this.lastPos, firstPerson: true })

      this.tickLoop = setInterval(() => {
        this.client.queue('tick_sync', { request_time: BigInt(Date.now()), response_time: 0n })
      })
    })

    this.client.on('level_chunk', packet => {
      this.handleChunk(packet)
      console.log(packet)
    })

    this.client.on('move_player', packet => {
      if (packet.runtime_id === this.client.entityId) {
        this.movements.updatePosition(packet.position, packet.yaw, packet.pitch, packet.head_yaw, packet.tick)
      }
    })

    this.client.on('set_entity_motion', packet => {
      // if (packet.runtime_id === this.client.entityId) this.updatePosition(packet.position)
    })

    this.client.on('tick_sync', (packet) => {
      this.lastTick = packet.response_time
      this.client.emit('heartbeat', this.lastTick)
      this.client.tick = this.lastTick
    })
  }

  onKeyDown = (evt) => {
    const code = evt.code
    for (const control in controlMap) {
      if (controlMap[control].includes(code)) {
        this.movements.setControlState(control, true)
        break
      }
      if (evt.ctrlKey) {
        this.movements.setControlState('sprint', true)
      }
    }
    this.downKeys.add(code)
  }

  onKeyUp = (evt) => {
    const code = evt.code
    if (code === 'ControlLeft' && this.downKeys.has('ControlLeft')) {
      this.movements.setControlState('sprint', false)
    }
    for (const control in controlMap) {
      if (controlMap[control].includes(code)) {
        this.movements.setControlState(control, false)
        break
      }
    }
    this.downKeys.delete(code)
  }
}

module.exports = { ClientProvider }

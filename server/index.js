const express = require("express")
const http = require("http")
const path = require("path")
const { Server } = require("socket.io")
const Game = require("./game")

const PORT = process.env.PORT || 3000

const app = express()
app.use(express.static(path.join(__dirname, "..", "public")))

const server = http.createServer(app)
const io = new Server(server, { pingInterval: 10000, pingTimeout: 8000 })

const games = new Map()

function newCode() {
  const letters = "ABCDEFGHJKMNPQRSTUVWXYZ"
  let code
  do {
    code = Array.from({ length: 4 }, () => letters[Math.floor(Math.random() * letters.length)]).join("")
  } while (games.has(code))
  return code
}

function broadcast(game) {
  for (const player of game.players) {
    if (player.socketId) {
      io.to(player.socketId).emit("state", game.stateFor(player.id))
    }
  }
  game.events = []
}

io.on("connection", (socket) => {
  let game = null
  let playerId = null

  const act = (fn) => (payload = {}) => {
    try {
      fn(payload)
    } catch (err) {
      socket.emit("game-error", err.message)
    }
    if (game) broadcast(game)
  }

  socket.on("create-room", act(({ name }) => {
    game = new Game(newCode())
    games.set(game.code, game)
    const player = game.addPlayer(name)
    player.socketId = socket.id
    playerId = player.id
    socket.emit("joined", { code: game.code, playerId })
  }))

  socket.on("join-room", act(({ code, name, playerId: token }) => {
    const found = games.get(String(code || "").toUpperCase().trim())
    if (!found) throw new Error("Room not found — check the code")
    game = found
    const existing = token && game.players.find((p) => p.id === token)
    if (existing) {
      existing.socketId = socket.id
      existing.connected = true
      playerId = existing.id
    } else {
      const player = game.addPlayer(name)
      player.socketId = socket.id
      playerId = player.id
    }
    socket.emit("joined", { code: game.code, playerId })
  }))

  socket.on("sync", () => {
    if (game && playerId) {
      socket.emit("state", { ...game.stateFor(playerId), events: [] })
    }
  })

  socket.on("start-game", act(() => game.start(playerId)))
  socket.on("draw", act(() => game.turnDraw(playerId)))
  socket.on("play-bank", act(({ uid }) => game.playToBank(playerId, uid)))
  socket.on("play-property", act(({ uid, color }) => game.playProperty(playerId, uid, color)))
  socket.on("play-action", act(({ uid, opts }) => game.playAction(playerId, uid, opts)))
  socket.on("flip-wild", act(({ uid, color }) => game.flipWild(playerId, uid, color)))
  socket.on("respond-jsn", act(({ useJsn }) => game.respondJsn(playerId, useJsn)))
  socket.on("pay", act(({ uids }) => game.submitPayment(playerId, uids)))
  socket.on("end-turn", act(() => game.endTurn(playerId)))
  socket.on("discard", act(({ uids }) => game.discardDown(playerId, uids)))

  socket.on("disconnect", () => {
    if (!game || !playerId) return
    const player = game.players.find((p) => p.id === playerId)
    if (player) {
      player.connected = false
      player.socketId = null
      broadcast(game)
    }
    if (game.players.every((p) => !p.connected)) {
      setTimeout(() => {
        if (game.players.every((p) => !p.connected)) games.delete(game.code)
      }, 1000 * 60 * 30)
    }
  })
})

server.listen(PORT, () => {
  console.log(`Monopoly Deal running at http://localhost:${PORT}`)
})

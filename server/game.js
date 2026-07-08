const crypto = require("crypto")
const { buildDeck, COLORS } = require("./cards")

const HAND_LIMIT = 7
const PLAYS_PER_TURN = 3
const SETS_TO_WIN = 3

function shuffle(cards) {
  for (let i = cards.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[cards[i], cards[j]] = [cards[j], cards[i]]
  }
  return cards
}

class Game {
  constructor(code) {
    this.code = code
    this.players = []
    this.deck = []
    this.discardPile = []
    this.turn = 0
    this.playsLeft = 0
    this.phase = "lobby"
    this.pending = null
    this.winner = null
    this.log = []
    this.events = []
  }

  get current() {
    return this.players[this.turn]
  }

  player(id) {
    const player = this.players.find((p) => p.id === id)
    if (!player) throw new Error("Player not found")
    return player
  }

  addPlayer(name) {
    if (this.phase !== "lobby") throw new Error("Game already started")
    if (this.players.length >= 4) throw new Error("Room is full")
    const player = {
      id: crypto.randomBytes(8).toString("hex"),
      name: String(name || "Player").trim().slice(0, 16) || "Player",
      socketId: null,
      connected: true,
      hand: [],
      bank: [],
      props: {}
    }
    this.players.push(player)
    return player
  }

  start(playerId) {
    if (this.phase !== "lobby") throw new Error("Game already started")
    if (this.players[0].id !== playerId) throw new Error("Only the host can start")
    if (this.players.length < 2) throw new Error("Need at least 2 players")
    this.deck = shuffle(buildDeck())
    for (const player of this.players) {
      player.hand = this.drawFromDeck(5)
    }
    this.turn = Math.floor(Math.random() * this.players.length)
    this.phase = "draw"
    this.addLog(`${this.current.name} goes first`)
    this.event({ type: "start" })
  }

  drawFromDeck(n) {
    const out = []
    for (let i = 0; i < n; i++) {
      if (!this.deck.length) {
        if (!this.discardPile.length) break
        this.deck = shuffle(this.discardPile)
        this.discardPile = []
        this.addLog("Discard pile reshuffled into the deck")
      }
      out.push(this.deck.pop())
    }
    return out
  }

  turnDraw(playerId) {
    if (this.phase !== "draw") throw new Error("Not time to draw")
    if (this.current.id !== playerId) throw new Error("Not your turn")
    const n = this.current.hand.length === 0 ? 5 : 2
    const cards = this.drawFromDeck(n)
    this.current.hand.push(...cards)
    this.phase = "play"
    this.playsLeft = PLAYS_PER_TURN
    this.event({ type: "draw", player: playerId, count: cards.length })
    this.addLog(`${this.current.name} drew ${cards.length} cards`)
  }

  assertCanPlay(playerId) {
    if (this.phase !== "play") throw new Error("You can't play a card right now")
    if (this.current.id !== playerId) throw new Error("Not your turn")
    if (this.pending) throw new Error("Waiting on another player to respond")
    if (this.playsLeft < 1) throw new Error("No plays left — end your turn")
  }

  handCard(player, uid) {
    const card = player.hand.find((c) => c.uid === uid)
    if (!card) throw new Error("That card isn't in your hand")
    return card
  }

  removeFromHand(player, uid) {
    const idx = player.hand.findIndex((c) => c.uid === uid)
    if (idx < 0) throw new Error("That card isn't in your hand")
    return player.hand.splice(idx, 1)[0]
  }

  pile(player, color) {
    if (!player.props[color]) player.props[color] = { cards: [], buildings: [] }
    return player.props[color]
  }

  pileComplete(player, color) {
    const pile = player.props[color]
    return !!pile && pile.cards.length >= COLORS[color].size
  }

  completedSets(player) {
    let sets = 0
    for (const [color, pile] of Object.entries(player.props)) {
      sets += Math.floor(pile.cards.length / COLORS[color].size)
    }
    return sets
  }

  rentFor(player, color) {
    const pile = player.props[color]
    if (!pile || !pile.cards.length) return 0
    const info = COLORS[color]
    const n = Math.min(pile.cards.length, info.size)
    let rent = info.rent[n - 1]
    if (pile.cards.length >= info.size) {
      rent += pile.buildings.reduce((sum, b) => sum + (b.kind === "house" ? 3 : 4), 0)
    }
    return rent
  }

  tableCards(player) {
    const cards = [...player.bank]
    for (const pile of Object.values(player.props)) {
      cards.push(...pile.cards, ...pile.buildings)
    }
    return cards
  }

  tableValue(player) {
    return this.tableCards(player).reduce((sum, c) => sum + c.value, 0)
  }

  hasJsn(player) {
    return player.hand.some((c) => c.type === "action" && c.kind === "justsayno")
  }

  opponents(player) {
    return this.players.filter((p) => p.id !== player.id)
  }

  playToBank(playerId, uid) {
    this.assertCanPlay(playerId)
    const player = this.current
    const card = this.handCard(player, uid)
    if (card.type === "property" || card.type === "wild") {
      throw new Error("Property cards can't go in the bank")
    }
    this.removeFromHand(player, uid)
    player.bank.push(card)
    this.playsLeft--
    this.event({ type: "play", player: playerId, card, dest: "bank" })
    this.addLog(`${player.name} banked $${card.value}`)
  }

  playProperty(playerId, uid, color) {
    this.assertCanPlay(playerId)
    const player = this.current
    const card = this.handCard(player, uid)
    if (card.type === "property") {
      color = card.color
    } else if (card.type === "wild") {
      this.assertWildColor(card, color)
    } else {
      throw new Error("That card isn't a property")
    }
    this.removeFromHand(player, uid)
    card.assignedColor = color
    this.pile(player, color).cards.push(card)
    this.playsLeft--
    this.event({ type: "play", player: playerId, card, dest: "props", color })
    this.addLog(`${player.name} played ${card.name || "a wildcard"} on ${COLORS[color].label}`)
    this.checkWin(player)
  }

  assertWildColor(card, color) {
    if (!COLORS[color]) throw new Error("Pick a color for the wildcard")
    if (card.colors !== "any" && !card.colors.includes(color)) {
      throw new Error("That wildcard can't be that color")
    }
  }

  flipWild(playerId, uid, color) {
    if (this.phase !== "play") throw new Error("You can only move wildcards during your turn")
    if (this.current.id !== playerId) throw new Error("Not your turn")
    if (this.pending) throw new Error("Waiting on another player to respond")
    const player = this.current
    for (const [fromColor, pile] of Object.entries(player.props)) {
      const idx = pile.cards.findIndex((c) => c.uid === uid)
      if (idx < 0) continue
      const card = pile.cards[idx]
      if (card.type !== "wild") throw new Error("Only wildcards can change color")
      this.assertWildColor(card, color)
      if (fromColor === color) return
      pile.cards.splice(idx, 1)
      card.assignedColor = color
      this.pile(player, color).cards.push(card)
      this.event({ type: "flip", player: playerId, card, color })
      this.addLog(`${player.name} moved a wildcard to ${COLORS[color].label}`)
      this.checkWin(player)
      return
    }
    throw new Error("That wildcard isn't on your table")
  }

  playAction(playerId, uid, opts = {}) {
    this.assertCanPlay(playerId)
    const player = this.current
    const card = this.handCard(player, uid)
    if (card.type === "rent") return this.playRent(player, card, opts)
    if (card.type !== "action") throw new Error("That card isn't an action")
    switch (card.kind) {
      case "passgo":
        return this.playPassGo(player, card)
      case "birthday":
        return this.playCharge(player, card, this.opponents(player).map((p) => p.id), 2)
      case "debtcollector":
        return this.playCharge(player, card, [this.requireTarget(player, opts)], 5)
      case "slydeal":
        return this.playSlyDeal(player, card, opts)
      case "forceddeal":
        return this.playForcedDeal(player, card, opts)
      case "dealbreaker":
        return this.playDealBreaker(player, card, opts)
      case "house":
      case "hotel":
        return this.playBuilding(player, card, opts)
      case "justsayno":
        throw new Error("Just Say No is played automatically when you're targeted")
      case "doublerent":
        throw new Error("Play Double the Rent together with a rent card")
      default:
        throw new Error("Unknown action")
    }
  }

  requireTarget(player, opts) {
    const target = this.players.find((p) => p.id === opts.targetId && p.id !== player.id)
    if (!target) throw new Error("Pick a player to target")
    return target.id
  }

  playPassGo(player, card) {
    this.discardAction(player, card)
    const cards = this.drawFromDeck(2)
    player.hand.push(...cards)
    this.event({ type: "action", player: player.id, card })
    this.event({ type: "draw", player: player.id, count: cards.length })
    this.addLog(`${player.name} played Pass Go`)
  }

  playRent(player, card, opts) {
    let color = opts.color
    if (card.colors === "any") {
      this.requireTarget(player, opts)
    } else if (!card.colors.includes(color)) {
      throw new Error("Pick one of the rent card's colors")
    }
    if (!COLORS[color]) throw new Error("Pick a color to charge rent on")
    let amount = this.rentFor(player, color)
    if (!amount) throw new Error(`You don't own any ${COLORS[color].label} properties`)

    let plays = 1
    if (opts.doubleRentUid) {
      const dtr = this.handCard(player, opts.doubleRentUid)
      if (dtr.type !== "action" || dtr.kind !== "doublerent") throw new Error("That isn't Double the Rent")
      if (this.playsLeft < 2) throw new Error("Double the Rent needs 2 plays left")
      this.removeFromHand(player, dtr.uid)
      this.discardPile.push(dtr)
      amount *= 2
      plays = 2
    }

    const targetIds = card.colors === "any"
      ? [opts.targetId]
      : this.opponents(player).map((p) => p.id)

    this.removeFromHand(player, card.uid)
    this.discardPile.push(card)
    this.playsLeft -= plays
    this.event({ type: "action", player: player.id, card })
    this.addLog(`${player.name} charged $${amount} ${COLORS[color].label} rent`)
    this.openPending({
      action: "rent",
      label: `$${amount} ${COLORS[color].label} rent`,
      source: player,
      targetIds,
      amount
    })
  }

  playCharge(player, card, targetIds, amount) {
    if (!targetIds.length) throw new Error("No one to charge")
    this.discardAction(player, card)
    this.event({ type: "action", player: player.id, card })
    this.addLog(`${player.name} played ${card.name}`)
    this.openPending({
      action: card.kind,
      label: card.kind === "birthday" ? `$${amount} birthday money` : `$${amount} debt`,
      source: player,
      targetIds,
      amount
    })
  }

  findPropCard(player, uid) {
    for (const [color, pile] of Object.entries(player.props)) {
      const card = pile.cards.find((c) => c.uid === uid)
      if (card) return { card, color, pile }
    }
    return null
  }

  playSlyDeal(player, card, opts) {
    const targetId = this.requireTarget(player, opts)
    const target = this.player(targetId)
    const found = this.findPropCard(target, opts.cardUid)
    if (!found) throw new Error("Pick a property to steal")
    this.assertStealable(target, found)
    this.discardAction(player, card)
    this.event({ type: "action", player: player.id, card })
    this.addLog(`${player.name} played Sly Deal on ${target.name}`)
    this.openPending({
      action: "slydeal",
      label: `Sly Deal: steal ${found.card.name || "a wildcard"}`,
      source: player,
      targetIds: [targetId],
      data: { cardUid: opts.cardUid }
    })
  }

  playForcedDeal(player, card, opts) {
    const targetId = this.requireTarget(player, opts)
    const target = this.player(targetId)
    const theirs = this.findPropCard(target, opts.cardUid)
    if (!theirs) throw new Error("Pick a property to take")
    this.assertStealable(target, theirs)
    const mine = this.findPropCard(player, opts.myCardUid)
    if (!mine) throw new Error("Pick one of your properties to give")
    this.discardAction(player, card)
    this.event({ type: "action", player: player.id, card })
    this.addLog(`${player.name} played Forced Deal on ${target.name}`)
    this.openPending({
      action: "forceddeal",
      label: `Forced Deal: swap for ${theirs.card.name || "a wildcard"}`,
      source: player,
      targetIds: [targetId],
      data: { cardUid: opts.cardUid, myCardUid: opts.myCardUid }
    })
  }

  assertStealable(target, found) {
    if (this.pileComplete(target, found.color) && found.pile.cards.length === COLORS[found.color].size) {
      throw new Error("You can't take a card from a completed set")
    }
  }

  playDealBreaker(player, card, opts) {
    const targetId = this.requireTarget(player, opts)
    const target = this.player(targetId)
    if (!this.pileComplete(target, opts.color)) throw new Error("Pick a completed set to steal")
    this.discardAction(player, card)
    this.event({ type: "action", player: player.id, card })
    this.addLog(`${player.name} played Deal Breaker on ${target.name}`)
    this.openPending({
      action: "dealbreaker",
      label: `Deal Breaker: steal the ${COLORS[opts.color].label} set`,
      source: player,
      targetIds: [targetId],
      data: { color: opts.color }
    })
  }

  playBuilding(player, card, opts) {
    const color = opts.color
    if (!COLORS[color]) throw new Error("Pick a set for the building")
    if (color === "railroad" || color === "utility") throw new Error("Buildings can't go on railroads or utilities")
    if (!this.pileComplete(player, color)) throw new Error("Buildings only go on completed sets")
    const pile = this.pile(player, color)
    const hasHouse = pile.buildings.some((b) => b.kind === "house")
    const hasHotel = pile.buildings.some((b) => b.kind === "hotel")
    if (card.kind === "house" && hasHouse) throw new Error("That set already has a house")
    if (card.kind === "hotel" && !hasHouse) throw new Error("A hotel needs a house first")
    if (card.kind === "hotel" && hasHotel) throw new Error("That set already has a hotel")
    this.removeFromHand(player, card.uid)
    pile.buildings.push(card)
    this.playsLeft--
    this.event({ type: "play", player: player.id, card, dest: "props", color })
    this.addLog(`${player.name} added a ${card.kind} to ${COLORS[color].label}`)
  }

  discardAction(player, card) {
    this.removeFromHand(player, card.uid)
    this.discardPile.push(card)
    this.playsLeft--
  }

  openPending({ action, label, source, targetIds, amount = 0, data = {} }) {
    this.pending = {
      action,
      label,
      source: source.id,
      targets: targetIds.map((playerId) => ({
        playerId,
        amount,
        stage: null,
        decider: null,
        jsnCount: 0,
        done: false,
        cancelled: false
      })),
      data
    }
    for (const target of this.pending.targets) this.initTarget(target)
    this.checkPendingDone()
  }

  initTarget(target) {
    const player = this.player(target.playerId)
    if (this.hasJsn(player)) {
      target.stage = "jsn"
      target.decider = player.id
    } else {
      this.settleTarget(target)
    }
  }

  settleTarget(target) {
    target.stage = null
    target.decider = null
    if (target.jsnCount % 2 === 1) {
      target.done = true
      target.cancelled = true
      this.addLog(`${this.player(target.playerId).name} said NO — action cancelled`)
      return
    }
    if (target.amount > 0) {
      const player = this.player(target.playerId)
      if (this.tableValue(player) === 0) {
        target.done = true
        this.addLog(`${player.name} has nothing to pay with`)
      } else {
        target.stage = "pay"
        target.decider = player.id
      }
    } else {
      this.executeSteal(target)
      target.done = true
    }
  }

  respondJsn(playerId, useJsn) {
    if (!this.pending) throw new Error("Nothing to respond to")
    const target = this.pending.targets.find((t) => t.stage === "jsn" && t.decider === playerId)
    if (!target) throw new Error("It's not your call")
    if (useJsn) {
      const player = this.player(playerId)
      const idx = player.hand.findIndex((c) => c.type === "action" && c.kind === "justsayno")
      if (idx < 0) throw new Error("You don't have a Just Say No")
      const card = player.hand.splice(idx, 1)[0]
      this.discardPile.push(card)
      target.jsnCount++
      this.event({ type: "jsn", player: playerId })
      this.addLog(`${player.name} played Just Say No!`)
      const nextId = playerId === target.playerId ? this.pending.source : target.playerId
      const next = this.player(nextId)
      if (this.hasJsn(next)) {
        target.decider = nextId
      } else {
        this.settleTarget(target)
      }
    } else {
      this.settleTarget(target)
    }
    this.checkPendingDone()
  }

  submitPayment(playerId, uids) {
    if (!this.pending) throw new Error("Nothing to pay")
    const target = this.pending.targets.find((t) => t.stage === "pay" && t.decider === playerId)
    if (!target) throw new Error("You don't owe anything")
    const player = this.player(playerId)
    const table = this.tableCards(player)
    const chosen = uids.map((uid) => {
      const card = table.find((c) => c.uid === uid)
      if (!card) throw new Error("You can only pay with cards on your table")
      return card
    })
    if (new Set(uids).size !== uids.length) throw new Error("Duplicate cards selected")
    const total = chosen.reduce((sum, c) => sum + c.value, 0)
    if (total < target.amount && chosen.length !== table.length) {
      throw new Error(`Select at least $${target.amount}, or everything you have`)
    }
    const source = this.player(this.pending.source)
    this.transferCards(player, source, chosen)
    target.done = true
    this.event({ type: "payment", from: playerId, to: source.id, cards: chosen })
    this.addLog(`${player.name} paid ${source.name} $${total}`)
    this.checkPendingDone()
    this.checkWin(source)
  }

  transferCards(from, to, cards) {
    for (const card of cards) {
      const bankIdx = from.bank.findIndex((c) => c.uid === card.uid)
      if (bankIdx >= 0) {
        from.bank.splice(bankIdx, 1)
        to.bank.push(card)
        continue
      }
      let moved = false
      for (const [color, pile] of Object.entries(from.props)) {
        const cardIdx = pile.cards.findIndex((c) => c.uid === card.uid)
        if (cardIdx >= 0) {
          pile.cards.splice(cardIdx, 1)
          this.pile(to, card.assignedColor || color).cards.push(card)
          moved = true
          break
        }
        const bldgIdx = pile.buildings.findIndex((c) => c.uid === card.uid)
        if (bldgIdx >= 0) {
          pile.buildings.splice(bldgIdx, 1)
          to.bank.push(card)
          moved = true
          break
        }
      }
      if (!moved) throw new Error("Card vanished mid-payment")
    }
  }

  executeSteal(target) {
    const source = this.player(this.pending.source)
    const player = this.player(target.playerId)
    const { action, data } = this.pending
    if (action === "slydeal" || action === "forceddeal") {
      const theirs = this.findPropCard(player, data.cardUid)
      if (!theirs) return
      theirs.pile.cards.splice(theirs.pile.cards.indexOf(theirs.card), 1)
      this.pile(source, theirs.card.assignedColor || theirs.color).cards.push(theirs.card)
      if (action === "forceddeal") {
        const mine = this.findPropCard(source, data.myCardUid)
        if (mine) {
          mine.pile.cards.splice(mine.pile.cards.indexOf(mine.card), 1)
          this.pile(player, mine.card.assignedColor || mine.color).cards.push(mine.card)
        }
      }
      this.event({ type: "steal", from: player.id, to: source.id, cards: [theirs.card] })
      this.addLog(`${source.name} took ${theirs.card.name || "a wildcard"} from ${player.name}`)
    } else if (action === "dealbreaker") {
      const pile = player.props[data.color]
      if (!pile) return
      const taken = [...pile.cards, ...pile.buildings]
      const dest = this.pile(source, data.color)
      dest.cards.push(...pile.cards)
      dest.buildings.push(...pile.buildings)
      delete player.props[data.color]
      this.event({ type: "steal", from: player.id, to: source.id, cards: taken })
      this.addLog(`${source.name} took the whole ${COLORS[data.color].label} set from ${player.name}`)
    }
    this.checkWin(source)
  }

  checkPendingDone() {
    if (this.pending && this.pending.targets.every((t) => t.done)) {
      this.pending = null
    }
  }

  endTurn(playerId) {
    if (this.phase !== "play") throw new Error("You can't end your turn now")
    if (this.current.id !== playerId) throw new Error("Not your turn")
    if (this.pending) throw new Error("Waiting on another player to respond")
    if (this.current.hand.length > HAND_LIMIT) {
      this.phase = "discard"
      this.addLog(`${this.current.name} must discard down to ${HAND_LIMIT} cards`)
      return
    }
    this.advanceTurn()
  }

  discardDown(playerId, uids) {
    if (this.phase !== "discard") throw new Error("No need to discard")
    if (this.current.id !== playerId) throw new Error("Not your turn")
    const player = this.current
    if (player.hand.length - uids.length > HAND_LIMIT) {
      throw new Error(`Discard down to ${HAND_LIMIT} cards`)
    }
    for (const uid of uids) {
      const card = this.removeFromHand(player, uid)
      this.discardPile.push(card)
    }
    this.addLog(`${player.name} discarded ${uids.length} cards`)
    this.advanceTurn()
  }

  advanceTurn() {
    this.turn = (this.turn + 1) % this.players.length
    this.phase = "draw"
    this.playsLeft = 0
    this.event({ type: "turn", player: this.current.id })
    this.addLog(`${this.current.name}'s turn`)
  }

  checkWin(player) {
    if (this.winner) return
    if (this.completedSets(player) >= SETS_TO_WIN) {
      this.winner = player.id
      this.phase = "over"
      this.pending = null
      this.event({ type: "win", player: player.id })
      this.addLog(`${player.name} WINS with ${SETS_TO_WIN} full sets!`)
    }
  }

  addLog(text) {
    this.log.push(text)
    if (this.log.length > 50) this.log.shift()
  }

  event(e) {
    this.events.push(e)
  }

  stateFor(playerId) {
    const you = this.players.find((p) => p.id === playerId)
    return {
      code: this.code,
      phase: this.phase,
      turn: this.players.length ? this.current.id : null,
      playsLeft: this.playsLeft,
      deckCount: this.deck.length,
      discardTop: this.discardPile[this.discardPile.length - 1] || null,
      winner: this.winner,
      hostId: this.players[0] ? this.players[0].id : null,
      you: you ? { id: you.id, hand: you.hand } : null,
      players: this.players.map((p) => ({
        id: p.id,
        name: p.name,
        connected: p.connected,
        handCount: p.hand.length,
        bank: p.bank,
        props: p.props
      })),
      pending: this.pending,
      log: this.log.slice(-8),
      events: this.events
    }
  }
}

module.exports = Game

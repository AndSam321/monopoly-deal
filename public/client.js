const COLORS = {
  brown: { label: "Brown", hex: "#8a5a3b", size: 2, rent: [1, 2] },
  lightblue: { label: "Light Blue", hex: "#8fd8ec", size: 3, rent: [1, 2, 3] },
  pink: { label: "Pink", hex: "#d63f9d", size: 3, rent: [1, 2, 4] },
  orange: { label: "Orange", hex: "#f28b1f", size: 3, rent: [1, 3, 5] },
  red: { label: "Red", hex: "#dc3232", size: 3, rent: [2, 3, 6] },
  yellow: { label: "Yellow", hex: "#f0c22e", size: 3, rent: [2, 4, 6] },
  green: { label: "Green", hex: "#1f9e53", size: 3, rent: [2, 4, 7] },
  darkblue: { label: "Dark Blue", hex: "#2d5bd1", size: 2, rent: [3, 8] },
  railroad: { label: "Railroad", hex: "#3a3a3a", size: 4, rent: [1, 2, 3, 4] },
  utility: { label: "Utility", hex: "#a4b944", size: 2, rent: [1, 2] }
}

const ACTION_ICONS = {
  dealbreaker: "💥",
  justsayno: "🚫",
  passgo: "🎲",
  forceddeal: "🔄",
  slydeal: "🕵️",
  debtcollector: "💵",
  birthday: "🎂",
  house: "🏠",
  hotel: "🏨",
  doublerent: "✖️2"
}

const BANNER_TEXT = {
  dealbreaker: "DEAL BREAKER!",
  justsayno: "JUST SAY NO!",
  forceddeal: "FORCED DEAL!",
  slydeal: "SLY DEAL!",
  debtcollector: "DEBT COLLECTOR!",
  birthday: "IT'S MY BIRTHDAY!",
  passgo: "PASS GO"
}

const socket = io()
const $ = (id) => document.getElementById(id)

let state = null
let myId = null
let session = JSON.parse(sessionStorage.getItem("md-session") || "null")
let openModalKey = null
let logCount = 0

function saveSession(code, playerId, name) {
  session = { code, playerId, name }
  sessionStorage.setItem("md-session", JSON.stringify(session))
}

function show(screen) {
  for (const id of ["screen-home", "screen-lobby", "screen-game"]) {
    $(id).classList.toggle("hidden", id !== screen)
  }
}

/* ---------- Home & lobby ---------- */

$("create-btn").addEventListener("click", () => {
  const name = $("name-input").value.trim()
  if (!name) return toast("Enter your name first")
  socket.emit("create-room", { name })
})

$("join-btn").addEventListener("click", joinRoom)
$("code-input").addEventListener("keydown", (e) => { if (e.key === "Enter") joinRoom() })

function joinRoom() {
  const name = $("name-input").value.trim()
  const code = $("code-input").value.trim().toUpperCase()
  if (!name) return toast("Enter your name first")
  if (code.length !== 4) return toast("Room codes are 4 letters")
  socket.emit("join-room", { code, name })
}

$("start-btn").addEventListener("click", () => socket.emit("start-game"))
$("end-turn-btn").addEventListener("click", () => socket.emit("end-turn"))
$("deck").addEventListener("click", () => {
  if (state && state.phase === "draw" && state.turn === myId) socket.emit("draw")
})

socket.on("joined", ({ code, playerId }) => {
  myId = playerId
  saveSession(code, playerId, $("name-input").value.trim() || (session && session.name))
})

socket.on("connect", () => {
  if (session) {
    myId = session.playerId
    socket.emit("join-room", { code: session.code, name: session.name, playerId: session.playerId })
  }
})

socket.on("game-error", (msg) => {
  if (msg.includes("Room not found") && session && !state) {
    sessionStorage.removeItem("md-session")
    session = null
    show("screen-home")
    return
  }
  toast(msg)
})

socket.on("state", (s) => {
  const prev = state
  state = s
  if (s.you) {
    myId = s.you.id
    const mine = s.players.find((p) => p.id === myId)
    if (mine) mine.hand = s.you.hand
  }
  if (s.phase === "lobby") {
    renderLobby()
    show("screen-lobby")
    return
  }
  show("screen-game")
  render()
  runEvents(s.events, prev)
})

function renderLobby() {
  $("lobby-code").textContent = state.code
  const list = $("lobby-players")
  list.innerHTML = ""
  for (const p of state.players) {
    const li = document.createElement("li")
    li.textContent = p.name + (p.id === myId ? " (you)" : "")
    list.appendChild(li)
  }
  const isHost = state.hostId === myId
  $("start-btn").classList.toggle("hidden", !(isHost && state.players.length >= 2))
  $("lobby-wait").textContent = state.players.length < 2
    ? "Waiting for a player to join…"
    : (isHost ? "" : "Waiting for the host to start…")
}

/* ---------- Card faces ---------- */

function cardFace(card, cls = "card") {
  const el = document.createElement("div")
  el.className = cls
  if (card.type === "money") {
    el.classList.add("face-money", `money-${card.value}`)
    el.innerHTML = `<div class="amount">$${card.value}MM</div><div class="hat">🎩</div>`
  } else if (card.type === "property") {
    const c = COLORS[card.color]
    el.classList.add("face-prop")
    el.innerHTML = `<div class="bar" style="background:${c.hex}">${propIcon(card)}${card.name}</div>
      <div class="rents">${c.rent.map((r, i) => `<div><span>${i + 1} card${i ? "s" : ""}</span><span>$${r}MM</span></div>`).join("")}</div>
      <span class="corner-value">$${card.value}MM</span>`
  } else if (card.type === "wild") {
    el.classList.add("face-prop")
    if (card.colors === "any") {
      el.innerHTML = `<div class="bar rainbow">WILD</div><div class="wild-note">Use as any color property</div>`
    } else {
      const [a, b] = card.colors
      el.innerHTML = `<div class="bar split"><div style="background:${COLORS[a].hex}"></div><div style="background:${COLORS[b].hex}"></div></div>
        <div class="wild-note">${COLORS[a].label} or ${COLORS[b].label}</div>
        <span class="corner-value">$${card.value}MM</span>`
    }
  } else if (card.type === "rent") {
    el.classList.add("face-rent")
    const circle = card.colors === "any"
      ? `<div class="rent-circle rainbow"></div>`
      : `<div class="rent-circle"><div style="background:${COLORS[card.colors[0]].hex}"></div><div style="background:${COLORS[card.colors[1]].hex}"></div></div>`
    const text = card.colors === "any" ? "Charge one player rent on any of your colors" : `${COLORS[card.colors[0]].label} or ${COLORS[card.colors[1]].label}`
    el.innerHTML = `${circle}<div class="r-name">RENT</div><div class="a-text">${text}</div><span class="corner-value">$${card.value}MM</span>`
  } else {
    el.classList.add("face-action")
    el.innerHTML = `<div class="icon">${ACTION_ICONS[card.kind] || "⚡"}</div>
      <div class="a-name">${card.name}</div><div class="a-text">${card.text}</div>
      <span class="corner-value">$${card.value}MM</span>`
  }
  const tags = { money: "MONEY", property: "PROPERTY", wild: "WILD", rent: "RENT", action: "ACTION" }
  el.insertAdjacentHTML("beforeend", `<div class="type-tag tag-${card.type}">${tags[card.type]}</div>`)
  return el
}

function propIcon(card) {
  if (card.color === "railroad") return "🚂 "
  if (card.name === "Electric Company") return "⚡ "
  if (card.name === "Water Works") return "💧 "
  return "🏠 "
}

function smallPropCard(card) {
  const el = document.createElement("div")
  el.className = "pcard"
  el.dataset.uid = card.uid
  if (card.type === "wild") {
    if (card.colors === "any") {
      el.classList.add("wild-any")
      el.innerHTML = `<div class="pbar"></div><div class="pname">WILD</div>`
    } else {
      el.innerHTML = `<div class="pbar" style="background:linear-gradient(90deg,${COLORS[card.colors[0]].hex} 50%,${COLORS[card.colors[1]].hex} 50%)"></div><div class="pname">WILD</div>`
    }
  } else if (card.type === "action") {
    el.innerHTML = `<div class="pbar" style="background:#3a3a3a"></div><div class="pname">${ACTION_ICONS[card.kind]} ${card.name}</div>`
  } else {
    el.innerHTML = `<div class="pbar" style="background:${COLORS[card.color].hex}"></div><div class="pname">${card.name}</div>`
  }
  return el
}

/* ---------- Table rendering ---------- */

function me() { return state.players.find((p) => p.id === myId) }
function opponents() { return state.players.filter((p) => p.id !== myId) }

function bankPile(player) {
  const wrap = document.createElement("div")
  wrap.className = "bank-pile"
  const total = player.bank.reduce((s, c) => s + c.value, 0)
  wrap.innerHTML = `<div class="bank-label">BANK</div>`
  const chips = document.createElement("div")
  chips.className = "bank-chips"
  for (const card of player.bank) {
    const chip = document.createElement("div")
    chip.className = "chip"
    chip.dataset.uid = card.uid
    chip.textContent = `$${card.value}`
    chips.appendChild(chip)
  }
  wrap.appendChild(chips)
  wrap.insertAdjacentHTML("beforeend", `<div class="bank-total">$${total}MM</div>`)
  return wrap
}

function propArea(player, mine) {
  const area = document.createElement("div")
  area.className = "prop-area"
  const myTurnFree = mine && state.turn === myId && state.phase === "play" && !state.pending
  for (const [color, pile] of Object.entries(player.props)) {
    if (!pile.cards.length && !pile.buildings.length) continue
    const info = COLORS[color]
    const pileEl = document.createElement("div")
    pileEl.className = "prop-pile"
    const stack = document.createElement("div")
    stack.className = "prop-stack"
    for (const card of pile.cards) {
      const el = smallPropCard(card)
      if (myTurnFree && card.type === "wild") {
        el.classList.add("clickable")
        el.addEventListener("click", () => openWildFlip(card))
      }
      stack.appendChild(el)
    }
    pileEl.appendChild(stack)
    const complete = pile.cards.length >= info.size
    const badge = document.createElement("div")
    badge.className = "set-badge" + (complete ? " complete" : "")
    badge.textContent = complete ? "SET ✓" : `${pile.cards.length}/${info.size}`
    badge.style.borderBottom = `3px solid ${info.hex}`
    pileEl.appendChild(badge)
    if (pile.buildings.length) {
      const b = document.createElement("div")
      b.className = "bldg-badge"
      b.textContent = pile.buildings.map((c) => (c.kind === "house" ? "🏠" : "🏨")).join(" ")
      pileEl.appendChild(b)
    }
    area.appendChild(pileEl)
  }
  return area
}

function completedSetCount(player) {
  let sets = 0
  for (const [color, pile] of Object.entries(player.props)) {
    sets += Math.floor(pile.cards.length / COLORS[color].size)
  }
  return sets
}

function render() {
  const opp = $("opponents")
  opp.innerHTML = ""
  for (const p of opponents()) {
    const seat = document.createElement("div")
    seat.className = "seat" + (state.turn === p.id ? " active" : "")
    seat.dataset.playerId = p.id
    const head = document.createElement("div")
    head.className = "seat-head"
    head.innerHTML = `<span class="seat-name">${escapeHtml(p.name)} ${p.connected ? "" : '<span class="offline">• offline</span>'}</span>`
    const mini = document.createElement("div")
    mini.className = "mini-hand"
    for (let i = 0; i < Math.min(p.handCount, 10); i++) {
      mini.insertAdjacentHTML("beforeend", `<div class="mini-card"></div>`)
    }
    head.appendChild(mini)
    head.insertAdjacentHTML("beforeend", `<span class="seat-sets">${completedSetCount(p)}/3 sets</span>`)
    seat.appendChild(head)
    const row = document.createElement("div")
    row.className = "table-row"
    row.appendChild(bankPile(p))
    row.appendChild(propArea(p, false))
    seat.appendChild(row)
    opp.appendChild(seat)
  }

  $("deck-count").textContent = state.deckCount
  $("deck").classList.toggle("drawable", state.phase === "draw" && state.turn === myId)
  const slot = $("discard-slot")
  slot.innerHTML = ""
  if (state.discardTop) slot.appendChild(cardFace(state.discardTop))
  else slot.innerHTML = `<div class="placeholder"></div>`

  renderStatus()
  renderLog()

  const myArea = $("me")
  myArea.classList.toggle("active", state.turn === myId)
  const table = $("my-table")
  table.innerHTML = ""
  const my = me()
  table.appendChild(bankPile(my))
  table.appendChild(propArea(my, true))

  const pips = $("plays-pips")
  pips.innerHTML = ""
  for (let i = 0; i < 3; i++) {
    pips.insertAdjacentHTML("beforeend", `<div class="pip${state.turn === myId && state.phase === "play" && i < state.playsLeft ? " on" : ""}"></div>`)
  }
  $("end-turn-btn").classList.toggle("hidden", !(state.turn === myId && state.phase === "play" && !state.pending))

  renderHand()
  syncModals()
}

function renderHand() {
  const hand = $("my-hand")
  hand.innerHTML = ""
  const cards = me().hand
  const canPlay = state.turn === myId && state.phase === "play" && !state.pending && state.playsLeft > 0
  const n = cards.length
  const landscape = window.matchMedia("(max-height: 520px) and (orientation: landscape)").matches
  const cardW = landscape ? 54 : window.matchMedia("(max-width: 700px)").matches ? 66 : 82
  const available = Math.max(hand.clientWidth - 24, cardW)
  let overlap = n > 1 ? (n * cardW - available) / (n - 1) : 0
  overlap = Math.min(Math.max(overlap, 24), cardW - 16)
  cards.forEach((card, i) => {
    const el = cardFace(card, "card hand-card")
    el.dataset.uid = card.uid
    const mid = (n - 1) / 2
    el.style.margin = `0 ${-overlap / 2}px`
    el.style.setProperty("--fan-rot", `${(i - mid) * (n > 8 ? 3 : 4)}deg`)
    el.style.setProperty("--fan-y", `${Math.abs(i - mid) * (n > 8 ? 4 : 5)}px`)
    el.style.zIndex = i
    el.dataset.z = i
    if (canPlay) {
      el.addEventListener("click", () => openCardMenu(card))
    } else {
      el.classList.add("disabled")
    }
    hand.appendChild(el)
  })
  canPlayHand = canPlay
}

let canPlayHand = false
let peekEl = null

function magnifyHand(clientX) {
  let best = null
  let bestBoost = 0
  for (const el of $("my-hand").querySelectorAll(".hand-card")) {
    const r = el.getBoundingClientRect()
    const dist = Math.abs(clientX - (r.left + r.width / 2))
    const boost = Math.max(0, 1 - dist / 130)
    el.style.setProperty("--peek", boost.toFixed(3))
    el.style.zIndex = boost > 0.05 ? 40 + Math.round(boost * 20) : el.dataset.z
    if (boost > bestBoost) {
      bestBoost = boost
      best = el
    }
  }
  peekEl = bestBoost > 0.4 ? best : null
}

function resetMagnify() {
  for (const el of $("my-hand").querySelectorAll(".hand-card")) {
    el.style.setProperty("--peek", "0")
    el.style.zIndex = el.dataset.z
  }
  peekEl = null
}

const handEl = $("my-hand")
handEl.addEventListener("pointermove", (e) => {
  if (e.pointerType !== "touch") magnifyHand(e.clientX)
})
handEl.addEventListener("pointerleave", resetMagnify)
handEl.addEventListener("touchmove", (e) => {
  e.preventDefault()
  magnifyHand(e.touches[0].clientX)
}, { passive: false })
handEl.addEventListener("touchend", () => {
  if (peekEl && canPlayHand && state && state.you) {
    const card = state.you.hand.find((c) => c.uid === peekEl.dataset.uid)
    if (card) openCardMenu(card)
  }
  resetMagnify()
})

function renderStatus() {
  const el = $("turn-status")
  const current = state.players.find((p) => p.id === state.turn)
  if (state.winner) {
    el.innerHTML = ""
    return
  }
  if (state.pending) {
    const waiting = state.pending.targets.filter((t) => !t.done).map((t) => nameOf(t.playerId))
    el.innerHTML = `${escapeHtml(state.pending.label)}<span class="sub">waiting for ${escapeHtml(waiting.join(", "))}…</span>`
    return
  }
  if (state.turn === myId) {
    if (state.phase === "draw") el.innerHTML = `Your turn!<span class="sub">tap the deck to draw</span>`
    else if (state.phase === "discard") el.innerHTML = `Too many cards<span class="sub">discard down to 7</span>`
    else el.innerHTML = `Your turn<span class="sub">${state.playsLeft} play${state.playsLeft === 1 ? "" : "s"} left</span>`
  } else {
    el.innerHTML = `${escapeHtml(current.name)}'s turn<span class="sub">${state.phase === "draw" ? "drawing…" : "playing…"}</span>`
  }
}

function renderLog() {
  const el = $("log")
  el.innerHTML = ""
  for (const line of state.log) {
    const div = document.createElement("div")
    div.textContent = line
    el.appendChild(div)
  }
}

function nameOf(id) {
  const p = state.players.find((p) => p.id === id)
  return p ? p.name : "?"
}

function escapeHtml(str) {
  const div = document.createElement("div")
  div.textContent = str
  return div.innerHTML
}

/* ---------- Modals ---------- */

function openModal(key, build) {
  openModalKey = key
  const modal = $("modal")
  modal.innerHTML = ""
  build(modal)
  $("modal-overlay").classList.remove("hidden")
}

function closeModal() {
  openModalKey = null
  $("modal-overlay").classList.add("hidden")
}

function modalActions(modal, buttons) {
  const row = document.createElement("div")
  row.className = "modal-actions"
  for (const { label, cls, onClick, disabled } of buttons) {
    const btn = document.createElement("button")
    btn.className = `btn ${cls || "btn-red"}`
    btn.textContent = label
    btn.disabled = !!disabled
    btn.addEventListener("click", onClick)
    row.appendChild(btn)
  }
  modal.appendChild(row)
  return row
}

function syncModals() {
  if (state.winner) {
    closeModal()
    showWin()
    return
  }
  const pendingKey = pendingModalKey()
  if (pendingKey) {
    if (openModalKey !== pendingKey) buildPendingModal(pendingKey)
    return
  }
  if (openModalKey && openModalKey.startsWith("pending")) closeModal()
  if (state.phase === "discard" && state.turn === myId) {
    const key = `discard-${me().hand.length}`
    if (openModalKey !== key) buildDiscardModal(key)
    return
  }
  if (openModalKey && openModalKey.startsWith("discard")) closeModal()
  if (openModalKey && openModalKey.startsWith("menu") && !(state.turn === myId && state.phase === "play" && !state.pending)) {
    closeModal()
  }
}

function pendingModalKey() {
  if (!state.pending) return null
  const t = state.pending.targets.find((t) => !t.done && t.decider === myId)
  if (!t) return null
  return `pending-${state.pending.action}-${t.playerId}-${t.stage}-${t.jsnCount}`
}

function buildPendingModal(key) {
  const pending = state.pending
  const target = pending.targets.find((t) => !t.done && t.decider === myId)
  if (target.stage === "jsn") {
    const beingTargeted = target.playerId === myId
    openModal(key, (modal) => {
      if (beingTargeted) {
        modal.innerHTML = `<h2>${escapeHtml(nameOf(pending.source))} played ${escapeHtml(pending.label)}</h2>
          <p>You have a Just Say No! Cancel it, or let it happen?</p>`
        modalActions(modal, [
          { label: "Accept it", cls: "btn-ghost", onClick: () => socket.emit("respond-jsn", { useJsn: false }) },
          { label: "🚫 Just Say No!", onClick: () => socket.emit("respond-jsn", { useJsn: true }) }
        ])
      } else {
        modal.innerHTML = `<h2>${escapeHtml(nameOf(target.playerId))} said NO!</h2>
          <p>Counter with your own Just Say No to force it through?</p>`
        modalActions(modal, [
          { label: "Let it go", cls: "btn-ghost", onClick: () => socket.emit("respond-jsn", { useJsn: false }) },
          { label: "🚫 Counter — Say No!", onClick: () => socket.emit("respond-jsn", { useJsn: true }) }
        ])
      }
    })
  } else if (target.stage === "pay") {
    buildPaymentModal(key, target)
  }
}

function buildPaymentModal(key, target) {
  const my = me()
  const tableCards = [...my.bank]
  for (const pile of Object.values(my.props)) tableCards.push(...pile.cards, ...pile.buildings)
  const selected = new Set(suggestPayment(target.amount, my.bank, tableCards.filter((c) => !my.bank.includes(c))))
  openModal(key, (modal) => {
    modal.innerHTML = `<h2>Pay ${escapeHtml(nameOf(state.pending.source))} $${target.amount}MM</h2>
      <p>${escapeHtml(state.pending.label)} — pick cards from your bank and properties. No change given!</p>
      <div class="pay-total"></div>`
    const grid = document.createElement("div")
    grid.className = "modal-cards"
    for (const card of tableCards) {
      const el = cardFace(card)
      if (selected.has(card.uid)) el.classList.add("selected")
      el.addEventListener("click", () => {
        if (selected.has(card.uid)) selected.delete(card.uid)
        else selected.add(card.uid)
        el.classList.toggle("selected")
        update()
      })
      grid.appendChild(el)
    }
    modal.appendChild(grid)
    const actions = modalActions(modal, [
      { label: "Pay", onClick: () => socket.emit("pay", { uids: [...selected] }) }
    ])
    const payBtn = actions.querySelector("button")
    const totalEl = modal.querySelector(".pay-total")
    const update = () => {
      const total = tableCards.filter((c) => selected.has(c.uid)).reduce((s, c) => s + c.value, 0)
      const allSelected = selected.size === tableCards.length
      const enough = total >= target.amount || allSelected
      totalEl.innerHTML = `Selected: <span class="${enough ? "ok" : "short"}">$${total}MM</span> of $${target.amount}MM`
      payBtn.disabled = !enough
      payBtn.textContent = allSelected && total < target.amount ? "Pay everything" : `Pay $${total}MM`
    }
    update()
  })
}

function suggestPayment(amount, bankCards, propCards) {
  const picked = []
  let total = 0
  const sortedBank = [...bankCards].sort((a, b) => a.value - b.value)
  for (const card of [...sortedBank].reverse()) {
    if (total >= amount) break
    if (total + card.value <= amount) {
      picked.push(card.uid)
      total += card.value
    }
  }
  for (const card of sortedBank) {
    if (total >= amount) break
    if (!picked.includes(card.uid)) {
      picked.push(card.uid)
      total += card.value
    }
  }
  for (const card of [...propCards].sort((a, b) => a.value - b.value)) {
    if (total >= amount) break
    picked.push(card.uid)
    total += card.value
  }
  return picked
}

function buildDiscardModal(key) {
  const my = me()
  const mustDrop = my.hand.length - 7
  const selected = new Set()
  openModal(key, (modal) => {
    modal.innerHTML = `<h2>Discard ${mustDrop} card${mustDrop === 1 ? "" : "s"}</h2>
      <p>The hand limit is 7 at the end of your turn.</p>`
    const grid = document.createElement("div")
    grid.className = "modal-cards"
    for (const card of my.hand) {
      const el = cardFace(card)
      el.addEventListener("click", () => {
        if (selected.has(card.uid)) selected.delete(card.uid)
        else if (selected.size < mustDrop) selected.add(card.uid)
        el.classList.toggle("selected", selected.has(card.uid))
        btn.disabled = selected.size !== mustDrop
      })
      grid.appendChild(el)
    }
    modal.appendChild(grid)
    const actions = modalActions(modal, [
      { label: "Discard", disabled: true, onClick: () => socket.emit("discard", { uids: [...selected] }) }
    ])
    const btn = actions.querySelector("button")
  })
}

/* ---------- Playing cards ---------- */

function openCardMenu(card) {
  openModal(`menu-${card.uid}`, (modal) => {
    modal.innerHTML = `<h2>${escapeHtml(card.name || (card.type === "money" ? `$${card.value}MM` : card.type === "wild" ? "Property Wildcard" : "Rent"))}</h2>`
    const list = document.createElement("div")
    list.className = "menu-list"
    modal.appendChild(list)
    const item = (label, onClick) => {
      const btn = document.createElement("button")
      btn.className = "menu-item"
      btn.innerHTML = label
      btn.addEventListener("click", onClick)
      list.appendChild(btn)
    }

    if (card.type === "money") {
      item(`💰 Add $${card.value}MM to your bank`, () => { socket.emit("play-bank", { uid: card.uid }); closeModal() })
    }
    if (card.type === "property") {
      item(`🏠 Play ${escapeHtml(card.name)}`, () => { socket.emit("play-property", { uid: card.uid }); closeModal() })
    }
    if (card.type === "wild") {
      item("🌈 Play as a property…", () => pickWildColor(card))
    }
    if (card.type === "rent") {
      item("💸 Charge rent…", () => pickRentColor(card))
    }
    if (card.type === "action") {
      switch (card.kind) {
        case "passgo":
          item("🎲 Pass Go — draw 2 cards", () => { socket.emit("play-action", { uid: card.uid, opts: {} }); closeModal() })
          break
        case "birthday":
          item("🎂 It's my birthday — everyone pays $2MM", () => { socket.emit("play-action", { uid: card.uid, opts: {} }); closeModal() })
          break
        case "debtcollector":
          item("💵 Collect a $5MM debt…", () => pickOpponent((targetId) => {
            socket.emit("play-action", { uid: card.uid, opts: { targetId } })
            closeModal()
          }))
          break
        case "slydeal":
          item("🕵️ Steal a property…", () => pickOpponentCard(card, false))
          break
        case "forceddeal":
          item("🔄 Swap properties…", () => pickOpponentCard(card, true))
          break
        case "dealbreaker":
          item("💥 Steal a complete set…", () => pickDealBreakerSet(card))
          break
        case "house":
        case "hotel":
          item(`${ACTION_ICONS[card.kind]} Place on a set…`, () => pickBuildingSet(card))
          break
        case "justsayno":
          modal.insertAdjacentHTML("beforeend", `<p>Just Say No plays itself when someone targets you — from your hand, it can only be banked.</p>`)
          break
        case "doublerent":
          modal.insertAdjacentHTML("beforeend", `<p>Play this from the rent card's menu — charge rent and tick "double it".</p>`)
          break
      }
    }
    if (card.type !== "property" && card.type !== "wild") {
      item(`🏦 Bank it as $${card.value}MM`, () => { socket.emit("play-bank", { uid: card.uid }); closeModal() })
    }
    modalActions(modal, [{ label: "Cancel", cls: "btn-ghost", onClick: closeModal }])
  })
}

function colorGrid(modal, colors, onPick) {
  const grid = document.createElement("div")
  grid.className = "color-grid"
  for (const color of colors) {
    const sw = document.createElement("button")
    sw.className = "color-swatch"
    sw.style.background = COLORS[color].hex
    sw.textContent = COLORS[color].label
    sw.addEventListener("click", () => onPick(color))
    grid.appendChild(sw)
  }
  modal.appendChild(grid)
}

function pickWildColor(card) {
  const colors = card.colors === "any" ? Object.keys(COLORS) : card.colors
  openModal(`wild-${card.uid}`, (modal) => {
    modal.innerHTML = `<h2>Play wildcard as…</h2>`
    colorGrid(modal, colors, (color) => {
      socket.emit("play-property", { uid: card.uid, color })
      closeModal()
    })
    modalActions(modal, [{ label: "Back", cls: "btn-ghost", onClick: () => openCardMenu(card) }])
  })
}

function openWildFlip(card) {
  const colors = (card.colors === "any" ? Object.keys(COLORS) : card.colors).filter((c) => c !== card.assignedColor)
  openModal(`flip-${card.uid}`, (modal) => {
    modal.innerHTML = `<h2>Move wildcard to…</h2><p>Free — doesn't use a play.</p>`
    colorGrid(modal, colors, (color) => {
      socket.emit("flip-wild", { uid: card.uid, color })
      closeModal()
    })
    modalActions(modal, [{ label: "Cancel", cls: "btn-ghost", onClick: closeModal }])
  })
}

function pickRentColor(card) {
  const my = me()
  const owned = Object.entries(my.props).filter(([, pile]) => pile.cards.length > 0).map(([color]) => color)
  const options = card.colors === "any" ? owned : card.colors.filter((c) => owned.includes(c))
  if (!options.length) return toast("You don't own properties in those colors yet")
  const dtr = my.hand.find((c) => c.type === "action" && c.kind === "doublerent")
  const canDouble = dtr && state.playsLeft >= 2
  openModal(`rent-${card.uid}`, (modal) => {
    modal.innerHTML = `<h2>Charge rent on…</h2>`
    let doubled = false
    colorGrid(modal, options, (color) => {
      const opts = { color, doubleRentUid: doubled ? dtr.uid : undefined }
      if (card.colors === "any") {
        pickOpponent((targetId) => {
          socket.emit("play-action", { uid: card.uid, opts: { ...opts, targetId } })
          closeModal()
        })
      } else {
        socket.emit("play-action", { uid: card.uid, opts })
        closeModal()
      }
    })
    if (canDouble) {
      const row = document.createElement("label")
      row.className = "dtr-row"
      row.innerHTML = `<input type="checkbox"> ✖️2 Double the Rent (uses 2 plays)`
      row.querySelector("input").addEventListener("change", (e) => { doubled = e.target.checked })
      modal.appendChild(row)
    }
    modalActions(modal, [{ label: "Back", cls: "btn-ghost", onClick: () => openCardMenu(card) }])
  })
}

function pickOpponent(cb) {
  const opps = opponents()
  if (opps.length === 1) return cb(opps[0].id)
  openModal("pick-opponent", (modal) => {
    modal.innerHTML = `<h2>Against who?</h2>`
    const list = document.createElement("div")
    list.className = "menu-list"
    for (const p of opps) {
      const btn = document.createElement("button")
      btn.className = "menu-item"
      btn.textContent = p.name
      btn.addEventListener("click", () => cb(p.id))
      list.appendChild(btn)
    }
    modal.appendChild(list)
    modalActions(modal, [{ label: "Cancel", cls: "btn-ghost", onClick: closeModal }])
  })
}

function stealableUids(player) {
  const uids = new Set()
  for (const [color, pile] of Object.entries(player.props)) {
    if (pile.cards.length === COLORS[color].size) continue
    for (const card of pile.cards) uids.add(card.uid)
  }
  return uids
}

function pickOpponentCard(actionCard, isSwap) {
  pickOpponent((targetId) => {
    const target = state.players.find((p) => p.id === targetId)
    const stealable = stealableUids(target)
    const all = Object.values(target.props).flatMap((pile) => pile.cards)
    if (!all.length) return toast(`${target.name} has no properties yet`)
    if (!stealable.size) return toast("All their properties are locked in complete sets")
    openModal(`steal-${actionCard.uid}`, (modal) => {
      modal.innerHTML = `<h2>Take which property?</h2><p>Cards in complete sets can't be taken.</p>`
      const grid = document.createElement("div")
      grid.className = "modal-cards"
      for (const card of all) {
        const el = cardFace(card)
        if (!stealable.has(card.uid)) el.classList.add("dimmed")
        else el.addEventListener("click", () => {
          if (isSwap) pickMyCardForSwap(actionCard, targetId, card.uid)
          else {
            socket.emit("play-action", { uid: actionCard.uid, opts: { targetId, cardUid: card.uid } })
            closeModal()
          }
        })
        grid.appendChild(el)
      }
      modal.appendChild(grid)
      modalActions(modal, [{ label: "Cancel", cls: "btn-ghost", onClick: closeModal }])
    })
  })
}

function pickMyCardForSwap(actionCard, targetId, theirUid) {
  const mine = Object.values(me().props).flatMap((pile) => pile.cards)
  if (!mine.length) return toast("You need a property to trade away")
  openModal(`swap-${actionCard.uid}`, (modal) => {
    modal.innerHTML = `<h2>Give which of yours?</h2>`
    const grid = document.createElement("div")
    grid.className = "modal-cards"
    for (const card of mine) {
      const el = cardFace(card)
      el.addEventListener("click", () => {
        socket.emit("play-action", { uid: actionCard.uid, opts: { targetId, cardUid: theirUid, myCardUid: card.uid } })
        closeModal()
      })
      grid.appendChild(el)
    }
    modal.appendChild(grid)
    modalActions(modal, [{ label: "Cancel", cls: "btn-ghost", onClick: closeModal }])
  })
}

function pickDealBreakerSet(actionCard) {
  pickOpponent((targetId) => {
    const target = state.players.find((p) => p.id === targetId)
    const complete = Object.entries(target.props)
      .filter(([color, pile]) => pile.cards.length >= COLORS[color].size)
      .map(([color]) => color)
    if (!complete.length) return toast(`${target.name} has no complete sets yet`)
    openModal(`db-${actionCard.uid}`, (modal) => {
      modal.innerHTML = `<h2>Steal which set?</h2>`
      colorGrid(modal, complete, (color) => {
        socket.emit("play-action", { uid: actionCard.uid, opts: { targetId, color } })
        closeModal()
      })
      modalActions(modal, [{ label: "Cancel", cls: "btn-ghost", onClick: closeModal }])
    })
  })
}

function pickBuildingSet(card) {
  const my = me()
  const eligible = Object.entries(my.props)
    .filter(([color, pile]) => {
      if (color === "railroad" || color === "utility") return false
      if (pile.cards.length < COLORS[color].size) return false
      const hasHouse = pile.buildings.some((b) => b.kind === "house")
      const hasHotel = pile.buildings.some((b) => b.kind === "hotel")
      return card.kind === "house" ? !hasHouse : hasHouse && !hasHotel
    })
    .map(([color]) => color)
  if (!eligible.length) {
    return toast(card.kind === "house" ? "You need a complete set (not railroads/utilities) first" : "You need a set with a house first")
  }
  openModal(`bldg-${card.uid}`, (modal) => {
    modal.innerHTML = `<h2>Place the ${card.kind} on…</h2>`
    colorGrid(modal, eligible, (color) => {
      socket.emit("play-action", { uid: card.uid, opts: { color } })
      closeModal()
    })
    modalActions(modal, [{ label: "Back", cls: "btn-ghost", onClick: () => openCardMenu(card) }])
  })
}

/* ---------- Events & animation ---------- */

function runEvents(events, prev) {
  for (const e of events || []) {
    if (e.type === "draw") animateDraw(e)
    if (e.type === "play") animatePlay(e)
    if (e.type === "action") {
      animatePlay({ ...e, dest: "discard" })
      const text = e.card.type === "rent" ? "RENT!" : BANNER_TEXT[e.card.kind]
      if (text) banner(`${nameOf(e.player)}: ${text}`)
    }
    if (e.type === "jsn") banner(`${nameOf(e.player)}: JUST SAY NO! 🚫`)
    if (e.type === "payment" || e.type === "steal") animateTransfer(e)
    if (e.type === "win") showWin()
  }
}

function seatRect(playerId) {
  if (playerId === myId) return $("me").getBoundingClientRect()
  const seat = document.querySelector(`.seat[data-player-id="${playerId}"]`)
  return (seat || $("opponents")).getBoundingClientRect()
}

function fly(fromRect, toRect, el, delay = 0) {
  el.classList.add("fly-card")
  el.style.left = `${fromRect.left + fromRect.width / 2 - 41}px`
  el.style.top = `${fromRect.top + fromRect.height / 2 - 58}px`
  document.body.appendChild(el)
  setTimeout(() => {
    el.style.left = `${toRect.left + toRect.width / 2 - 41}px`
    el.style.top = `${toRect.top + toRect.height / 2 - 58}px`
    el.style.transform = "scale(0.6)"
    el.style.opacity = "0.4"
  }, 30 + delay)
  setTimeout(() => el.remove(), 700 + delay)
}

function animateDraw(e) {
  const deckRect = $("deck").getBoundingClientRect()
  const toRect = e.player === myId ? $("my-hand").getBoundingClientRect() : seatRect(e.player)
  for (let i = 0; i < e.count; i++) {
    const back = document.createElement("div")
    back.className = "card card-back"
    fly(deckRect, toRect, back, i * 90)
  }
}

function animatePlay(e) {
  const fromRect = e.player === myId ? $("my-hand").getBoundingClientRect() : seatRect(e.player)
  const toRect = e.dest === "discard"
    ? $("discard-slot").getBoundingClientRect()
    : seatRect(e.player)
  fly(fromRect, toRect, cardFace(e.card))
}

function animateTransfer(e) {
  const fromRect = seatRect(e.from)
  const toRect = seatRect(e.to)
  e.cards.slice(0, 6).forEach((card, i) => fly(fromRect, toRect, cardFace(card), i * 100))
}

let bannerTimer = null

function banner(text) {
  const el = $("banner")
  el.textContent = text
  el.classList.add("hidden")
  void el.offsetWidth
  el.classList.remove("hidden")
  clearTimeout(bannerTimer)
  bannerTimer = setTimeout(() => el.classList.add("hidden"), 2200)
}

let toastTimer = null

function toast(msg) {
  const el = $("toast")
  el.textContent = msg
  el.classList.remove("hidden")
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => el.classList.add("hidden"), 2600)
}

function showWin() {
  if ($("win-splash")) return
  const winner = nameOf(state.winner)
  const splash = document.createElement("div")
  splash.id = "win-splash"
  splash.innerHTML = `<h1>${escapeHtml(winner)} WINS! 🏆</h1>`
  const again = document.createElement("button")
  again.className = "btn btn-red"
  again.style.width = "auto"
  again.textContent = "Back to home"
  again.addEventListener("click", () => {
    sessionStorage.removeItem("md-session")
    location.reload()
  })
  splash.appendChild(again)
  document.body.appendChild(splash)
  confetti()
}

function confetti() {
  const colors = ["#d92b2b", "#e9b64b", "#1f9e53", "#2d5bd1", "#f7f1e1", "#d63f9d"]
  for (let i = 0; i < 120; i++) {
    const piece = document.createElement("div")
    piece.className = "confetti"
    piece.style.left = `${Math.random() * 100}vw`
    piece.style.background = colors[Math.floor(Math.random() * colors.length)]
    piece.style.animationDuration = `${2 + Math.random() * 2.5}s`
    piece.style.animationDelay = `${Math.random() * 1.2}s`
    piece.style.borderRadius = Math.random() > 0.5 ? "50%" : "2px"
    document.body.appendChild(piece)
    setTimeout(() => piece.remove(), 6000)
  }
}

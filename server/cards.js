const COLORS = {
  brown: { label: "Brown", hex: "#8a5a3b", size: 2, rent: [1, 2], value: 1 },
  lightblue: { label: "Light Blue", hex: "#8fd8ec", size: 3, rent: [1, 2, 3], value: 1 },
  pink: { label: "Pink", hex: "#d63f9d", size: 3, rent: [1, 2, 4], value: 2 },
  orange: { label: "Orange", hex: "#f28b1f", size: 3, rent: [1, 3, 5], value: 2 },
  red: { label: "Red", hex: "#dc3232", size: 3, rent: [2, 3, 6], value: 3 },
  yellow: { label: "Yellow", hex: "#f0c22e", size: 3, rent: [2, 4, 6], value: 3 },
  green: { label: "Green", hex: "#1f9e53", size: 3, rent: [2, 4, 7], value: 4 },
  darkblue: { label: "Dark Blue", hex: "#2d5bd1", size: 2, rent: [3, 8], value: 4 },
  railroad: { label: "Railroad", hex: "#3a3a3a", size: 4, rent: [1, 2, 3, 4], value: 2 },
  utility: { label: "Utility", hex: "#a4b944", size: 2, rent: [1, 2], value: 2 }
}

const PROPERTY_NAMES = {
  brown: ["Mediterranean Avenue", "Baltic Avenue"],
  lightblue: ["Oriental Avenue", "Vermont Avenue", "Connecticut Avenue"],
  pink: ["St. Charles Place", "States Avenue", "Virginia Avenue"],
  orange: ["St. James Place", "Tennessee Avenue", "New York Avenue"],
  red: ["Kentucky Avenue", "Indiana Avenue", "Illinois Avenue"],
  yellow: ["Atlantic Avenue", "Ventnor Avenue", "Marvin Gardens"],
  green: ["Pacific Avenue", "North Carolina Avenue", "Pennsylvania Avenue"],
  darkblue: ["Park Place", "Boardwalk"],
  railroad: ["Reading Railroad", "Pennsylvania Railroad", "B. & O. Railroad", "Short Line"],
  utility: ["Electric Company", "Water Works"]
}

const ACTIONS = {
  dealbreaker: { name: "Deal Breaker", value: 5, count: 2, text: "Steal a complete set from any player" },
  justsayno: { name: "Just Say No!", value: 4, count: 3, text: "Cancel an action played against you" },
  passgo: { name: "Pass Go", value: 1, count: 10, text: "Draw 2 extra cards" },
  forceddeal: { name: "Forced Deal", value: 3, count: 3, text: "Swap a property with any player" },
  slydeal: { name: "Sly Deal", value: 3, count: 3, text: "Steal a property (not from a full set)" },
  debtcollector: { name: "Debt Collector", value: 3, count: 3, text: "One player pays you $5M" },
  birthday: { name: "It's My Birthday!", value: 2, count: 3, text: "Everyone pays you $2M" },
  house: { name: "House", value: 3, count: 3, text: "Add $3M rent to a full set" },
  hotel: { name: "Hotel", value: 4, count: 2, text: "Add $4M rent to a set with a house" },
  doublerent: { name: "Double the Rent", value: 1, count: 2, text: "Play with a rent card to double it" }
}

const MONEY = [
  { value: 1, count: 6 },
  { value: 2, count: 5 },
  { value: 3, count: 3 },
  { value: 4, count: 3 },
  { value: 5, count: 2 },
  { value: 10, count: 1 }
]

const DUAL_RENTS = [
  ["darkblue", "green"],
  ["red", "yellow"],
  ["pink", "orange"],
  ["lightblue", "brown"],
  ["railroad", "utility"]
]

const WILDS = [
  { colors: ["darkblue", "green"], value: 4, count: 1 },
  { colors: ["green", "railroad"], value: 4, count: 1 },
  { colors: ["utility", "railroad"], value: 2, count: 1 },
  { colors: ["lightblue", "brown"], value: 1, count: 1 },
  { colors: ["lightblue", "railroad"], value: 4, count: 1 },
  { colors: ["pink", "orange"], value: 2, count: 2 },
  { colors: ["red", "yellow"], value: 3, count: 2 },
  { colors: "any", value: 0, count: 2 }
]

function buildDeck() {
  const deck = []
  let uid = 0
  const add = (card) => deck.push({ uid: `c${uid++}`, ...card })

  for (const { value, count } of MONEY) {
    for (let i = 0; i < count; i++) add({ type: "money", value })
  }

  for (const [color, names] of Object.entries(PROPERTY_NAMES)) {
    for (const name of names) {
      add({ type: "property", color, name, value: COLORS[color].value })
    }
  }

  for (const { colors, value, count } of WILDS) {
    for (let i = 0; i < count; i++) add({ type: "wild", colors, value })
  }

  for (const [kind, { name, value, count, text }] of Object.entries(ACTIONS)) {
    for (let i = 0; i < count; i++) add({ type: "action", kind, name, value, text })
  }

  for (const colors of DUAL_RENTS) {
    for (let i = 0; i < 2; i++) add({ type: "rent", colors, value: 1 })
  }
  for (let i = 0; i < 3; i++) add({ type: "rent", colors: "any", value: 3 })

  return deck
}

module.exports = { COLORS, buildDeck }

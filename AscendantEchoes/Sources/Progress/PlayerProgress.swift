import Foundation

/// Abilities the Wanderer can permanently unlock with Essence. Each maps to a
/// concrete in-run power. Add cases here to extend the meta-progression tree.
enum Ability: String, CaseIterable, Codable, Identifiable {
    case reshape      // swap two non-adjacent orbs once per floor
    case echoBlast    // manually detonate a chosen orb
    case essenceFlow  // +20% essence from matches
    case steadfast    // start each floor with +3 moves

    var id: String { rawValue }

    var title: String {
        switch self {
        case .reshape:     return "Reshape"
        case .echoBlast:   return "Echo Blast"
        case .essenceFlow: return "Essence Flow"
        case .steadfast:   return "Steadfast"
        }
    }

    var detail: String {
        switch self {
        case .reshape:     return "Swap any two orbs once per floor."
        case .echoBlast:   return "Detonate a single orb of your choosing."
        case .essenceFlow: return "Gain 20% more Essence from every match."
        case .steadfast:   return "Begin each floor with 3 extra moves."
        }
    }

    var essenceCost: Int {
        switch self {
        case .reshape:     return 400
        case .echoBlast:   return 650
        case .essenceFlow: return 900
        case .steadfast:   return 1200
        }
    }

    var iconName: String {
        switch self {
        case .reshape:     return "arrow.triangle.2.circlepath"
        case .echoBlast:   return "burst.fill"
        case .essenceFlow: return "drop.fill"
        case .steadfast:   return "shield.lefthalf.filled"
        }
    }
}

/// Cosmetic auras the Wanderer evolves through as their level climbs — the
/// visible reward for long-term progression.
enum WandererForm: Int, CaseIterable, Codable, Comparable {
    case wanderer    // level 1+
    case adept       // level 5+
    case luminary    // level 12+
    case ascendant   // level 25+

    static func < (lhs: WandererForm, rhs: WandererForm) -> Bool {
        lhs.rawValue < rhs.rawValue
    }

    static func form(forLevel level: Int) -> WandererForm {
        switch level {
        case ..<5:   return .wanderer
        case ..<12:  return .adept
        case ..<25:  return .luminary
        default:     return .ascendant
        }
    }

    var title: String {
        switch self {
        case .wanderer:  return "Resonant Wanderer"
        case .adept:     return "Echo Adept"
        case .luminary:  return "Radiant Luminary"
        case .ascendant: return "The Ascendant"
        }
    }
}

/// The persistent player profile: level, essence, unlocks, cosmetics and the
/// high-water mark of the climb. Pure `Codable` model — persistence lives in
/// `SaveManager`. `ObservableObject` so SwiftUI menus react to changes.
final class PlayerProgress: ObservableObject, Codable {
    @Published var level: Int
    @Published var essence: Int
    @Published var totalEssenceEarned: Int
    @Published var highestFloor: Int
    @Published var currentFloor: Int
    @Published var unlockedAbilities: Set<Ability>
    @Published var accentColorHex: String
    @Published var loginStreak: Int
    @Published var lastLoginDay: Date?

    var form: WandererForm { WandererForm.form(forLevel: level) }

    /// Essence needed to reach the next level (gentle exponential curve).
    var essenceForNextLevel: Int { Int(120 * pow(1.18, Double(level - 1))) }

    init() {
        level = 1
        essence = 0
        totalEssenceEarned = 0
        highestFloor = 1
        currentFloor = 1
        unlockedAbilities = []
        accentColorHex = "#7DD3FC"
        loginStreak = 0
        lastLoginDay = nil
    }

    // MARK: - Mutations

    /// Awards essence, auto-levelling while enough has accumulated. Returns the
    /// number of levels gained so the UI can celebrate.
    @discardableResult
    func gainEssence(_ amount: Int) -> Int {
        let bonus = unlockedAbilities.contains(.essenceFlow) ? Int(Double(amount) * 0.2) : 0
        let total = amount + bonus
        essence += total
        totalEssenceEarned += total

        var levelsGained = 0
        while essence >= essenceForNextLevel {
            essence -= essenceForNextLevel
            level += 1
            levelsGained += 1
        }
        return levelsGained
    }

    func canUnlock(_ ability: Ability) -> Bool {
        !unlockedAbilities.contains(ability) && essence >= ability.essenceCost
    }

    @discardableResult
    func unlock(_ ability: Ability) -> Bool {
        guard canUnlock(ability) else { return false }
        essence -= ability.essenceCost
        unlockedAbilities.insert(ability)
        return true
    }

    func recordFloorCleared(_ floor: Int) {
        highestFloor = max(highestFloor, floor)
        currentFloor = floor + 1
    }

    /// Updates daily login streak. Returns the reward essence for today.
    @discardableResult
    func registerDailyLogin(now: Date = Date(), calendar: Calendar = .current) -> Int {
        let today = calendar.startOfDay(for: now)
        if let last = lastLoginDay {
            let lastDay = calendar.startOfDay(for: last)
            guard today != lastDay else { return 0 } // already logged in today
            let days = calendar.dateComponents([.day], from: lastDay, to: today).day ?? 0
            loginStreak = (days == 1) ? loginStreak + 1 : 1
        } else {
            loginStreak = 1
        }
        lastLoginDay = today
        return 50 * min(loginStreak, 7) // escalating up to a 7-day cap
    }

    // MARK: - Codable (manual, because of @Published)

    enum CodingKeys: String, CodingKey {
        case level, essence, totalEssenceEarned, highestFloor, currentFloor
        case unlockedAbilities, accentColorHex, loginStreak, lastLoginDay
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        level = try c.decode(Int.self, forKey: .level)
        essence = try c.decode(Int.self, forKey: .essence)
        totalEssenceEarned = try c.decode(Int.self, forKey: .totalEssenceEarned)
        highestFloor = try c.decode(Int.self, forKey: .highestFloor)
        currentFloor = try c.decode(Int.self, forKey: .currentFloor)
        unlockedAbilities = try c.decode(Set<Ability>.self, forKey: .unlockedAbilities)
        accentColorHex = try c.decode(String.self, forKey: .accentColorHex)
        loginStreak = try c.decode(Int.self, forKey: .loginStreak)
        lastLoginDay = try c.decodeIfPresent(Date.self, forKey: .lastLoginDay)
    }

    func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encode(level, forKey: .level)
        try c.encode(essence, forKey: .essence)
        try c.encode(totalEssenceEarned, forKey: .totalEssenceEarned)
        try c.encode(highestFloor, forKey: .highestFloor)
        try c.encode(currentFloor, forKey: .currentFloor)
        try c.encode(unlockedAbilities, forKey: .unlockedAbilities)
        try c.encode(accentColorHex, forKey: .accentColorHex)
        try c.encode(loginStreak, forKey: .loginStreak)
        try c.encodeIfPresent(lastLoginDay, forKey: .lastLoginDay)
    }
}

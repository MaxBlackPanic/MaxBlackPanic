import Foundation

/// Tracks the escalating reward state for a single player move. Each cascade
/// wave bumps the combo step, which exponentially grows the score multiplier
/// and — past a threshold — flips the board into "Ascension Fury" for extra
/// spectacle and points. Reset at the start of every swap.
final class ComboSystem {
    /// Cascade depth at which Ascension Fury ignites.
    static let furyThreshold = 4
    /// Score multiplier granted to a shaped / 5-match wave ("Echo Resonance").
    static let resonanceMultiplier = 10.0

    private(set) var comboStep = 0
    private(set) var furyActive = false

    /// Points per cleared tile before multipliers.
    private let basePerTile = 12

    func reset() {
        comboStep = 0
        furyActive = false
    }

    /// Registers a new cascade wave and returns the score & flavour for it.
    ///
    /// - Parameters:
    ///   - clearedCount: number of tiles removed this wave.
    ///   - detonationBonus: flat bonus from any specials that detonated.
    ///   - isResonance: true when the wave contained an L/T/+ or a 5-match.
    func register(clearedCount: Int,
                  detonationBonus: Int,
                  isResonance: Bool) -> (score: Int, multiplier: Double, comboStep: Int, fury: Bool) {
        comboStep += 1
        if comboStep >= Self.furyThreshold { furyActive = true }

        // Combo growth: 1.0, 1.5, 2.25, 3.4, ... (×1.5 per chain), softly capped.
        var multiplier = pow(1.5, Double(comboStep - 1))
        if furyActive { multiplier *= 1.5 }
        if isResonance { multiplier = max(multiplier, Self.resonanceMultiplier) }
        multiplier = min(multiplier, 64)

        let base = Double(clearedCount * basePerTile + detonationBonus)
        let score = Int((base * multiplier).rounded())
        return (score, multiplier, comboStep, furyActive)
    }

    /// Essence (progression currency) scales gently with clears so long sessions
    /// still feel rewarding without trivialising levelling.
    func essence(forClearedCount count: Int, specials: Int) -> Int {
        count + specials * 3
    }
}

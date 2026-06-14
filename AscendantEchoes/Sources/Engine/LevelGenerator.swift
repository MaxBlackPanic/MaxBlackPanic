import Foundation

/// Procedurally crafts floors of the Tower of Ascension. Difficulty, board
/// size, element variety, objectives and biome all scale with floor number so
/// the climb keeps escalating forever, while a deterministic seed (the floor
/// number) means a given floor is always reproducible.
enum LevelGenerator {

    /// Atmospheric, IP-free vision snippets shown between floors.
    private static let visions = [
        "A staircase of light unspools above you, humming with forgotten names.",
        "The echo of your own heartbeat answers from somewhere far higher.",
        "Dust of fallen stars settles on your shoulders like a blessing.",
        "Every orb you shatter remembers the shape of the one before it.",
        "The tower leans toward the dawn it has never been allowed to reach.",
        "You are not the first Wanderer. You may be the one who arrives.",
        "Silence here is a colour, and it is learning your true hue.",
        "Below, the world forgets you. Above, the tower begins to."
    ]

    static func makeFloor(_ number: Int) -> Floor {
        precondition(number >= 1, "Floors are 1-based")

        // Board grows from 7×7 toward a 9×9 cap as the player ascends.
        let dimension = min(9, 7 + (number - 1) / 8)

        // Element variety ramps from 4 → all 6 over the first several floors.
        let elementCount = min(ElementType.allCases.count, 4 + (number - 1) / 3)
        let pool = Array(ElementType.allCases.prefix(elementCount))

        // Move budget eases down slightly as floors get harder, with a floor.
        let moveBudget = max(18, 32 - number / 4)

        let biome = Biome.allCases[(number - 1) % Biome.allCases.count]
        let objective = makeObjective(number: number, pool: pool)
        let vision = visions[(number - 1) % visions.count]

        return Floor(id: number,
                     columns: dimension,
                     rows: dimension,
                     moveBudget: moveBudget,
                     objective: objective,
                     elementPool: pool,
                     biome: biome,
                     vision: vision)
    }

    private static func makeObjective(number: Int, pool: [ElementType]) -> FloorObjective {
        // Cycle objective archetypes so floors feel varied, scaling targets.
        switch number % 3 {
        case 1:
            let target = 1500 + number * 650
            return .reachScore(target: target)
        case 2:
            let element = pool[(number / 3) % pool.count]
            let count = 24 + number * 3
            return .collect(element: element, count: count)
        default:
            let moves = max(16, 24 - number / 6)
            let minScore = 1200 + number * 500
            return .survive(moves: moves, minScore: minScore)
        }
    }
}

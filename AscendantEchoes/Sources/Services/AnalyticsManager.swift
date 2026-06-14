import Foundation

/// A tiny, provider-agnostic analytics façade. Today it logs to the console;
/// wire `track(_:)` to Firebase / GameAnalytics / your warehouse by
/// implementing an `AnalyticsSink`. Event names follow a `noun_verb` convention.
protocol AnalyticsSink {
    func record(name: String, parameters: [String: Any])
}

/// Default sink: prints in debug, silent in release.
struct ConsoleSink: AnalyticsSink {
    func record(name: String, parameters: [String: Any]) {
        #if DEBUG
        print("📊 \(name) \(parameters)")
        #endif
    }
}

final class AnalyticsManager {
    static let shared = AnalyticsManager()
    private var sinks: [AnalyticsSink] = [ConsoleSink()]

    private init() {}

    func add(sink: AnalyticsSink) { sinks.append(sink) }

    enum Event {
        case floorStarted(floor: Int)
        case floorCleared(floor: Int, score: Int, moves: Int)
        case floorFailed(floor: Int, score: Int)
        case comboAchieved(step: Int, multiplier: Double)
        case abilityUnlocked(Ability)
        case purchaseTapped(productID: String)
        case energyDepleted

        var name: String {
            switch self {
            case .floorStarted:    return "floor_started"
            case .floorCleared:    return "floor_cleared"
            case .floorFailed:     return "floor_failed"
            case .comboAchieved:   return "combo_achieved"
            case .abilityUnlocked: return "ability_unlocked"
            case .purchaseTapped:  return "purchase_tapped"
            case .energyDepleted:  return "energy_depleted"
            }
        }

        var parameters: [String: Any] {
            switch self {
            case .floorStarted(let floor):
                return ["floor": floor]
            case .floorCleared(let floor, let score, let moves):
                return ["floor": floor, "score": score, "moves": moves]
            case .floorFailed(let floor, let score):
                return ["floor": floor, "score": score]
            case .comboAchieved(let step, let multiplier):
                return ["step": step, "multiplier": multiplier]
            case .abilityUnlocked(let ability):
                return ["ability": ability.rawValue]
            case .purchaseTapped(let productID):
                return ["product": productID]
            case .energyDepleted:
                return [:]
            }
        }
    }

    func track(_ event: Event) {
        for sink in sinks { sink.record(name: event.name, parameters: event.parameters) }
    }
}

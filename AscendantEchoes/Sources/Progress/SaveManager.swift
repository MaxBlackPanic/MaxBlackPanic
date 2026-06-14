import Foundation

/// Persists the player profile and energy state to `UserDefaults`, mirroring to
/// iCloud key-value store so progress follows the player across devices.
///
/// The local store is the source of truth during play; iCloud is written on
/// every save and read opportunistically (last-writer-wins on `totalEssence`,
/// which only ever grows). Swap in CloudKit later for conflict-aware sync.
final class SaveManager {
    static let shared = SaveManager()

    private let defaults = UserDefaults.standard
    private let cloud = NSUbiquitousKeyValueStore.default
    private let progressKey = "ae.player.progress.v1"
    private let energyKey = "ae.energy.state.v1"

    private let encoder = JSONEncoder()
    private let decoder = JSONDecoder()

    private init() {
        cloud.synchronize()
    }

    // MARK: - Player progress

    func loadProgress() -> PlayerProgress {
        if let data = bestData(for: progressKey),
           let progress = try? decoder.decode(PlayerProgress.self, from: data) {
            return progress
        }
        return PlayerProgress()
    }

    func saveProgress(_ progress: PlayerProgress) {
        guard let data = try? encoder.encode(progress) else { return }
        defaults.set(data, forKey: progressKey)
        cloud.set(data, forKey: progressKey)
        cloud.synchronize()
    }

    // MARK: - Energy

    func loadEnergy() -> EnergyState? {
        guard let data = bestData(for: energyKey) else { return nil }
        return try? decoder.decode(EnergyState.self, from: data)
    }

    func saveEnergy(_ state: EnergyState) {
        guard let data = try? encoder.encode(state) else { return }
        defaults.set(data, forKey: energyKey)
        cloud.set(data, forKey: energyKey)
        cloud.synchronize()
    }

    // MARK: - Helpers

    /// Returns whichever store has data, preferring local for liveliness.
    private func bestData(for key: String) -> Data? {
        defaults.data(forKey: key) ?? cloud.data(forKey: key)
    }
}

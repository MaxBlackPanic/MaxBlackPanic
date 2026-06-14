import Foundation

/// Codable snapshot of the energy economy, persisted by `SaveManager`.
struct EnergyState: Codable {
    var current: Int
    var lastRefillDate: Date
}

/// A free-to-play energy gate. Each floor attempt costs one energy; energy
/// regenerates one unit every `refillInterval` and can be topped up via a
/// (placeholder) IAP. Time-based refills are computed lazily on read, so it
/// stays correct across app launches without a background timer.
final class EnergySystem: ObservableObject {
    static let maxEnergy = 5
    static let refillInterval: TimeInterval = 20 * 60 // 20 minutes per unit
    static let costPerFloor = 1

    @Published private(set) var current: Int
    private var lastRefillDate: Date

    init(state: EnergyState? = nil) {
        let loaded = state ?? SaveManager.shared.loadEnergy()
        self.current = loaded?.current ?? Self.maxEnergy
        self.lastRefillDate = loaded?.lastRefillDate ?? Date()
        applyPassiveRefill()
    }

    /// Recomputes accrued energy based on elapsed time since the last refill.
    func applyPassiveRefill(now: Date = Date()) {
        guard current < Self.maxEnergy else {
            lastRefillDate = now
            persist()
            return
        }
        let elapsed = now.timeIntervalSince(lastRefillDate)
        guard elapsed > 0 else { return }
        let gained = Int(elapsed / Self.refillInterval)
        if gained > 0 {
            current = min(Self.maxEnergy, current + gained)
            lastRefillDate = lastRefillDate.addingTimeInterval(Double(gained) * Self.refillInterval)
            if current >= Self.maxEnergy { lastRefillDate = now }
            persist()
        }
    }

    var canStartFloor: Bool {
        applyPassiveRefill()
        return current >= Self.costPerFloor
    }

    /// Spends energy to begin a floor. Returns false if insufficient.
    @discardableResult
    func consumeForFloor() -> Bool {
        applyPassiveRefill()
        guard current >= Self.costPerFloor else { return false }
        current -= Self.costPerFloor
        persist()
        return true
    }

    /// Placeholder for an IAP / rewarded-ad full refill.
    func refillToFull() {
        current = Self.maxEnergy
        lastRefillDate = Date()
        persist()
    }

    /// Seconds until the next energy unit, or nil if already full.
    func secondsUntilNextRefill(now: Date = Date()) -> TimeInterval? {
        guard current < Self.maxEnergy else { return nil }
        let next = lastRefillDate.addingTimeInterval(Self.refillInterval)
        return max(0, next.timeIntervalSince(now))
    }

    private func persist() {
        SaveManager.shared.saveEnergy(EnergyState(current: current, lastRefillDate: lastRefillDate))
    }
}

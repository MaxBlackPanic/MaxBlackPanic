import Foundation

/// A concrete type-erased wrapper so the engine can store an injected
/// `RandomNumberGenerator` (an existential) and still pass it as the `inout`
/// generic argument required by `shuffled(using:)` / `randomElement(using:)`.
struct AnyRandomNumberGenerator: RandomNumberGenerator {
    private var base: RandomNumberGenerator
    init(_ base: RandomNumberGenerator) { self.base = base }
    mutating func next() -> UInt64 { base.next() }
}

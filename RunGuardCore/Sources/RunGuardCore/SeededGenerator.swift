//
//  SeededGenerator.swift
//  RunGuardCore
//
//  A small, fast, reproducible random number generator (SplitMix64) so the
//  bootstrap intervals are the same every time the app computes them from
//  the same data. Swift's SystemRandomNumberGenerator cannot be seeded.
//
//  This is not the same generator numpy uses (PCG64), so bootstrap
//  intervals here and in the Python package agree to about two decimal
//  places, not nine. The point estimates they bracket match exactly.
//
//  Added for RunGuard 2.0 (CAC 2026), AI-assisted, see DISCLOSURE.md
//

public struct SplitMix64: RandomNumberGenerator, Sendable {
    private var state: UInt64

    public init(seed: UInt64) {
        state = seed
    }

    public mutating func next() -> UInt64 {
        state &+= 0x9E37_79B9_7F4A_7C15
        var z = state
        z = (z ^ (z >> 30)) &* 0xBF58_476D_1CE4_E5B9
        z = (z ^ (z >> 27)) &* 0x94D0_49BB_1331_11EB
        return z ^ (z >> 31)
    }
}

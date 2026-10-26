// swift-tools-version: 5.9
//
// RunGuardCore — the statistics behind RunGuard, as a dependency-free Swift
// library so they can be unit-tested on a Mac with `swift test` and checked
// against the Python reference (the `acwr` package) to nine decimal places.
//
// Added for RunGuard 2.0 (CAC 2026), AI-assisted, see DISCLOSURE.md
import PackageDescription

let package = Package(
    name: "RunGuardCore",
    platforms: [.iOS(.v17), .macOS(.v14)],
    products: [
        .library(name: "RunGuardCore", targets: ["RunGuardCore"]),
    ],
    targets: [
        .target(name: "RunGuardCore"),
        .testTarget(
            name: "RunGuardCoreTests",
            dependencies: ["RunGuardCore"],
            resources: [.copy("Fixtures")]
        ),
    ]
)

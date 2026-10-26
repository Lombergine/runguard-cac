//
//  RunGuardApp.swift
//  RunGuard
//
//  Created by jyoti agarwal on 7/12/26.
//

import SwiftData
import SwiftUI

@main
struct RunGuardApp: App {
    var body: some Scene {
        WindowGroup {
            ContentView()
        }
        // Creates (or opens) the on-device store for check-ins and injects
        // its ModelContext into the environment for @Query / inserts.
        .modelContainer(for: RunCheckIn.self)
    }
}

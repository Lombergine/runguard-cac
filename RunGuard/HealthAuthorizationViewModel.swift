//
//  HealthAuthorizationViewModel.swift
//  RunGuard
//

import Foundation
// Needed even though we never name HealthKit types here: the project enables
// MemberImportVisibility, so HKAuthorizationRequestStatus's cases (returned
// by the service) are only visible with the defining module imported.
import HealthKit
import Observation

@MainActor
@Observable
final class HealthAuthorizationViewModel {
    /// Note the vocabulary: there is no `denied` case. HealthKit never tells
    /// an app that read access was refused — the strongest statement we can
    /// make is `requested` (the sheet has been shown).
    enum AuthorizationState: Equatable {
        /// Haven't finished checking yet (initial launch).
        case checking
        /// Device has no Health data store (e.g. some iPads, visionOS).
        case unavailable
        /// The permission sheet has never been shown — we should ask.
        case needsRequest
        /// The permission sheet is currently up.
        case requesting
        /// The sheet has been shown and dismissed. Access may be granted or
        /// denied; we find out only by whether queries return data.
        case requested
        /// A mechanical failure (not a user denial).
        case failed(String)
    }

    private(set) var state: AuthorizationState = .checking

    private let service: HealthKitService

    init(service: HealthKitService? = nil) {
        // Constructed inside the init (not as a default argument) because
        // default arguments evaluate outside this class's MainActor
        // isolation, which Swift 6 flags.
        self.service = service ?? HealthKitService()
    }

    /// Called when the view appears: decide whether to show the
    /// "Connect Health" call-to-action or go straight to content.
    func refreshStatus() async {
        guard service.isAvailable else {
            state = .unavailable
            return
        }
        do {
            switch try await service.authorizationRequestStatus() {
            case .shouldRequest:
                state = .needsRequest
            case .unnecessary:
                state = .requested
            case .unknown:
                // HealthKit couldn't determine status; offer the request
                // anyway — re-requesting is harmless (the sheet only appears
                // if it's actually needed).
                state = .needsRequest
            @unknown default:
                state = .needsRequest
            }
        } catch {
            state = .failed(error.localizedDescription)
        }
    }

    func requestAccess() async {
        state = .requesting
        do {
            try await service.requestAuthorization()
            state = .requested
        } catch {
            state = .failed(error.localizedDescription)
        }
    }
}

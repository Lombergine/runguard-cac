//
//  WorkoutListViewModel.swift
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
final class WorkoutListViewModel {
    /// The one screen's full lifecycle. Note the vocabulary: there is no
    /// `denied` case. HealthKit never tells an app that read access was
    /// refused — a denial just means queries come back empty, which lands
    /// in `.loaded([])`.
    enum ScreenState: Equatable {
        /// Haven't finished checking authorization yet (initial launch).
        case checking
        /// Device has no Health data store (e.g. some iPads, visionOS).
        case unavailable
        /// The permission sheet has never been shown — we should ask.
        case needsRequest
        /// The permission sheet is currently up.
        case requesting
        /// Fetching runs from HealthKit.
        case loading
        /// Fetch finished. An empty runs array means no runs *or* denied
        /// access — indistinguishable by design, so the view treats them as
        /// one. The risk status rides along, computed from the same fetch.
        case loaded(runs: [RunningWorkout], risk: ACWRStatus)
        /// A mechanical failure (not a user denial).
        case failed(String)
    }

    private(set) var state: ScreenState = .checking

    private let service: HealthKitService

    init(service: HealthKitService? = nil) {
        // Constructed inside the init (not as a default argument) because
        // default arguments evaluate outside this class's MainActor
        // isolation, which Swift 6 flags.
        self.service = service ?? HealthKitService()
    }

    /// Called when the view appears: show the "Connect Health" call-to-action
    /// if the sheet was never presented, otherwise go straight to fetching.
    func refreshStatus() async {
        guard service.isAvailable else {
            state = .unavailable
            return
        }
        do {
            switch try await service.authorizationRequestStatus() {
            case .shouldRequest, .unknown:
                // .unknown: HealthKit couldn't determine status; offer the
                // request anyway — re-requesting is harmless (the sheet only
                // appears if it's actually needed).
                state = .needsRequest
            case .unnecessary:
                await loadRuns()
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
            // The sheet resolved (allow or deny — we can't tell which), so
            // the only way forward is to query and see what comes back.
            await loadRuns()
        } catch {
            state = .failed(error.localizedDescription)
        }
    }

    func loadRuns() async {
        state = .loading
        do {
            let runs = try await service.fetchRunningWorkouts()
            // ACWR math is pure and cheap (one pass over ~90 days), so it
            // reuses this fetch instead of hitting HealthKit again.
            let risk = ACWRService.compute(runs: runs).status
            state = .loaded(runs: runs, risk: risk)
        } catch {
            state = .failed(error.localizedDescription)
        }
    }
}

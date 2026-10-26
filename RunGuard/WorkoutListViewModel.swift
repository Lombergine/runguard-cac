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
import RunGuardCore

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

    // MARK: - RunGuard 2.0 (CAC 2026), AI-assisted, see DISCLOSURE.md

    /// Quality pre-flight, personal threshold and self-audit over the same
    /// daily series the risk card is built from. Nil until runs are loaded.
    private(set) var insights: LoadInsights?
    /// The cut points the risk card is coloured with right now, and why.
    private(set) var effectiveThresholds: ACWRThresholds = .standard
    private(set) var zoneSource: ZoneSource = .coachSettings
    /// Running dynamics read from Health for the last five weeks. Nil while
    /// the query is in flight.
    private(set) var healthGait: GaitAnalysis?
    /// Show the clearly labelled sample gait dataset instead of Health data,
    /// for devices whose watch does not write running dynamics.
    var showGaitSample = false
    /// What the gait card renders: Health data, or the sample when asked
    /// for. `isSample` drives the on-screen label, so the two can never be
    /// confused.
    var gaitForDisplay: (analysis: GaitAnalysis, isSample: Bool)? {
        if showGaitSample {
            return (Gait.analyze(runs: SampleGaitData.sixWeeksWithDrift()), true)
        }
        return healthGait.map { ($0, false) }
    }
    /// Bumped on every load so a background result from an earlier fetch
    /// cannot overwrite a newer one.
    private var loadGeneration = 0

    private let service: HealthKitService
    private let settings: RunGuardSettings
    init(service: HealthKitService? = nil, settings: RunGuardSettings? = nil) {
        // Constructed inside the init (not as a default argument) because
        // default arguments evaluate outside this class's MainActor
        // isolation, which Swift 6 flags.
        self.service = service ?? HealthKitService()
        self.settings = settings ?? RunGuardSettings.shared
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
        loadGeneration += 1
        let generation = loadGeneration
        do {
            let runs = try await service.fetchRunningWorkouts()
            // ACWR math is pure and cheap (one pass over ~a year), so it
            // reuses this fetch instead of hitting HealthKit again.
            let assessment = ACWRService.compute(runs: runs, thresholds: settings.thresholds)

            // RunGuard 2.0: the quality pre-flight, the personal threshold
            // and the audit's point estimate are instant, so they land with
            // the list. The bootstrap interval and the gait query follow in
            // the background and never block the screen.
            insights = InsightsService.compute(series: assessment.series, bootstrapDraws: 0)
            applyZones()
            let risk = ACWRService.compute(runs: runs, thresholds: effectiveThresholds).status
            state = .loaded(runs: runs, risk: risk)

            let series = assessment.series
            Task.detached(priority: .userInitiated) { [weak self] in
                let full = InsightsService.compute(
                    series: series, bootstrapDraws: InsightsService.onDeviceBootstrapDraws
                )
                await self?.receiveInsights(full, generation: generation)
            }
            await loadGait(for: runs, generation: generation)
        } catch {
            state = .failed(error.localizedDescription)
        }
    }

    private func receiveInsights(_ full: LoadInsights?, generation: Int) {
        guard generation == loadGeneration else { return }
        insights = full
    }

    /// Running dynamics for the runs the gait model can use (recent week
    /// plus four baseline weeks). One HealthKit query pair per run.
    private func loadGait(for runs: [RunningWorkout], generation: Int) async {
        healthGait = nil
        let cutoff = Calendar.current.date(
            byAdding: .day, value: -HealthKitService.gaitWindowDays, to: .now
        ) ?? .distantPast
        let gaitRuns = await service.fetchGaitRuns(for: runs.filter { $0.date >= cutoff })
        guard generation == loadGeneration else { return }
        healthGait = Gait.analyze(runs: gaitRuns)
    }

    /// Which cut points colour the risk card: the athlete's own percentiles
    /// once there is enough history and the setting is on, otherwise
    /// whatever the coach set.
    private func applyZones() {
        if settings.usePersonalZones,
           let personal = insights?.personalZones(basedOn: settings.thresholds) {
            effectiveThresholds = personal
            zoneSource = .personalHistory
        } else {
            effectiveThresholds = settings.thresholds
            zoneSource = .coachSettings
        }
    }

    /// Rescore the runs already in hand against the current thresholds.
    /// Called when a coach changes a cut point; does nothing unless runs are
    /// already loaded, so it can be attached to onChange without guarding.
    func rescoreForCurrentThresholds() {
        guard case .loaded(let runs, _) = state, !runs.isEmpty else { return }
        applyZones()
        let risk = ACWRService.compute(runs: runs, thresholds: effectiveThresholds).status
        state = .loaded(runs: runs, risk: risk)
    }
}

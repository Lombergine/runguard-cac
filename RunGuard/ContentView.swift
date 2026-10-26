//
//  ContentView.swift
//  RunGuard
//
//  Created by jyoti agarwal on 7/12/26.
//

import SwiftData
import SwiftUI

struct ContentView: View {
    @State private var viewModel = WorkoutListViewModel()
    /// Live view of all logged check-ins. @Query is SwiftData's idiomatic
    /// view wiring: it re-renders this view whenever the store changes, so
    /// saving in the sheet updates row indicators with no manual plumbing.
    @Query private var checkIns: [RunCheckIn]
    /// The run whose log sheet is open; nil = no sheet. Using sheet(item:)
    /// ties the sheet's lifetime to a specific run.
    @State private var runToLog: RunningWorkout?
    /// Coach-adjustable rules. Shared instance so the settings screen and the
    /// scoring here can never drift apart.
    @State private var settings = RunGuardSettings.shared

    var body: some View {
        NavigationStack {
            Group {
                switch viewModel.state {
                case .checking:
                    ProgressView("Checking Health access…")

                case .unavailable:
                    statusView(
                        systemImage: "heart.slash",
                        title: "Health Not Available",
                        message: "This device has no Apple Health data. RunGuard needs an iPhone with the Health app."
                    )

                case .needsRequest:
                    VStack(spacing: 16) {
                        statusView(
                            systemImage: "heart.text.square",
                            title: "Connect Apple Health",
                            message: "RunGuard reads your running workouts to calculate training load and injury risk. Your data never leaves this device."
                        )
                        Button("Allow Health Access") {
                            Task { await viewModel.requestAccess() }
                        }
                        .buttonStyle(.borderedProminent)
                    }
                    .padding()

                case .requesting:
                    ProgressView("Waiting for Health permission…")

                case .loading:
                    ProgressView("Loading runs…")

                case .loaded(let runs, let risk):
                    if runs.isEmpty {
                        emptyState
                    } else {
                        runList(runs, risk: risk)
                    }

                case .failed(let message):
                    VStack(spacing: 16) {
                        statusView(
                            systemImage: "exclamationmark.triangle",
                            title: "Something Went Wrong",
                            message: message
                        )
                        Button("Try Again") {
                            Task { await viewModel.refreshStatus() }
                        }
                        .buttonStyle(.bordered)
                    }
                    .padding()
                }
            }
            .navigationTitle("Runs")
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    NavigationLink {
                        SettingsView(settings: settings)
                    } label: {
                        Label("Settings", systemImage: "slider.horizontal.3")
                    }
                }
                // Temporary: entry to the ACWR validation screen.
                // Remove together with ACWRDebugView.swift.
                ToolbarItem(placement: .topBarTrailing) {
                    NavigationLink {
                        ACWRDebugView()
                    } label: {
                        Label("ACWR Validation", systemImage: "waveform.path.ecg")
                    }
                }
            }
        }
        .task {
            // Runs when the view first appears; decides which state to show.
            await viewModel.refreshStatus()
        }
        .sheet(item: $runToLog) { run in
            RunCheckInView(run: run, existing: checkIn(for: run))
        }
        // Moving a cut point rescores the runs already in hand. No HealthKit
        // round trip: the runs did not change, only where the lines are.
        .onChange(of: settings.thresholds) {
            viewModel.rescoreForCurrentThresholds()
        }
    }

    /// The workout-UUID foreign key in action: match a HealthKit run to its
    /// stored check-in.
    private func checkIn(for run: RunningWorkout) -> RunCheckIn? {
        checkIns.first { $0.workoutID == run.id }
    }

    /// Recomputed on each render from the live @Query. Cheap: one pass over
    /// at most a few months of check-ins, and it means logging a run updates
    /// the card immediately with no manual invalidation.
    private var sorenessReport: SorenessReport {
        SorenessService.report(checkIns: checkIns, settings: settings.soreness)
    }

    private func runList(_ runs: [RunningWorkout], risk: ACWRStatus) -> some View {
        List {
            // The card is a list row (not a header above the List) so it
            // scrolls away with the content instead of eating screen space.
            // Clearing the row chrome lets the card draw its own background.
            Section {
                RiskCard(status: risk)
                    .listRowInsets(EdgeInsets())
                    .listRowBackground(Color.clear)
                    .listRowSeparator(.hidden)
                // Conditioned here, not inside the card: an always-present
                // row whose body is empty still costs a blank list row.
                let soreness = sorenessReport
                if soreness.hasFlags {
                    SorenessCard(report: soreness)
                        .listRowInsets(EdgeInsets())
                        .listRowBackground(Color.clear)
                        .listRowSeparator(.hidden)
                }
            }
            Section {
                ForEach(runs) { run in
                    // The whole row is the "one tap" that opens the log
                    // sheet; .plain keeps the text from tinting blue.
                    Button {
                        runToLog = run
                    } label: {
                        RunRow(run: run, isLogged: checkIn(for: run) != nil)
                    }
                    .buttonStyle(.plain)
                }
            }
        }
        .refreshable {
            await viewModel.loadRuns()
        }
    }

    /// Shown for zero results. Because HealthKit hides read denial, this
    /// state covers both "no runs" and "access denied" — so the copy has to
    /// help with both.
    private var emptyState: some View {
        ContentUnavailableView {
            Label("No Runs Found", systemImage: "figure.run")
        } description: {
            Text("No running workouts in the last \(HealthKitService.fetchWindowDays) days.\n\nIf you have been running, check that RunGuard is allowed to read workouts in Settings → Health → Data Access & Devices, and confirm your watch or running app syncs to Apple Health.")
        } actions: {
            Button("Refresh") {
                Task { await viewModel.loadRuns() }
            }
            .buttonStyle(.bordered)
        }
    }

    private func statusView(systemImage: String, title: String, message: String) -> some View {
        VStack(spacing: 12) {
            Image(systemName: systemImage)
                .font(.system(size: 44))
                .foregroundStyle(.tint)
            Text(title)
                .font(.title2.bold())
            Text(message)
                .font(.body)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
        }
    }
}

/// One run in the list: date on top, metrics underneath, log indicator at
/// the trailing edge.
struct RunRow: View {
    let run: RunningWorkout
    let isLogged: Bool

    var body: some View {
        HStack {
            VStack(alignment: .leading, spacing: 4) {
                Text(run.date, format: .dateTime.weekday(.wide).month(.abbreviated).day())
                    .font(.headline)
                HStack(spacing: 16) {
                    Label(distanceText, systemImage: "ruler")
                    Label(durationText, systemImage: "stopwatch")
                    Label(heartRateText, systemImage: "heart")
                }
                .font(.subheadline)
                .foregroundStyle(.secondary)
                .labelStyle(.titleAndIcon)
            }
            Spacer()
            // Subtle logged/unlogged cue: green check once logged, faint
            // plus inviting a tap before.
            Image(systemName: isLogged ? "checkmark.circle.fill" : "plus.circle")
                .font(.body)
                .foregroundStyle(isLogged ? AnyShapeStyle(.green) : AnyShapeStyle(.tertiary))
                .accessibilityLabel(isLogged ? "Logged" : "Not logged")
        }
        .padding(.vertical, 2)
    }

    private var distanceText: String {
        guard let miles = run.distanceMiles else { return "—" }
        return String(format: "%.2f mi", miles)
    }

    private var durationText: String {
        Duration.seconds(run.duration)
            .formatted(.units(allowed: [.hours, .minutes, .seconds], width: .narrow))
    }

    private var heartRateText: String {
        guard let bpm = run.averageHeartRate else { return "—" }
        return "\(bpm) bpm"
    }
}

#Preview {
    ContentView()
        .modelContainer(for: RunCheckIn.self, inMemory: true)
}

//
//  ContentView.swift
//  RunGuard
//
//  Created by jyoti agarwal on 7/12/26.
//

import SwiftUI

struct ContentView: View {
    @State private var viewModel = WorkoutListViewModel()

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
            }
            Section {
                ForEach(runs) { run in
                    RunRow(run: run)
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

/// One run in the list: date on top, metrics underneath.
struct RunRow: View {
    let run: RunningWorkout

    var body: some View {
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
}

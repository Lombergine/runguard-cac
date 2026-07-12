//
//  ACWRDebugView.swift
//  RunGuard
//
//  TEMPORARY validation screen — not part of the product UI.
//  Lists every day of the ACWR series so the math can be eyeballed against
//  real training history. Delete this file (and its toolbar entry in
//  ContentView) once ACWR is trusted and surfaced properly.
//

import SwiftUI

struct ACWRDebugView: View {
    private enum LoadState: Equatable {
        case loading
        case loaded([ACWRPoint])
        case failed(String)
    }

    @State private var state: LoadState = .loading

    var body: some View {
        Group {
            switch state {
            case .loading:
                ProgressView("Computing ACWR…")

            case .failed(let message):
                ContentUnavailableView {
                    Label("Couldn't Compute", systemImage: "exclamationmark.triangle")
                } description: {
                    Text(message)
                } actions: {
                    Button("Retry") {
                        Task { await load() }
                    }
                }

            case .loaded(let series):
                if series.isEmpty {
                    ContentUnavailableView(
                        "No History",
                        systemImage: "chart.xyaxis.line",
                        description: Text("No runs found, so there is no series to validate.")
                    )
                } else {
                    List {
                        Section {
                            // Newest first, matching the run list.
                            ForEach(series.reversed()) { point in
                                ACWRDebugRow(point: point)
                            }
                        } header: {
                            Text("\(series.count) days · newest first · load in miles")
                        }
                    }
                }
            }
        }
        .navigationTitle("ACWR Validation")
        .navigationBarTitleDisplayMode(.inline)
        .task { await load() }
    }

    private func load() async {
        state = .loading
        do {
            state = .loaded(try await ACWRService().assessment().series)
        } catch {
            state = .failed(error.localizedDescription)
        }
    }
}

private struct ACWRDebugRow: View {
    let point: ACWRPoint

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack {
                Text(point.date, format: .dateTime.weekday(.abbreviated).month(.abbreviated).day().year())
                    .font(.subheadline.weight(.semibold))
                if point.lowConfidence {
                    Image(systemName: "exclamationmark.triangle.fill")
                        .font(.caption2)
                        .foregroundStyle(.yellow)
                        .help("Low confidence: under 21 days of history")
                }
                Spacer()
                zoneBadge
            }
            HStack(spacing: 14) {
                metric("day", point.dailyLoad)
                metric("acute", point.acuteLoad)
                metric("chronic", point.chronicLoad)
                metric("ratio", point.ratio, format: "%.2f")
            }
            .font(.caption.monospacedDigit())
            .foregroundStyle(.secondary)
        }
        .padding(.vertical, 2)
    }

    private var zoneBadge: some View {
        Text(point.zone?.debugLabel ?? "no data")
            .font(.caption2.weight(.bold))
            .padding(.horizontal, 6)
            .padding(.vertical, 2)
            .background((point.zone?.debugColor ?? .gray).opacity(0.18), in: Capsule())
            .foregroundStyle(point.zone?.debugColor ?? .gray)
    }

    private func metric(_ label: String, _ value: Double?, format: String = "%.1f") -> some View {
        HStack(spacing: 3) {
            Text(label)
            Text(value.map { String(format: format, $0) } ?? "—")
                .foregroundStyle(.primary)
        }
    }
}

// Presentation-only helpers, kept here so deleting this file removes them.
private extension TrainingZone {
    var debugLabel: String {
        switch self {
        case .undertraining: "under"
        case .optimal: "optimal"
        case .caution: "caution"
        case .highRisk: "high risk"
        }
    }

    var debugColor: Color {
        switch self {
        case .undertraining: .blue
        case .optimal: .green
        case .caution: .orange
        case .highRisk: .red
        }
    }
}

#Preview {
    NavigationStack {
        ACWRDebugView()
    }
}

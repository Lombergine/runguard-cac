//
//  RunCheckInView.swift
//  RunGuard
//

import SwiftData
import SwiftUI

/// Quick post-run log: RPE + optional pain. Designed to be dismissable in
/// seconds — sensible defaults, medium-height sheet, one Save tap.
struct RunCheckInView: View {
    let run: RunningWorkout
    /// Existing check-in for this run, if any — the sheet then edits
    /// instead of creating a duplicate.
    let existing: RunCheckIn?

    @Environment(\.modelContext) private var modelContext
    @Environment(\.dismiss) private var dismiss

    @State private var rpe: Double
    @State private var hasPain: Bool
    /// A set, not a single case: an athlete with shin and knee pain used to
    /// have to pick one, and the area they dropped never accumulated toward
    /// a recurring complaint.
    @State private var painAreas: Set<BodyArea>
    @State private var painSeverity: Double

    init(run: RunningWorkout, existing: RunCheckIn?) {
        self.run = run
        self.existing = existing
        // Prefill from the existing entry when editing; otherwise defaults
        // chosen so "average run, no pain" needs zero adjustments.
        _rpe = State(initialValue: Double(existing?.rpe ?? 5))
        _hasPain = State(initialValue: existing?.hasPain ?? false)
        _painAreas = State(initialValue: Set(existing?.painAreas ?? []))
        _painSeverity = State(initialValue: Double(existing?.painSeverity ?? 5))
    }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    LabeledContent("Run") {
                        Text("\(run.date.formatted(.dateTime.weekday().month().day()))\(distanceSuffix)")
                    }
                }

                Section("How hard did this feel?") {
                    ratingSlider(value: $rpe, label: "RPE")
                }

                Section("Any pain?") {
                    Picker("Any pain?", selection: $hasPain) {
                        Text("No Pain").tag(false)
                        Text("Pain").tag(true)
                    }
                    .pickerStyle(.segmented)
                    .labelsHidden()

                    if hasPain {
                        // Tap rows rather than a Picker so more than one area
                        // can be reported in a single log.
                        ForEach(BodyArea.allCases) { area in
                            Button {
                                toggle(area)
                            } label: {
                                HStack {
                                    Text(area.label)
                                        .foregroundStyle(.primary)
                                    Spacer()
                                    if painAreas.contains(area) {
                                        Image(systemName: "checkmark")
                                            .foregroundStyle(.tint)
                                    }
                                }
                                .contentShape(Rectangle())
                            }
                            .buttonStyle(.plain)
                            .accessibilityAddTraits(painAreas.contains(area) ? .isSelected : [])
                        }
                        ratingSlider(value: $painSeverity, label: "Worst severity")
                    }
                }
            }
            .navigationTitle(existing == nil ? "Log Run" : "Edit Log")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Save") { save() }
                        // "Pain" with nothing selected would store a
                        // severity attached to no area, which SorenessService
                        // would have to treat as a phantom report.
                        .disabled(hasPain && painAreas.isEmpty)
                }
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
            }
        }
        // Half-height sheet: keeps the run list visible behind it and makes
        // the interaction feel like a quick note, not a new screen.
        .presentationDetents([.medium, .large])
    }

    private var distanceSuffix: String {
        run.distanceMiles.map { String(format: " · %.2f mi", $0) } ?? ""
    }

    private func toggle(_ area: BodyArea) {
        if painAreas.contains(area) {
            painAreas.remove(area)
        } else {
            painAreas.insert(area)
        }
    }

    private func ratingSlider(value: Binding<Double>, label: String) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack {
                Text(label)
                Spacer()
                Text("\(Int(value.wrappedValue))/10")
                    .monospacedDigit()
                    .foregroundStyle(.secondary)
            }
            Slider(value: value, in: 1...10, step: 1)
        }
    }

    private func save() {
        let areas = hasPain ? BodyArea.allCases.filter(painAreas.contains) : []
        if let existing {
            existing.rpe = Int(rpe)
            existing.painAreas = areas
            existing.painSeverity = areas.isEmpty ? nil : Int(painSeverity)
            existing.loggedAt = .now
        } else {
            modelContext.insert(RunCheckIn(
                workoutID: run.id,
                workoutDate: run.date,
                workoutDistanceMiles: run.distanceMiles,
                rpe: Int(rpe),
                painAreas: areas,
                painSeverity: areas.isEmpty ? nil : Int(painSeverity)
            ))
        }
        // No explicit save call: the main context autosaves, and the row
        // indicator updates through @Query observation in ContentView.
        dismiss()
    }
}

#Preview {
    RunCheckInView(
        run: RunningWorkout(
            id: UUID(), date: .now, distanceMiles: 5.2,
            duration: 47 * 60, averageHeartRate: 152
        ),
        existing: nil
    )
    .modelContainer(for: RunCheckIn.self, inMemory: true)
}

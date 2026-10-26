//
//  SettingsView.swift
//  RunGuard
//

import SwiftUI

/// Everything a coach can dial in. Both rule sets live here, each with its
/// defaults visible and a one-tap reset, so a program that changes nothing
/// still knows what it is running.
///
/// The sliders bound each other rather than clamping after the fact: each
/// zone's range is capped by its neighbours, so the ordering can never be
/// broken and the control never fights the finger.
struct SettingsView: View {
    @Bindable var settings: RunGuardSettings
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        Form {
            Section {
                thresholdRow(
                    title: "Undertraining below",
                    value: $settings.thresholds.undertrainingBelow,
                    range: ACWRThresholds.allowedRange.lowerBound
                        ... max(ACWRThresholds.allowedRange.lowerBound,
                                settings.thresholds.optimalBelow - ACWRThresholds.minimumSeparation)
                )
                thresholdRow(
                    title: "Optimal below",
                    value: $settings.thresholds.optimalBelow,
                    range: min(settings.thresholds.undertrainingBelow + ACWRThresholds.minimumSeparation,
                               settings.thresholds.cautionThrough - ACWRThresholds.minimumSeparation)
                        ... max(settings.thresholds.undertrainingBelow + ACWRThresholds.minimumSeparation,
                                settings.thresholds.cautionThrough - ACWRThresholds.minimumSeparation)
                )
                thresholdRow(
                    title: "Caution through",
                    value: $settings.thresholds.cautionThrough,
                    range: min(settings.thresholds.optimalBelow + ACWRThresholds.minimumSeparation,
                               ACWRThresholds.allowedRange.upperBound)
                        ... ACWRThresholds.allowedRange.upperBound
                )
            } header: {
                Text("Training Load Zones")
            } footer: {
                Text("Where the acute:chronic ratio changes zone. Defaults are \(formatted(ACWRThresholds.standard.undertrainingBelow)) / \(formatted(ACWRThresholds.standard.optimalBelow)) / \(formatted(ACWRThresholds.standard.cautionThrough)), the published values. Lower the caution cut point to be warned earlier.")
            }

            if settings.usesCustomThresholds {
                Section {
                    Button("Reset Zones to Defaults", role: .destructive) {
                        settings.resetThresholds()
                    }
                }
            }

            Section {
                Stepper(
                    "Look back \(settings.soreness.windowDays) days",
                    value: $settings.soreness.windowDays,
                    in: SorenessSettings.windowRange
                )
                Stepper(
                    "Flag after \(settings.soreness.minimumReports) reports",
                    value: $settings.soreness.minimumReports,
                    in: SorenessSettings.reportsRange
                )
                Stepper(
                    "Ignore severity below \(settings.soreness.severityFloor)",
                    value: $settings.soreness.severityFloor,
                    in: 1...9
                )
                Stepper(
                    "Flag any two reports at \(settings.soreness.escalationSeverity)+",
                    value: $settings.soreness.escalationSeverity,
                    in: max(settings.soreness.severityFloor, 2)...10
                )
            } header: {
                Text("Recurring Soreness")
            } footer: {
                Text("The same body area reported this many times inside the window becomes a flag. Raise the floor if your athletes log every twinge; lower the report count if you want to hear about things sooner.")
            }

            if settings.usesCustomSoreness {
                Section {
                    Button("Reset Soreness Rules to Defaults", role: .destructive) {
                        settings.resetSoreness()
                    }
                }
            }
        }
        .navigationTitle("Settings")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .confirmationAction) {
                Button("Done") { dismiss() }
            }
        }
    }

    private func thresholdRow(
        title: String,
        value: Binding<Double>,
        range: ClosedRange<Double>
    ) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack {
                Text(title)
                Spacer()
                Text(formatted(value.wrappedValue))
                    .monospacedDigit()
                    .foregroundStyle(.secondary)
            }
            Slider(value: value, in: range, step: ACWRThresholds.minimumSeparation)
                .accessibilityLabel(title)
                .accessibilityValue(formatted(value.wrappedValue))
        }
    }

    private func formatted(_ value: Double) -> String {
        String(format: "%.2f", value)
    }
}

#Preview {
    NavigationStack {
        SettingsView(settings: RunGuardSettings(defaults: UserDefaults(suiteName: "preview")!))
    }
}

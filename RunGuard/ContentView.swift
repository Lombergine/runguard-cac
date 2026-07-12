//
//  ContentView.swift
//  RunGuard
//
//  Created by jyoti agarwal on 7/12/26.
//

import SwiftUI

struct ContentView: View {
    @State private var viewModel = HealthAuthorizationViewModel()

    var body: some View {
        VStack(spacing: 16) {
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
                statusView(
                    systemImage: "heart.text.square",
                    title: "Connect Apple Health",
                    message: "RunGuard reads your running workouts to calculate training load and injury risk. Your data never leaves this device."
                )
                Button("Allow Health Access") {
                    Task { await viewModel.requestAccess() }
                }
                .buttonStyle(.borderedProminent)

            case .requesting:
                ProgressView("Waiting for Health permission…")

            case .requested:
                statusView(
                    systemImage: "checkmark.circle",
                    title: "Health Connected",
                    message: "Your runs will appear here."
                )
                // Apple hides read grant/deny from apps, so this is the only
                // honest way to help users who tapped "Don't Allow".
                Text("Runs missing? Check that RunGuard is allowed in the Health app: Profile → Privacy → Apps → RunGuard.")
                    .font(.footnote)
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.center)

            case .failed(let message):
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
        }
        .padding()
        .task {
            // Runs when the view first appears; decides which state to show.
            await viewModel.refreshStatus()
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

#Preview {
    ContentView()
}

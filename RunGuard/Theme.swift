//
//  Theme.swift
//  RunGuard
//
//  The "Pulse" visual system, ported from the RunGuard coach platform's
//  theme (palette.ts / type.ts / visual-spec.md): a near-black ground with
//  surfaces that get lighter with elevation, one coral accent, status colour
//  only on status glyphs, no shadows, no tinted card fills, 12pt cards,
//  rounded display type for words and monospaced tabular figures for every
//  number. Light theme is the designed twin, not an inversion: glyph colours
//  are re-picked for contrast on white.
//
//  Added for RunGuard 2.0 (CAC 2026), AI-assisted, see DISCLOSURE.md
//

import SwiftUI
import UIKit

extension UIColor {
    convenience init(rgb: UInt32) {
        self.init(
            red: CGFloat((rgb >> 16) & 0xFF) / 255,
            green: CGFloat((rgb >> 8) & 0xFF) / 255,
            blue: CGFloat(rgb & 0xFF) / 255,
            alpha: 1
        )
    }
}

enum Pulse {
    /// One token, resolved per appearance.
    private static func dyn(_ light: UInt32, _ dark: UInt32) -> Color {
        Color(UIColor { trait in
            UIColor(rgb: trait.userInterfaceStyle == .dark ? dark : light)
        })
    }

    // Surfaces
    static let bg = dyn(0xF4F6F9, 0x0A0D12)
    static let card = dyn(0xFFFFFF, 0x131923)
    static let well = dyn(0xEDEFF4, 0x0F141C)
    static let surface3 = dyn(0xE3E7EE, 0x1E2736)
    static let control = dyn(0xFFFFFF, 0x232D3F)

    // Ink
    static let ink = dyn(0x10141B, 0xF4F6FA)
    static let ink2 = dyn(0x414A57, 0xB9C2D0)
    static let muted = dyn(0x5D6673, 0x8A94A6)

    // Rules. In dark the card edge is the card's own colour: present, invisible.
    static let rule = dyn(0xDFE4EB, 0x232B38)
    static let cardEdge = dyn(0xE3E8EF, 0x131923)
    static let ruleStrong = dyn(0xC7CED9, 0x2E3849)

    // Coral is you. Fill vs. text are separate on purpose (2.6:1 on white).
    static let brand = dyn(0xFF5A36, 0xFF5A36)
    static let brandText = dyn(0xC2410C, 0xFF7A5C)
    static let onBrand = Color(UIColor(rgb: 0x25100A))

    // Semantic. Verdicts only, never chrome.
    static let ok = dyn(0x14B8A6, 0x2DD4BF)
    static let okText = dyn(0x0F766E, 0x2DD4BF)
    static let watch = dyn(0xF59E0B, 0xFFB020)
    static let watchText = dyn(0xA16207, 0xFFB020)
    static let serious = dyn(0xF97316, 0xFF8A3D)
    static let seriousText = dyn(0xC2410C, 0xFF8A3D)
    static let unusual = dyn(0xEF4444, 0xFF4D6D)
    static let unusualText = dyn(0xB91C1C, 0xFF4D6D)
    static let series1 = dyn(0x8B7CFF, 0x8B7CFF)
    static let series1Text = dyn(0x6D28D9, 0x8B7CFF)
    /// Absent. Always paired with a dash and a label, never colour alone.
    static let unknown = dyn(0x5F6875, 0x7D8797)

    // Chart furniture
    static let grid = dyn(0xE7EBF1, 0x1B2230)
    static let baseline = dyn(0xC7CED9, 0x2E3849)

    // Type. Rounded faces stand in for Outfit/Nunito; every numeral is mono.
    static func display(_ size: CGFloat, _ weight: Font.Weight = .bold) -> Font {
        .system(size: size, weight: weight, design: .rounded)
    }
    static func body(_ size: CGFloat = 15, _ weight: Font.Weight = .medium) -> Font {
        .system(size: size, weight: weight, design: .rounded)
    }
    static func mono(_ size: CGFloat, _ weight: Font.Weight = .medium) -> Font {
        .system(size: size, weight: weight, design: .monospaced)
    }
    static let micro: Font = .system(size: 11, weight: .bold, design: .rounded)

    static let radius: CGFloat = 12
    static let pad: CGFloat = 16
}

/// Micro-label: 11pt, uppercase, +0.9 tracking, muted. Eyebrows and axis heads.
struct Micro: View {
    let text: String
    var color: Color = Pulse.muted
    init(_ text: String, color: Color = Pulse.muted) { self.text = text; self.color = color }
    var body: some View {
        Text(text.uppercased())
            .font(Pulse.micro)
            .tracking(0.9)
            .foregroundStyle(color)
            .monospacedDigit()
    }
}

/// A raised surface: card colour, 1.5pt edge (visible in light, invisible in
/// dark), 12pt radius, no shadow.
struct PulseCardStyle: ViewModifier {
    func body(content: Content) -> some View {
        content
            .padding(Pulse.pad)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(Pulse.card, in: RoundedRectangle(cornerRadius: Pulse.radius, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: Pulse.radius, style: .continuous)
                    .strokeBorder(Pulse.cardEdge, lineWidth: 1.5)
            )
    }
}

extension View {
    func pulseCard() -> some View { modifier(PulseCardStyle()) }

    /// The list-row chrome every card on the home screen shares.
    func pulseRow() -> some View {
        self
            .listRowInsets(EdgeInsets(top: 6, leading: 16, bottom: 6, trailing: 16))
            .listRowBackground(Color.clear)
            .listRowSeparator(.hidden)
    }
}

/// A measured value as an arc. `fraction == nil` is the absent state: a
/// dashed ring with whatever the caller puts in the middle, by convention a
/// dash. A blank must never read as a low-but-present value.
struct Ring<Content: View>: View {
    let fraction: Double?
    let color: Color
    var size: CGFloat = 96
    var lineWidth: CGFloat = 9
    @ViewBuilder let content: () -> Content

    var body: some View {
        ZStack {
            if let fraction {
                Circle().stroke(Pulse.rule, lineWidth: lineWidth)
                Circle()
                    .trim(from: 0, to: min(max(fraction, 0), 1))
                    .stroke(color, style: StrokeStyle(lineWidth: lineWidth, lineCap: .round))
                    .rotationEffect(.degrees(-90))
            } else {
                Circle().stroke(Pulse.unknown, style: StrokeStyle(lineWidth: max(2, lineWidth / 3), dash: [3, 4]))
            }
            content()
                .padding(lineWidth + 2)
        }
        .frame(width: size, height: size)
    }
}

extension TrainingZone {
    /// Glyph colour for the zone. Text-safe tokens, since this lands on words.
    var pulseText: Color {
        switch self {
        case .optimal: Pulse.okText
        case .undertraining, .caution: Pulse.watchText
        case .highRisk: Pulse.unusualText
        }
    }
}

import { ImageResponse } from "next/og";

/**
 * The link preview card.
 *
 * Until this file existed, sharing runguard anywhere — iMessage, a Slack DM to
 * a coach, a post, an email to a judge — rendered as a bare grey URL with no
 * image and no title. That is the whole of a link's first impression, and it
 * was the one surface nobody looks at because you never see it from inside the
 * site.
 *
 * 1200×630 is the one size every platform accepts (1.91:1). Everything that
 * matters sits inside ~60px of padding, because each platform crops differently
 * and mobile crops hardest. Type is deliberately enormous: this is read as a
 * thumbnail a couple of hundred pixels wide, so anything under ~40px here is
 * decoration, not communication.
 *
 * Generated rather than a checked-in PNG, so it can never drift out of sync
 * with the headline it quotes.
 */

export const alt =
  "RunGuard — see the injury coming before it happens. Athlete monitoring for high school running teams.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "62px 68px",
          background: "linear-gradient(150deg, #fdf3e3 0%, #faf7f2 55%, #f7ecdc 100%)",
          fontFamily: "sans-serif",
          position: "relative",
        }}
      >
        {/* ember wash, top-right — the signature colour doing the work a photo
            would otherwise have to do */}
        <div
          style={{
            position: "absolute",
            top: -240,
            right: -160,
            width: 760,
            height: 620,
            borderRadius: 9999,
            background:
              "radial-gradient(circle at 50% 50%, rgba(249,115,22,0.24), rgba(249,115,22,0) 68%)",
            display: "flex",
          }}
        />

        {/* wordmark */}
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <div
            style={{
              width: 54,
              height: 54,
              borderRadius: 15,
              background: "linear-gradient(135deg, #fbbf24 0%, #f59e0b 45%, #f97316 100%)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <svg width="30" height="30" viewBox="0 0 24 24" fill="none">
              <path
                d="M5 13l4 4L19 7"
                stroke="#231a09"
                strokeWidth="3.2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>
          <div style={{ display: "flex", fontSize: 34, fontWeight: 700, color: "#221d15", letterSpacing: -1 }}>
            RunGuard
          </div>
        </div>

        {/* headline — the same promise the page makes, so the card and the
            landing never say two different things */}
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div
            style={{
              display: "flex",
              fontSize: 82,
              fontWeight: 800,
              color: "#221d15",
              letterSpacing: -3.4,
              lineHeight: 1.02,
            }}
          >
            See the injury coming
          </div>
          <div
            style={{
              display: "flex",
              fontSize: 82,
              fontWeight: 800,
              color: "#ea580c",
              letterSpacing: -3.4,
              lineHeight: 1.02,
              marginTop: 4,
            }}
          >
            before it happens.
          </div>
          <div
            style={{
              display: "flex",
              fontSize: 27,
              color: "#55503f",
              marginTop: 26,
              letterSpacing: -0.4,
            }}
          >
            Athlete monitoring for high school running teams.
          </div>
        </div>

        {/* proof strip — the three numbers, sized to survive a thumbnail */}
        <div style={{ display: "flex", alignItems: "center", gap: 46 }}>
          <Stat n="1.5M" label="high school runners" />
          <Dot />
          <Stat n="38%" label="injured every season" />
          <Dot />
          <Stat n="60–70%" label="from training errors" />
        </div>
      </div>
    ),
    size
  );
}

function Stat({ n, label }: { n: string; label: string }) {
  return (
    <div style={{ display: "flex", flexDirection: "column" }}>
      <div style={{ display: "flex", fontSize: 44, fontWeight: 800, color: "#d97706", letterSpacing: -1.6 }}>
        {n}
      </div>
      <div style={{ display: "flex", fontSize: 20, color: "#94897b", marginTop: 2 }}>{label}</div>
    </div>
  );
}

function Dot() {
  return (
    <div
      style={{
        width: 6,
        height: 6,
        borderRadius: 9999,
        background: "#d8d0c0",
        display: "flex",
      }}
    />
  );
}

export function GET() {
  return Response.json({
    name: "RunGuard",
    short_name: "RunGuard",
    description: "Injury prevention for high school running teams",
    start_url: "/athlete",
    display: "standalone",
    background_color: "#faf7f2",
    theme_color: "#faf7f2",
    icons: [
      {
        src: "/icon.svg",
        sizes: "any",
        type: "image/svg+xml",
      },
    ],
  });
}

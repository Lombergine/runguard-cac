import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["better-sqlite3"],

  /**
   * Pin the workspace root.
   *
   * Without this, Turbopack walks up looking for a lockfile, finds the stray
   * one sitting in ~/Downloads, and decides that is the project root — then
   * prints a multi-line warning on every dev start and every build. Harmless,
   * but it is the first thing on screen when the terminal is visible during a
   * demo, and "⚠ Warning" reads badly over someone's shoulder.
   *
   * process.cwd(), not __dirname: this config is loaded as an ES module, where
   * __dirname does not exist, and referencing it would throw before the server
   * ever starts. npm scripts always run from the package directory, which is
   * exactly the root we want.
   */
  turbopack: {
    root: process.cwd(),
  },
};

export default nextConfig;

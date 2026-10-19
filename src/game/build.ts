declare const __GAME_BUILD_ID__: string;

export const GAME_BUILD_ID =
  typeof __GAME_BUILD_ID__ === "string" ? __GAME_BUILD_ID__ : "local development";

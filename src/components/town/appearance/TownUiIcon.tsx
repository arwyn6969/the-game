import { appPath } from "@/lib/app-path";

export type TownUiIconName =
  | "journal"
  | "inventory"
  | "map"
  | "library"
  | "wallets"
  | "stamp"
  | "help"
  | "people"
  | "speech"
  | "clock"
  | "coin"
  | "save"
  | "restore";

/** Decorative pixel artwork; the adjacent live control text supplies its name. */
export function TownUiIcon({ name, className = "" }: { name: TownUiIconName; className?: string }) {
  return (
    <svg
      className={`town-ui-icon ${className}`.trim()}
      width={24}
      height={24}
      viewBox="0 0 24 24"
      fill="currentColor"
      shapeRendering="crispEdges"
      aria-hidden="true"
      focusable="false"
    >
      <use href={`${appPath("/game/ui/retro-icons.svg")}#${name}`} />
    </svg>
  );
}

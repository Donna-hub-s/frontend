// Icônes de l'espace de travail : trait 1,6 px, 20×20, couleur héritée (currentColor).
import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement> & { size?: number };

function Icon({ size = 20, children, ...props }: IconProps) {
  return (
    <svg
      viewBox="0 0 20 20"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      {...props}
    >
      {children}
    </svg>
  );
}

export const ComposeIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M9 3.5H5.5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h9a2 2 0 0 0 2-2V11" />
    <path d="M14.6 3.2a1.7 1.7 0 0 1 2.4 2.4l-6.3 6.3-3.1.7.7-3.1 6.3-6.3Z" />
  </Icon>
);
export const SearchIcon = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="9" cy="9" r="5.2" />
    <path d="m13 13 3.5 3.5" />
  </Icon>
);
export const ChatIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M4 5.5A2 2 0 0 1 6 3.5h8a2 2 0 0 1 2 2V12a2 2 0 0 1-2 2H9l-3.5 2.5V14H6a2 2 0 0 1-2-2V5.5Z" />
  </Icon>
);
export const MoreIcon = (p: IconProps) => (
  <Icon {...p} fill="currentColor" stroke="none">
    <circle cx="5" cy="10" r="1.4" />
    <circle cx="10" cy="10" r="1.4" />
    <circle cx="15" cy="10" r="1.4" />
  </Icon>
);
export const PaperclipIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="m15.5 9.5-5.7 5.7a3.5 3.5 0 0 1-5-5l6.2-6.1a2.3 2.3 0 0 1 3.3 3.3l-6.2 6.1a1.2 1.2 0 0 1-1.7-1.7l5.6-5.6" />
  </Icon>
);
export const SendIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M10 15.5V4.5M5.5 9 10 4.5 14.5 9" />
  </Icon>
);
export const StopIcon = (p: IconProps) => (
  <Icon {...p} fill="currentColor" stroke="none">
    <rect x="5.5" y="5.5" width="9" height="9" rx="1.5" />
  </Icon>
);
export const CheckIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="m4.5 10.5 3.5 3.5 7.5-8" />
  </Icon>
);
export const CloseIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="m5.5 5.5 9 9m0-9-9 9" />
  </Icon>
);
export const MenuIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M3.5 6h13M3.5 10h13M3.5 14h13" />
  </Icon>
);
export const ChevronIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="m6 8 4 4 4-4" />
  </Icon>
);
export const FileIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M11.5 3H6.5a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h7a2 2 0 0 0 2-2V7l-4-4Z" />
    <path d="M11.5 3v4h4" />
  </Icon>
);
export const LogoutIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M8 16.5H5.5a2 2 0 0 1-2-2v-9a2 2 0 0 1 2-2H8M12.5 13.5 16 10l-3.5-3.5M16 10H7.5" />
  </Icon>
);
export const PanelIcon = (p: IconProps) => (
  <Icon {...p}>
    <rect x="3.5" y="4" width="13" height="12" rx="2" />
    <path d="M12.5 4v12" />
  </Icon>
);
export const GlobeIcon = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="10" cy="10" r="6.5" />
    <path d="M3.5 10h13M10 3.5c1.8 1.8 2.7 4 2.7 6.5s-.9 4.7-2.7 6.5c-1.8-1.8-2.7-4-2.7-6.5s.9-4.7 2.7-6.5Z" />
  </Icon>
);
export const ArrowReturnIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M15.5 5v4.5a2 2 0 0 1-2 2H5M8 8.5 5 11.5l3 3" />
  </Icon>
);

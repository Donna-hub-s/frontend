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
export const FolderIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M3 6a1.5 1.5 0 0 1 1.5-1.5h3.4l1.4 1.8h6.2A1.5 1.5 0 0 1 17 7.8v6.7A1.5 1.5 0 0 1 15.5 16h-11A1.5 1.5 0 0 1 3 14.5V6Z" />
  </Icon>
);
export const SettingsIcon = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="10" cy="10" r="2.6" />
    <path d="M10 3.5v1.7M10 14.8v1.7M16.5 10h-1.7M5.2 10H3.5M14.5 5.5l-1.2 1.2M6.7 13.3l-1.2 1.2M14.5 14.5l-1.2-1.2M6.7 6.7 5.5 5.5" />
  </Icon>
);
export const PlusIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M10 4.5v11M4.5 10h11" />
  </Icon>
);
export const UsersIcon = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="7.3" cy="7" r="2.3" />
    <path d="M2.5 16c0-2.5 2.1-4 4.8-4s4.8 1.5 4.8 4" />
    <circle cx="14" cy="6.8" r="1.9" />
    <path d="M12.8 9.2c1.9.2 3.7 1.5 3.7 3.7" />
  </Icon>
);
export const MailIcon = (p: IconProps) => (
  <Icon {...p}>
    <rect x="3" y="4.5" width="14" height="11" rx="1.8" />
    <path d="m3.5 5.5 6.5 5 6.5-5" />
  </Icon>
);
export const PencilIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M13.5 3.5 16.5 6.5 6.8 16.2 3 17l.8-3.8L13.5 3.5Z" />
  </Icon>
);
export const TrashIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M4 6.5h12M8 6.5V4.8a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v1.7M5.5 6.5l.6 8.3a1.5 1.5 0 0 0 1.5 1.4h4.8a1.5 1.5 0 0 0 1.5-1.4l.6-8.3" />
  </Icon>
);
export const UploadIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M10 13.5V4.5M6 8.5 10 4.5 14 8.5" />
    <path d="M4.5 14.5v1a2 2 0 0 0 2 2h7a2 2 0 0 0 2-2v-1" />
  </Icon>
);
export const LockIcon = (p: IconProps) => (
  <Icon {...p}>
    <rect x="4.5" y="9" width="11" height="8" rx="1.8" />
    <path d="M6.5 9V6.5a3.5 3.5 0 0 1 7 0V9" />
  </Icon>
);
export const MicIcon = (p: IconProps) => (
  <Icon {...p}>
    <rect x="7.5" y="2.5" width="5" height="9" rx="2.5" />
    <path d="M4.5 9.5a5.5 5.5 0 0 0 11 0" />
    <path d="M10 15v2.5M7 17.5h6" />
  </Icon>
);
export const DownloadIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M10 3.5v9M6 8.5l4 4 4-4" />
    <path d="M4.5 14.5v1a2 2 0 0 0 2 2h7a2 2 0 0 0 2-2v-1" />
  </Icon>
);
export const UserIcon = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="10" cy="7" r="3.2" />
    <path d="M3.8 16.8a6.4 6.4 0 0 1 12.4 0" />
  </Icon>
);
export const BellIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M5.2 13.5V9a4.8 4.8 0 0 1 9.6 0v4.5l1.4 1.8H3.8l1.4-1.8Z" />
    <path d="M8.3 17.3a1.9 1.9 0 0 0 3.4 0" />
  </Icon>
);
export const SlidersIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M4 6h7M15 6h1M4 14h1M9 14h7" />
    <circle cx="13" cy="6" r="2" />
    <circle cx="7" cy="14" r="2" />
  </Icon>
);
export const PlugIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M7.5 3v3.5M12.5 3v3.5M5.5 6.5h9v2.8a4.5 4.5 0 0 1-9 0V6.5ZM10 13.8V17" />
  </Icon>
);
export const ExternalIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M11.5 3.5h5v5M16.5 3.5 9.5 10.5" />
    <path d="M14.5 11.5v3a2 2 0 0 1-2 2h-7a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3" />
  </Icon>
);
export const ShieldIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M10 2.8 16 5v4.3c0 4-2.5 7-6 8.7-3.5-1.7-6-4.7-6-8.7V5l6-2.2Z" />
    <path d="M7.3 10 9.2 11.9 12.7 8.2" />
  </Icon>
);
export const LaptopIcon = (p: IconProps) => (
  <Icon {...p}>
    <rect x="4" y="4.5" width="12" height="8" rx="1.2" />
    <path d="M2.5 16h15M8.5 16v-1.5M11.5 16v-1.5" />
  </Icon>
);
export const KeyIcon = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="7" cy="13" r="3.3" />
    <path d="M9.3 10.7 15.5 4.5M13 7l2 2M15.5 4.5 17.5 6.5" />
  </Icon>
);

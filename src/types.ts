export type TeamSide = "left" | "right";
export type CardBackground = "transparent" | "cloud" | "rectangle";
export type CaptureMode = TeamSide | "overlay" | "room";
export type RoomDesignMode = "competition" | "free";
export type RuntimeCacheLevel = "normal" | "warning" | "critical" | "cleaning";
export type RoomTextRole =
  | "title"
  | "player-left"
  | "player-right"
  | "score-left"
  | "score-right"
  | "custom";
export type RoomTextAlign = "left" | "center" | "right";
export type RoomTextFillStyle = "solid" | "s3-lead-prism";
export type RoomGuideMode = "center" | "safe";
export type TeamLayoutMode = "curved" | "vertical";
export type RoomPlayerBarPreset =
  | "s3-storybook"
  | "s3-prism-bookmark"
  | "s3-clover-hinge"
  | "classic"
  | "compact"
  | "player-score";

export interface DefeatFilterStyle {
  grayscale: number;
  opacity: number;
}

export interface SlotHealth {
  percent: number;
  visible?: boolean;
  source?: "manual" | "capture";
  confidence?: number;
  updatedAt?: string;
}

export interface HealthBarStyle {
  visible: boolean;
  showPercent: boolean;
  height: number;
  gap: number;
  widthMode: "name-label" | "card";
  healthyColor: string;
  warningColor: string;
  dangerColor: string;
  trackColor: string;
  textColor: string;
  autoDefeatAtZero: boolean;
}

export interface CaptureRegion {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface HealthCaptureMapping {
  side: TeamSide;
  activeSlotIndex: number;
  region: CaptureRegion;
  avatarRegion?: CaptureRegion;
  avatarAssist?: boolean;
  enabled: boolean;
}

export interface HealthCaptureSettings {
  enabled: boolean;
  sourceId?: string;
  sampleIntervalMs: number;
  smoothing: number;
  minConfidence: number;
  mappings: HealthCaptureMapping[];
}

export interface LiveRosterState {
  projectId: string;
  health: Record<string, SlotHealth>;
  capture?: HealthCaptureSettings;
  updatedAt: string;
}

export interface ObsWindowStyle {
  width: number;
  height: number;
  alwaysOnTop: boolean;
  clickThrough: boolean;
}

export interface FloatingControlSettings {
  glassStrength: number;
  uiScale: number;
  alwaysOnTop: boolean;
  liveSync: boolean;
}

export interface NameLabelStyle {
  presetId: string;
  fontFamily: string;
  fontSize: number;
  fontWeight: number;
  textColor: string;
  textShadowColor: string;
  backgroundTop: string;
  backgroundBottom: string;
  borderColor: string;
  borderWidth: number;
  shadowColor: string;
  height: number;
  minWidth: number;
  horizontalPadding: number;
  verticalGap: number;
}

export interface TeamLayoutStyle {
  mode?: TeamLayoutMode;
  centerGap: number;
  verticalOffset: number;
}

export interface RoomBackgroundStyle {
  visible: boolean;
  imagePath?: string;
  fit: "cover" | "contain";
  opacity: number;
  dim: number;
  edgeBlur: number;
}

export interface RoomTextBox {
  id: string;
  role: RoomTextRole;
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
  fontFamily: string;
  fontSize: number;
  fontWeight: number;
  color: string;
  fillStyle?: RoomTextFillStyle;
  strokeEnabled?: boolean;
  strokeColor: string;
  strokeWidth: number;
  shadowColor: string;
  background: string;
  backgroundOpacity: number;
  borderColor: string;
  borderWidth: number;
  radius: number;
  align: RoomTextAlign;
  opacity: number;
}

export interface RoomTitleImageStyle {
  visible: boolean;
  imagePath?: string;
  x: number;
  y: number;
  width: number;
  height: number;
  fit: "contain" | "cover";
  opacity: number;
}

export interface RoomPlayerBarStyle {
  visible: boolean;
  leftVisible: boolean;
  rightVisible: boolean;
  scoreVisible: boolean;
  preset: RoomPlayerBarPreset;
  boText: string;
  widthScale?: number;
  textScale?: number;
  leftAvatarPath?: string;
  rightAvatarPath?: string;
  avatarVisible: boolean;
  animation: boolean;
}

export interface RoomBroadcastHud {
  titleImage: RoomTitleImageStyle;
  playerBar: RoomPlayerBarStyle;
}

export interface RoomGuideStyle {
  visible: boolean;
  mode: RoomGuideMode;
}

export interface RoomDesign {
  mode: RoomDesignMode;
  background: RoomBackgroundStyle;
  textBoxes: RoomTextBox[];
  hud?: RoomBroadcastHud;
  guides?: RoomGuideStyle;
}

export interface Resolution {
  width: number;
  height: number;
}

export interface PetAsset {
  id: string;
  name: string;
  aliases: string[];
  element?: string;
  imagePath: string;
  avatarPath?: string;
  baseName?: string;
  chainKey?: string;
  formLabel?: string;
  sourceNote?: string;
  updatedAt: string;
}

export interface RosterSlot {
  name: string;
  assetId?: string;
  formAssetId?: string;
  element?: string;
  defeated?: boolean;
}

export interface RosterTeam {
  label: string;
  slots: RosterSlot[];
}

export interface RosterStyle {
  resolution: Resolution;
  cardGap: number;
  imageScale: number;
  cardBackground: CardBackground;
  cardPlateOutlineWidth?: number;
  cardPlateScale?: number;
  cardPlateYOffset?: number;
  showElementIcon: boolean;
  defeatFilter?: DefeatFilterStyle;
  obsWindow?: ObsWindowStyle;
  teamLayout?: TeamLayoutStyle;
  nameLabel?: Partial<NameLabelStyle>;
  healthBar?: Partial<HealthBarStyle>;
}

export interface AssetLibrarySettings {
  showShiny: boolean;
}

export interface RosterProject {
  id: string;
  name: string;
  defaultsVersion?: number;
  teams: Record<TeamSide, RosterTeam>;
  style: RosterStyle;
  room?: RoomDesign;
  assetLibrary?: AssetLibrarySettings;
  floatingControl?: FloatingControlSettings;
}

export interface ProjectCollection {
  activeProjectId: string;
  projects: RosterProject[];
}

export interface ProjectPresetTransferResult {
  filePath: string;
  project?: RosterProject;
}

export interface ResolvedRosterSlot extends RosterSlot {
  asset?: PetAsset;
  resolvedElement?: string;
  formOptions: PetAsset[];
  defeated: boolean;
  health: SlotHealth;
}

export interface ResolvedRosterTeam {
  label: string;
  slots: ResolvedRosterSlot[];
}

export interface ResolvedRosterProject {
  id: string;
  name: string;
  teams: Record<TeamSide, ResolvedRosterTeam>;
  style: RosterStyle;
  room?: RoomDesign;
  missingNames: Record<TeamSide, string[]>;
  assets: PetAsset[];
}

export interface AppState {
  project: RosterProject;
  projects: RosterProject[];
  activeProjectId: string;
  assets: PetAsset[];
  liveState?: LiveRosterState;
  dataDir: string;
  exportDir: string;
  serverUrl: string;
}

export interface ImportResult {
  imported: PetAsset[];
  skipped: string[];
  duplicates: string[];
  warnings: string[];
}

export interface RuntimeCachePolicy {
  warningPrivateMb: number;
  criticalPrivateMb: number;
  criticalWorkingSetMb: number;
  minCleanupIntervalMs: number;
  monitorIntervalMs: number;
}

export interface RuntimeCacheSample {
  totalPrivateMb: number;
  totalWorkingSetMb: number;
  processCount: number;
  rendererCount: number;
  largestProcessMb: number;
}

export interface RuntimeCacheStatus extends RuntimeCacheSample {
  warningPrivateMb: number;
  criticalPrivateMb: number;
  criticalWorkingSetMb: number;
  level: RuntimeCacheLevel;
  cleanupInProgress: boolean;
  cleanupCount: number;
  updatedAt: string;
  lastCleanupAt?: string;
  lastCleanupReason?: string;
  lastError?: string;
}

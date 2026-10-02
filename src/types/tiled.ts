// Minimal shapes of Tiled JSON maps as the game uses them. Types only.

export type TiledTileLayer = { name: string; type: string; data?: number[]; width?: number; height?: number };
export type TiledTilesetRef = { name: string; firstgid: number; tilecount?: number; [k: string]: unknown };
export type TiledMapJson = { width: number; height: number; layers: TiledTileLayer[]; tilesets: TiledTilesetRef[]; [k: string]: unknown };

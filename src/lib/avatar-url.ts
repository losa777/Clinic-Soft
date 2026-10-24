/**
 * პროფილის ფოტოს მისამართი (ბრაუზერი და სერვერი). v — ვერსია: ფოტოს შეცვლისას მისამართი იცვლება,
 * ამიტომ ბრაუზერი ძველს ქეშიდან აღარ აჩვენებს (API — Cache-Control: immutable).
 */
export const AVATAR_SIZES = [64, 256] as const;
export type AvatarSize = (typeof AVATAR_SIZES)[number];

export const avatarUrl = (userId: number, version: number, size: AvatarSize = 64) => `/api/avatars/${userId}?v=${version}&s=${size}`;

/** ატვირთვის ლიმიტები (ფორმა და სერვერი). */
export const AVATAR_MAX_BYTES = 5 * 1024 * 1024;
export const AVATAR_ACCEPT = "image/jpeg,image/png,image/webp";

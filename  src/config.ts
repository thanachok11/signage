export const SIGNAGE_URL = "https://kiosk-pos.aicard.work/Queue?shopId=8445453f-23dd-4b39-baf0-124a01c86063&branchId=7f4bc846-28fa-460e-ab4a-dc449f69b05f";

// รีโหลดกันค้างทุกกี่ ms (เช่น 5 นาที)
export const HARD_RELOAD_INTERVAL_MS = 5 * 60 * 1000;

// ถ้าโหลดพัง ให้รอกี่ ms แล้วลองใหม่
export const RETRY_DELAY_MS = 3000;

// ขนาดป้ายเป้าหมาย
export const TARGET_W = 1420;
export const TARGET_H = 1080;
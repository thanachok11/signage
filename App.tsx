import * as React from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
import { WebView } from "react-native-webview";
import { VideoView, useVideoPlayer } from "expo-video";

import {
    HARD_RELOAD_INTERVAL_MS,
    RETRY_DELAY_MS,
    // แนะนำให้ย้าย SIGNAGE_URL ออก หรือเก็บไว้เป็น fallback
    SIGNAGE_URL,
} from "./ src/config";

/** ====== CONFIG ที่ต้องตั้ง ====== */
const DEVICE_ID = "DEVICE_001";

// ต้องเป็น URL หลังบ้านที่ deploy แล้ว (ห้าม localhost บนเครื่องจริง)
// ตัวอย่าง: https://your-api.onrender.com
const SIGNAGE_API_BASE = "https://signage-config-api.onrender.com";

// polling config ทุกกี่ ms (แนะนำ 3000–10000)
const CONFIG_POLL_MS = 5000;

// fallback video (ถ้า backend ยังไม่ส่งมา)
const FALLBACK_VIDEO_URL =
    "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4";

/** =============================== */

type UiState = "loading" | "ready" | "error";
type LayoutMode = "split" | "web_only" | "video_only";

type RemoteConfig = {
    deviceId: string;
    exists?: boolean;
    webUrl?: string;
    videoUrl?: string;
    layout?: LayoutMode;
    updatedAt?: number;
};

export default function App() {
    const webRef = useRef<WebView>(null);

    const [uiState, setUiState] = useState<UiState>("loading");
    const [reloadKey, setReloadKey] = useState(0);
    const [lastError, setLastError] = useState<string | null>(null);

    // ✅ config state (มาจาก backend/db)
    const [webUrl, setWebUrl] = useState<string>(SIGNAGE_URL);
    const [videoUrl, setVideoUrl] = useState<string>(FALLBACK_VIDEO_URL);
    const [layout, setLayout] = useState<LayoutMode>("split");

    // ใช้ key บังคับให้ VideoView รีเฟรชเมื่อ videoUrl เปลี่ยน
    const player = useVideoPlayer(videoUrl, (p) => {
        p.loop = true;
        p.muted = true;
        p.play();
    });

    const configUrl = useMemo(() => {
        return `${SIGNAGE_API_BASE}/signage/config?deviceId=${encodeURIComponent(
            DEVICE_ID
        )}`;
    }, []);

    // ====== 1) Poll config จากหลังบ้าน (หลังบ้านไปอ่าน DB ให้) ======
    useEffect(() => {
        let alive = true;

        async function fetchConfig() {
            try {
                const res = await fetch(configUrl, {
                    headers: { "Cache-Control": "no-cache" },
                });

                if (!res.ok) throw new Error(`CONFIG_HTTP_${res.status}`);

                const cfg = (await res.json()) as RemoteConfig;
                if (!alive) return;

                // normalize
                const nextWeb = (cfg.webUrl || "").trim();
                const nextVideo = (cfg.videoUrl || "").trim();
                const nextLayout: LayoutMode =
                    cfg.layout === "web_only" || cfg.layout === "video_only"
                        ? cfg.layout
                        : "split";

                // update layout
                setLayout(nextLayout);

                // update video url (ถ้าไม่ส่งมา อย่าทับ fallback)
                if (nextVideo && nextVideo !== videoUrl) {
                    setVideoUrl(nextVideo);
                }

                // update web url + reload webview ถ้าเปลี่ยนจริง
                if (nextWeb && nextWeb !== webUrl) {
                    setWebUrl(nextWeb);
                    setReloadKey((k) => k + 1);
                }
            } catch (e: any) {
                // ถ้าต้องการให้เงียบ ๆ ก็ปล่อยไว้
                // หรือจะโชว์ error overlay ก็ได้ (แล้วแต่คุณ)
                console.log("FETCH_CONFIG_FAIL", e?.message ?? String(e));
            }
        }

        // ยิงครั้งแรกทันที + ตั้ง interval
        void fetchConfig();
        const t = setInterval(fetchConfig, CONFIG_POLL_MS);

        return () => {
            alive = false;
            clearInterval(t);
        };
    }, [configUrl, webUrl, videoUrl]);

    // ====== 2) hard reload webview กันค้าง ======
    useEffect(() => {
        const t = setInterval(() => {
            // ถ้า layout ไม่โชว์ web ก็ไม่ต้อง reload web
            if (layout !== "video_only") {
                setReloadKey((k) => k + 1);
            }
        }, HARD_RELOAD_INTERVAL_MS);
        return () => clearInterval(t);
    }, [layout]);

    // ====== 3) retry webview เมื่อ error ======
    useEffect(() => {
        if (uiState !== "error") return;

        const t = setTimeout(() => {
            setReloadKey((k) => k + 1);
            setUiState("loading");
            setLastError(null);
        }, RETRY_DELAY_MS);

        return () => clearTimeout(t);
    }, [uiState]);

    const showVideo = layout !== "web_only";
    const showWeb = layout !== "video_only";

    return (
        <View style={styles.root}>
            <View style={styles.row}>
                {/* LEFT : VIDEO */}
                <View style={[styles.left, !showVideo && styles.hidden]}>
                    {showVideo && (
                        <VideoView
                            key={videoUrl} // บังคับ remount เมื่อ url เปลี่ยน
                            style={styles.video}
                            player={player}
                            allowsFullscreen={false}
                            allowsPictureInPicture={false}
                        />
                    )}
                </View>

                {/* RIGHT : WEBVIEW */}
                <View style={[styles.right, !showWeb && styles.hidden]}>
                    {showWeb && (
                        <WebView
                            key={reloadKey}
                            ref={webRef}
                            source={{ uri: webUrl }}
                            style={styles.web}
                            javaScriptEnabled
                            domStorageEnabled
                            mixedContentMode="always"
                            onLoadStart={() => {
                                setUiState("loading");
                                setLastError(null);
                            }}
                            onLoadEnd={() => {
                                // กันกรณี error มาก่อนแล้ว onLoadEnd มาทับ
                                setUiState((s) => (s === "error" ? "error" : "ready"));
                            }}
                            onError={(e) => {
                                setUiState("error");
                                setLastError(
                                    e.nativeEvent?.description ?? "WEBVIEW_ERROR"
                                );
                            }}
                            onHttpError={(e) => {
                                setUiState("error");
                                setLastError(`HTTP_${e.nativeEvent.statusCode}`);
                            }}
                        />
                    )}

                    {/* overlay เฉพาะตอนมี web */}
                    {showWeb && (uiState === "loading" || uiState === "error") && (
                        <View style={styles.overlay}>
                            <Text style={styles.overlayTitle}>
                                {uiState === "loading" ? "Loading..." : "Connection error"}
                            </Text>

                            {lastError && <Text style={styles.overlaySub}>{lastError}</Text>}

                            <Pressable
                                onPress={() => {
                                    setReloadKey((k) => k + 1);
                                    setUiState("loading");
                                    setLastError(null);
                                }}
                                style={styles.btn}
                            >
                                <Text style={styles.btnText}>Reload</Text>
                            </Pressable>

                            {/* debug เล็กน้อย */}
                            <Text style={styles.debug}>
                                {DEVICE_ID} • {layout}
                            </Text>
                        </View>
                    )}
                </View>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    root: { flex: 1, backgroundColor: "#000" },
    row: { flex: 1, flexDirection: "row" },

    left: { flex: 1, backgroundColor: "#000" },
    right: { flex: 1, backgroundColor: "#000" },

    hidden: { width: 0, flex: 0 },

    video: { width: "100%", height: "100%" },
    web: { flex: 1, backgroundColor: "#000" },

    overlay: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: "rgba(0,0,0,0.7)",
        justifyContent: "center",
        alignItems: "center",
        gap: 10,
    },
    overlayTitle: { color: "#fff", fontSize: 18, fontWeight: "700" },
    overlaySub: { color: "#ccc", fontSize: 12 },

    btn: {
        marginTop: 6,
        paddingHorizontal: 14,
        paddingVertical: 8,
        borderRadius: 8,
        backgroundColor: "#fff",
    },
    btnText: { color: "#111", fontWeight: "700" },

    debug: { marginTop: 10, color: "#999", fontSize: 11 },
});
